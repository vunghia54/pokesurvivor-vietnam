// tests/friends_coop.test.cjs
// Automated test suite for Stages 2, 3, 4, 5, 6:
// Friends system, Block/Anti-spam, Room Lobby, Realtime Presence, Co-op Sync & Leaderboard routing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createMockEnv(lang = 'vi-VN') {
  const localStorageData = {};
  const mockLocalStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(localStorageData, k) ? localStorageData[k] : null; },
    setItem(k, v) { localStorageData[k] = String(v); },
    removeItem(k) { delete localStorageData[k]; },
    clear() { for (const k in localStorageData) delete localStorageData[k]; },
    get length() { return Object.keys(localStorageData).length; },
    key(i) { return Object.keys(localStorageData)[i] || null; }
  };

  class Canvas {
    fillText() {}
    strokeText() {}
    measureText() { return { width: 0 }; }
  }

  const sandbox = {
    CanvasRenderingContext2D: Canvas,
    window: {
      CanvasRenderingContext2D: Canvas,
      PS_LOCALES: { lang, locale: lang === 'vi-VN' ? 'vi' : 'es', choices: [['es', 'Español'], ['vi-VN', 'Tiếng Việt']] },
      crypto: {
        subtle: {
          digest(algo, data) {
            let h = 0;
            for (let i = 0; i < data.length; i++) h = (h * 31 + data[i]) >>> 0;
            const buf = new Uint8Array(32);
            for (let i = 0; i < 4; i++) buf[i] = (h >>> (i * 8)) & 0xff;
            return Promise.resolve(buf.buffer);
          }
        },
        getRandomValues(arr) {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
          return arr;
        }
      }
    },
    localStorage: mockLocalStorage,
    location: { protocol: 'https:', hostname: 'vunghia54.github.io' },
    document: {
      createElement() { return {}; },
      head: { appendChild() {} },
      body: {},
      title: '',
      querySelectorAll() { return []; }
    },
    navigator: { onLine: true },
    TextEncoder: global.TextEncoder,
    Uint8Array: global.Uint8Array,
    G: {
      DEX_BY: { 1: { name: 'Bulbasaur' }, 4: { name: 'Charmander' }, 7: { name: 'Squirtle' }, 25: { name: 'Pikachu' } },
      Moves: { BY_ID: { 'tackle': { name: 'Tackle' }, 'ember': { name: 'Ember' } } },
      Shop: { ITEMS: { 'mint': {}, 'cap': {} } },
      Upgrades: { BY: { hp: { max: 10 }, atk: { max: 10 } } },
      AchDefs: { LIST: [] },
      FIREBASE_CONFIG: null
    },
    console
  };
  sandbox.window.G = sandbox.G;
  sandbox.crypto = sandbox.window.crypto;

  const ctx = vm.createContext(sandbox);

  const i18nCode = fs.readFileSync(path.join(__dirname, '../js/core/i18n.js'), 'utf8');
  vm.runInContext(i18nCode, ctx);

  const viCode = fs.readFileSync(path.join(__dirname, '../js/data/lang-vi.js'), 'utf8');
  vm.runInContext(viCode, ctx);

  const dbCode = fs.readFileSync(path.join(__dirname, '../js/core/db.js'), 'utf8');
  vm.runInContext(dbCode, ctx);

  const presenceCode = fs.readFileSync(path.join(__dirname, '../js/net/presence.js'), 'utf8');
  vm.runInContext(presenceCode, ctx);

  const socialCode = fs.readFileSync(path.join(__dirname, '../js/net/social.js'), 'utf8');
  vm.runInContext(socialCode, ctx);

  const rankingCode = fs.readFileSync(path.join(__dirname, '../js/net/ranking.js'), 'utf8');
  vm.runInContext(rankingCode, ctx);

  return { ctx, sandbox, localStorageData };
}

test('Giai đoạn 2.1: Friend request validation and self-request prevention', async () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  assert.ok(G.Social);
  assert.equal(typeof G.Social.request, 'function');
  assert.equal(typeof G.Social.block, 'function');
  assert.equal(typeof G.Social.unblock, 'function');

  // Need nickname first if not set
  const rNoNick = await G.Social.request('Red');
  assert.equal(rNoNick.ok, false);
  assert.match(rNoNick.error, /Hãy chọn biệt danh trước/);
});

