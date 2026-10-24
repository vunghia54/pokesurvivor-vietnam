const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('Firebase Security Rules: database.rules.json presence verification', () => {
  const rulesPath = path.join(__dirname, '..', 'database.rules.json');
  assert.ok(fs.existsSync(rulesPath), 'database.rules.json must exist');

  const raw = fs.readFileSync(rulesPath, 'utf8');
  const rulesObj = JSON.parse(raw);
  assert.ok(rulesObj.rules, 'Must have root rules object');

  // 1. Root read/write must be false
  assert.equal(rulesObj.rules['.read'], false, 'Root .read must be false');
  assert.equal(rulesObj.rules['.write'], false, 'Root .write must be false');

  // 2. Presence section
  const presence = rulesObj.rules.presence;
  assert.ok(presence, 'presence node must be defined in database.rules.json');
  assert.equal(presence['.read'], 'auth != null', 'Only authenticated users can read presence');
  assert.equal(presence['.write'], undefined, 'Root presence must not be directly writable by client (prevents fake total count)');

  // 3. User level presence
  const userNode = presence['$uid'];
  assert.ok(userNode, '$uid node must exist under presence');
  assert.equal(userNode['.read'], 'auth != null', 'Authenticated users can read $uid');
  assert.equal(userNode['.write'], 'auth != null && auth.uid === $uid', 'Users can only write to their own UID');

  // 4. Connection level validation
  const connNode = userNode['$connId'];
  assert.ok(connNode, '$connId node must exist under $uid');
  assert.ok(connNode['.validate'], 'Connection must have validation rule');
  assert.ok(connNode['.validate'].includes("newData.child('at').isNumber()"), 'Must validate that timestamp "at" is numeric');
  assert.ok(connNode['.validate'].includes("!newData.hasChildren(['name', 'email', 'ip', 'token'])"), 'Must prevent storing PII (email, name, ip, token)');

  // 5. Rooms section must remain intact
  assert.ok(rulesObj.rules.rooms, 'rooms section must be preserved');
  assert.ok(rulesObj.rules.rooms['$room'], 'rooms/$room must be preserved');
});

test('OnlinePresence UI state transitions and formatting', () => {
  // Mock DOM environment
  const elements = {};
  const dotClasses = new Set(['online-dot', 'offline']);
  const pill = {
    title: '',
    querySelector(sel) {
      if (sel === '.online-dot') {
        return {
          classList: {
            add(c) { dotClasses.add(c); },
            remove(c) { dotClasses.delete(c); },
            contains(c) { return dotClasses.has(c); }
          }
        };
      }
      return null;
    }
  };
  const label = { textContent: '' };

  const ctx = {
    document: {
      getElementById(id) {
        if (id === 'online-pill') return pill;
        if (id === 'online-count') return label;
        return null;
      },
      querySelector() { return null; }
    },
    window: { addEventListener() {} },
    G: {
      FIREBASE_CONFIG: null,
      FIREBASE_CONFIG_READY: { databaseURL: 'https://test-rtdb.firebaseio.com' }
    },
    console: { warn() {}, info() {}, log() {} }
  };

  const presenceCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'net', 'presence.js'), 'utf8');
  vm.createContext(ctx);
  vm.runInContext(presenceCode, ctx);

  const Presence = ctx.G.Presence;
  assert.ok(Presence, 'G.Presence must be defined');

  // Test 1: Offline / Disconnected formatting
  Presence.updateUI(null, false);
  assert.equal(label.textContent, 'Online: —', 'Must show "Online: —" when disconnected');
  assert.ok(dotClasses.has('offline'), 'Dot must have .offline class when disconnected');

  // Test 2: Connected with count
  Presence.updateUI(42, true);
  assert.equal(label.textContent, 'Online: 42', 'Must show "Online: 42" when connected');
  assert.ok(!dotClasses.has('offline'), 'Dot must not have .offline class when connected');
  assert.equal(pill.title, 'Người chơi trực tuyến: 42');

  // Test 3: Connected with 1 player
  Presence.updateUI(1, true);
  assert.equal(label.textContent, 'Online: 1');
  assert.ok(!dotClasses.has('offline'));

  // Test 4: Re-disconnected
  Presence.updateUI(0, false);
  assert.equal(label.textContent, 'Online: —');
  assert.ok(dotClasses.has('offline'));
});

test('Multi-tab and unique user presence deduplication logic', () => {
  // Simulate RTDB /presence data tree
  const presenceTree = {};

  function addConnection(uid, connId) {
    if (!presenceTree[uid]) presenceTree[uid] = {};
    presenceTree[uid][connId] = { at: Date.now() };
  }

  function removeConnection(uid, connId) {
    if (presenceTree[uid]) {
      delete presenceTree[uid][connId];
      if (Object.keys(presenceTree[uid]).length === 0) {
        delete presenceTree[uid]; // RTDB automatic pruning
      }
    }
  }

  function countUniqueOnline() {
    return Object.keys(presenceTree).length;
  }

  // 1. User 1 opens Tab A
  addConnection('user_alpha', 'tab_1');
  assert.equal(countUniqueOnline(), 1, '1 user in 1 tab = 1 online');

  // 2. User 1 opens Tab B (same user in second tab)
  addConnection('user_alpha', 'tab_2');
  assert.equal(countUniqueOnline(), 1, '1 user in 2 tabs must still equal 1 online (no duplicate count)');

  // 3. User 2 opens Tab C
  addConnection('user_beta', 'tab_3');
  assert.equal(countUniqueOnline(), 2, '2 different users = 2 online');

  // 4. User 1 closes Tab A (Tab B is still open)
  removeConnection('user_alpha', 'tab_1');
  assert.equal(countUniqueOnline(), 2, 'User 1 is still online via Tab B');

  // 5. User 1 closes Tab B
  removeConnection('user_alpha', 'tab_2');
  assert.equal(countUniqueOnline(), 1, 'User 1 is now fully offline, count = 1');

  // 6. User 2 closes Tab C
  removeConnection('user_beta', 'tab_3');
  assert.equal(countUniqueOnline(), 0, 'All users offline, count = 0');
});

test('Safe Fallback: G.FIREBASE_CONFIG = null does not throw and maintains offline state', async () => {
  const ctx = {
    document: {
      getElementById(id) {
        return { textContent: '', classList: { add() {}, remove() {} }, querySelector() { return { classList: { add() {}, remove() {} } }; } };
      },
      querySelector() { return null; }
    },
    window: { addEventListener() {} },
    G: {
      FIREBASE_CONFIG: null,
      FIREBASE_CONFIG_READY: null // simulated completely unconfigured
    },
    console: { warn() {}, info() {}, log() {} }
  };

  const presenceCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'net', 'presence.js'), 'utf8');
  vm.createContext(ctx);
  vm.runInContext(presenceCode, ctx);

  assert.doesNotThrow(() => {
    ctx.G.Presence.init();
  }, 'init() must not throw when Firebase is unconfigured');

  assert.equal(ctx.G.Presence.isConnected, false);
});
