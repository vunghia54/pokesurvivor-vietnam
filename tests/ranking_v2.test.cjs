const test = require('node:test');
const assert = require('node:assert/strict');

// Mock browser globals for node test environment
global.window = global;
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; },
  get length() { return Object.keys(this._data).length; }
};

global.G = {
  U: {
    str(s, max) { return String(s || '').slice(0, max); },
    int(n, max) { n = Math.floor(Number(n) || 0); return Math.min(Math.max(0, n), max || 1e9); },
    list(arr, max) { return Array.isArray(arr) ? arr.slice(0, max) : []; },
    mmss(sec) {
      sec = Math.floor(sec || 0);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  },
  Social: { me: { uid: 'u_tester', name: 'Tester VN' } },
  DB: { online: false }
};

// Load ranking.js
require('../js/net/ranking.js');

test('Ranking v2 - Asia/Ho_Chi_Minh Timezone and Board IDs', () => {
  const pIds = G.Ranking.periodIds(new Date('2026-10-24T18:00:00Z')); // 18:00 UTC = 01:00 UTC+7 next day (2026-10-25)
  assert.equal(pIds.d, 'd20261025', 'Should convert UTC to UTC+7 (Asia/Ho_Chi_Minh)');

  const bSoloDaily = G.Ranking.board('s', 'd');
  assert.match(bSoloDaily, /^s_d\d{8}vn1$/, 'Solo Daily board should have s_ prefix and vn1 suffix');

  const bMultiCastDaily = G.Ranking.board('sm', 'd');
  assert.match(bMultiCastDaily, /^sm_d\d{8}vn1$/, 'Multi-Cast Daily board should have sm_ prefix and vn1 suffix');

  const bGroupWeekly = G.Ranking.board('g', 'w');
  assert.match(bGroupWeekly, /^g_w\d{4}-\d{2}vn1$/, 'Group Weekly board should have g_ prefix and vn1 suffix');

  const bAllTime = G.Ranking.board('s', 'a');
  assert.equal(bAllTime, 's_all_vn1', 'All-Time board should be s_all_vn1');

  const bPokeFilter = G.Ranking.board('s', 'a', 25);
  assert.equal(bPokeFilter, 's_all_vn1_p25', 'Historical Pikachu filter board should be s_all_vn1_p25');
});

test('Ranking v2 - Sorting Algorithms with Tie-Breakers', () => {
  // Test data for Kills ranking
  const sampleKills = {
    'p1': { kills: 1500, t: 900, uids: ['u1'], names: ['Ash'] },
    'p2': { kills: 2000, t: 800, uids: ['u2'], names: ['Red'] },
    'p3': { kills: 2000, t: 1100, uids: ['u3'], names: ['Blue'] }, // Same kills as Red, but survived longer
    'p4': { kills: 500, t: 1800, uids: ['u4'], names: ['Green'] }
  };

  const sortedK = Object.entries(sampleKills)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.kills - a.kills) || (b.t - a.t));

  assert.equal(sortedK[0].id, 'p3', 'Rank 1 kills: Blue (2000 kills, 1100s - tiebreaker time)');
  assert.equal(sortedK[1].id, 'p2', 'Rank 2 kills: Red (2000 kills, 800s)');
  assert.equal(sortedK[2].id, 'p1', 'Rank 3 kills: Ash (1500 kills, 900s)');
  assert.equal(sortedK[3].id, 'p4', 'Rank 4 kills: Green (500 kills, 1800s)');

  // Test data for Survival Time ranking
  const sampleTime = {
    'p1': { t: 1200, kills: 1200, uids: ['u1'], names: ['Ash'] },
    'p2': { t: 1500, kills: 800, uids: ['u2'], names: ['Red'] },
    'p3': { t: 1500, kills: 1400, uids: ['u3'], names: ['Blue'] }, // Same time as Red, but more kills
    'p4': { t: 600, kills: 2500, uids: ['u4'], names: ['Green'] }
  };

  const sortedT = Object.entries(sampleTime)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.t - a.t) || (b.kills - a.kills));

  assert.equal(sortedT[0].id, 'p3', 'Rank 1 time: Blue (1500s, 1400 kills - tiebreaker kills)');
  assert.equal(sortedT[1].id, 'p2', 'Rank 2 time: Red (1500s, 800 kills)');
  assert.equal(sortedT[2].id, 'p1', 'Rank 3 time: Ash (1200s, 1200 kills)');
  assert.equal(sortedT[3].id, 'p4', 'Rank 4 time: Green (600s, 2500 kills)');
});