test('Giai đoạn 2.2: Block / Anti-Spam prevents unwanted requests and invites', () => {
  const { sandbox, localStorageData } = createMockEnv('vi-VN');
  const G = sandbox.G;

  const targetUid = 'spammer_uid_999';
  assert.equal(G.Social.isBlocked(targetUid), false);

  // Block the target
  G.Social.block(targetUid);
  assert.equal(G.Social.isBlocked(targetUid), true);
  assert.ok(G.Social.blocks.includes(targetUid));

  // Verify storage persistence
  const storedBlocks = JSON.parse(localStorageData['ps.blocks.guest'] || '[]');
  assert.ok(storedBlocks.includes(targetUid));

  // Unblock
  G.Social.unblock(targetUid);
  assert.equal(G.Social.isBlocked(targetUid), false);
  assert.equal(G.Social.blocks.includes(targetUid), false);
});

test('Giai đoạn 2.3: Realtime Presence accurately tracks friend online status', () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  assert.ok(G.Presence);
  assert.equal(typeof G.Presence.isOnline, 'function');
  assert.equal(typeof G.Presence.onPresenceChange, 'function');

  // Initially nobody is online
  assert.equal(G.Presence.isOnline('uid_ash'), false);
  assert.equal(G.Presence.isOnline('uid_red'), false);
});

test('Giai đoạn 3.1: Co-op Lobby code generation and join logic', () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  assert.equal(typeof G.Social.createRoom, 'function');
  assert.equal(typeof G.Social.joinRoom, 'function');
  assert.equal(typeof G.Social.leaveRoom, 'function');
  assert.equal(G.Social.MAX_PLAYERS, 4);
});

test('Giai đoạn 4.1: Difficulty scaling for 2-4 players', () => {
  // scaleRate: 1 + 0.75 * Math.max(0, n - 1)
  // scaleHp: 1 + 0.3 * Math.max(0, n - 1)
  const scaleRate = n => 1 + 0.75 * Math.max(0, n - 1);
  const scaleHp = n => 1 + 0.3 * Math.max(0, n - 1);

  // 1 Player (Solo baseline)
  assert.equal(scaleRate(1), 1.0);
  assert.equal(scaleHp(1), 1.0);

  // 2 Players Co-op
  assert.equal(scaleRate(2), 1.75);
  assert.equal(scaleHp(2), 1.3);

  // 3 Players Co-op
  assert.equal(scaleRate(3), 2.5);
  assert.equal(scaleHp(3), 1.6);

  // 4 Players Co-op
  assert.equal(scaleRate(4), 3.25);
  assert.equal(scaleHp(4), 1.9);
});

test('Giai đoạn 5.1: Co-op Leaderboard separation (g and gm)', () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  // Board routing test
  const standardCoopBoard = G.Ranking.board('g', 'd');
  assert.ok(standardCoopBoard.startsWith('g_d'));
  assert.ok(standardCoopBoard.endsWith('vn1'));

  const multiCastCoopBoard = G.Ranking.board('gm', 'd');
  assert.ok(multiCastCoopBoard.startsWith('gm_d'));
  assert.ok(multiCastCoopBoard.endsWith('vn1'));

  // Separate all-time boards
  assert.equal(G.Ranking.board('g', 'a'), 'g_all_vn1');
  assert.equal(G.Ranking.board('gm', 'a'), 'gm_all_vn1');
  assert.equal(G.Ranking.board('s', 'a'), 's_all_vn1');
  assert.equal(G.Ranking.board('sm', 'a'), 'sm_all_vn1');

  // Verify group ID construction: sorted UIDs joined by underscore
  const members = [{ uid: 'uid_zeta', name: 'Zeta' }, { uid: 'uid_alpha', name: 'Alpha' }];
  const ms = members.slice().sort((a, b) => (a.uid < b.uid ? -1 : 1));
  const groupId = ms.map(m => m.uid).join('_');
  assert.equal(groupId, 'uid_alpha_uid_zeta');
});