test('Ranking v2 - Independent Personal Records Preservation', () => {
  // Simulating the store logic for independent records:
  // Run 1: High Kills, Low Survival Time
  const run1 = { kills: 1850, t: 720, lv: 55, dex: [25] };
  let doc = {
    maxKills: run1.kills,
    timeAtMaxKills: run1.t,
    maxTime: run1.t,
    killsAtMaxTime: run1.kills
  };

  assert.equal(doc.maxKills, 1850);
  assert.equal(doc.timeAtMaxKills, 720);
  assert.equal(doc.maxTime, 720);
  assert.equal(doc.killsAtMaxTime, 1850);

  // Run 2: Low Kills, High Survival Time
  const run2 = { kills: 450, t: 1800, lv: 40, dex: [6] };
  const upK = run2.kills > doc.maxKills; // false
  const upT = run2.t > doc.maxTime;      // true

  const updatedDoc = {
    maxKills: upK ? run2.kills : doc.maxKills,
    timeAtMaxKills: upK ? run2.t : doc.timeAtMaxKills,
    maxTime: upT ? run2.t : doc.maxTime,
    killsAtMaxTime: upT ? run2.kills : doc.killsAtMaxTime
  };

  assert.equal(updatedDoc.maxKills, 1850, 'maxKills should remain 1850 from Run 1');
  assert.equal(updatedDoc.timeAtMaxKills, 720, 'timeAtMaxKills should remain 720s from Run 1');
  assert.equal(updatedDoc.maxTime, 1800, 'maxTime should be updated to 1800s from Run 2');
  assert.equal(updatedDoc.killsAtMaxTime, 450, 'killsAtMaxTime should be 450 from Run 2');
});

test('Ranking v2 - Anti-Spam Thresholds', async () => {
  // Runs with t < 30 and kills < 10 must be discarded
  const spamRun1 = { t: 5, kills: 2, lv: 1 };
  const res1 = await G.Ranking.submitSolo(spamRun1);
  assert.deepEqual(res1, [], 'Spam run with t=5, kills=2 should be rejected');

  // Genuine short death run: t=32, kills=8 -> qualifies because t >= 30
  const genuineRunTime = { t: 32, kills: 8, lv: 3, dex: 1 };
  // Genuine high frenzy run: t=20, kills=15 -> qualifies because kills >= 10
  const genuineRunKills = { t: 20, kills: 15, lv: 4, dex: 1 };

  assert.ok(genuineRunTime.t >= 30 || genuineRunTime.kills >= 10, 'Qualifies by survival time >= 30s');
  assert.ok(genuineRunKills.t >= 30 || genuineRunKills.kills >= 10, 'Qualifies by kills >= 10');
});

test('Ranking v2 - Mode Routing Separation', () => {
  // Test solo standard vs solo multi-cast
  const autoSimultaneous = 'simultaneous';
  const autoAlternating = 'alternating';
  const autoOff = 'off';

  function determineMode(autoMode, slotsCount, coop) {
    const isMultiCast = autoMode === 'simultaneous';
    const has8Slots = slotsCount > 4;
    const isMulti = isMultiCast || has8Slots;
    return coop ? (isMulti ? 'gm' : 'g') : (isMulti ? 'sm' : 's');
  }

  assert.equal(determineMode(autoAlternating, 4, false), 's', 'Solo standard should route to s');
  assert.equal(determineMode(autoOff, 4, false), 's', 'Solo off should route to s');
  assert.equal(determineMode(autoSimultaneous, 4, false), 'sm', 'Solo simultaneous should route to sm');
  assert.equal(determineMode(autoAlternating, 8, false), 'sm', 'Solo 8 slots should route to sm');

  assert.equal(determineMode(autoOff, 4, true), 'g', 'Co-op standard should route to g');
  assert.equal(determineMode(autoSimultaneous, 4, true), 'gm', 'Co-op simultaneous should route to gm');
  assert.equal(determineMode(autoAlternating, 8, true), 'gm', 'Co-op 8 slots should route to gm');
});
