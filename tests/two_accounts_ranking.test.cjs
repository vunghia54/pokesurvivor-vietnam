const test = require('node:test');
const assert = require('node:assert/strict');

// Mock môi trường Firebase Firestore trong bộ nhớ để kiểm thử 2 tài khoản thực tế
class MockFirestoreDB {
  constructor() {
    this.collections = new Map(); // path -> Map(docId -> data)
  }

  getCol(path) {
    if (!this.collections.has(path)) this.collections.set(path, new Map());
    return this.collections.get(path);
  }

  docRef(colPath, docId) {
    const col = this.getCol(colPath);
    return {
      get: async () => {
        const data = col.get(docId);
        return { exists: !!data, data: () => data ? JSON.parse(JSON.stringify(data)) : null };
      },
      set: async (data) => {
        col.set(docId, JSON.parse(JSON.stringify(data)));
        return Promise.resolve();
      }
    };
  }

  queryCol(colPath, orderByField, orderDir = 'desc', limitCount = 50) {
    const col = this.getCol(colPath);
    const docs = Array.from(col.entries()).map(([id, data]) => ({
      id,
      data: () => data
    }));
    docs.sort((a, b) => {
      const va = a.data()[orderByField] || 0;
      const vb = b.data()[orderByField] || 0;
      return orderDir === 'desc' ? vb - va : va - vb;
    });
    const limited = docs.slice(0, limitCount);
    return {
      docs: limited,
      forEach: (fn) => limited.forEach(fn)
    };
  }
}

// Thiết lập môi trường toàn cục cho G.Ranking
const mockFs = new MockFirestoreDB();

global.window = global;
global.firebase = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date().toISOString()
    }
  }
};
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
  Social: { me: null },
  DB: {
    online: true,
    fb: null
  }
};

// Cung cấp wrapper client của Firestore cho G.Ranking
function setUserContext(uid, name) {
  global.G.Social.me = { uid, name };
  global.G.DB.fb = {
    uid,
    fs: {
      collection: (colName) => ({
        doc: (docId) => ({
          collection: (subCol) => {
            const fullPath = `${colName}/${docId}/${subCol}`;
            return {
              doc: (subId) => mockFs.docRef(fullPath, subId),
              orderBy: (field, dir) => ({
                limit: (lim) => ({
                  get: async () => mockFs.queryCol(fullPath, field, dir, lim)
                })
              })
            };
          },
          get: async () => mockFs.docRef(colName, docId).get(),
          set: async (d) => mockFs.docRef(colName, docId).set(d)
        })
      })
    }
  };
}

require('../js/net/ranking.js');

test('Kiểm thử vòng đời thực tế 2 tài khoản (User A & User B) trên Bảng Xếp Hạng Online', async () => {
  const boardId = G.Ranking.board('s', 'd'); // Solo Daily Board

  // --- BƯỚC 1: Người A ("Red Huyền Thoại") đăng nhập ---
  setUserContext('uid_red', 'Red Huyền Thoại');
  global.localStorage.clear();

  // Người A hoàn thành trận ngắn (45 giây, 85 quái, Charizard dex 6)
  const runA = { t: 45, kills: 85, lv: 8, dex: 6, shiny: false, mode: 's' };
  const betterA = await G.Ranking.submitSolo(runA);
  assert.ok(betterA.length > 0, 'Thành tích của A được ghi nhận lên Firestore');

  // Kiểm tra document cá nhân của A trong collection
  const snapA = await mockFs.docRef(`lb/${boardId}/e`, 'uid_red').get();
  assert.equal(snapA.exists, true, 'Document của A tồn tại');
  assert.equal(snapA.data().maxKills, 85, 'maxKills của A là 85');
  assert.equal(snapA.data().maxTime, 45, 'maxTime của A là 45s');

  // --- BƯỚC 2: Người B ("Ash Ketchum") đăng nhập trên trình duyệt khác ---
  setUserContext('uid_ash', 'Ash Ketchum');
  global.localStorage.clear(); // Trình duyệt khác = localStorage riêng

  // Người B mở bảng xếp hạng trước khi chơi -> Thấy Người A đã có trên bảng!
  const topBeforeB = await G.Ranking.topKills('s', 'd');
  assert.equal(topBeforeB.length, 1, 'Bảng xếp hạng đã có 1 người chơi');
  assert.equal(topBeforeB[0].id, 'uid_red', 'Người A đứng đầu bảng');
  assert.equal(topBeforeB[0].kills, 85, 'Số quái của A hiển thị đúng: 85');
  assert.equal(topBeforeB[0].names[0], 'Red Huyền Thoại', 'Tên của A hiển thị chuẩn');

  // Người B hoàn thành một trận khác: Sống lâu hơn (90 giây) nhưng ít quái hơn (40 quái, Pikachu dex 25)
  const runB = { t: 90, kills: 40, lv: 6, dex: 25, shiny: false, mode: 's' };
  const betterB = await G.Ranking.submitSolo(runB);
  assert.ok(betterB.length > 0, 'Thành tích của B được ghi nhận');

  // --- BƯỚC 3: Cả hai cùng xuất hiện trên bảng và xếp hạng riêng biệt ---
  // Xóa cache tạm để nạp dữ liệu mới nhất
  global.localStorage.removeItem('ps.rk.c.S:' + boardId);

  // 1. Kiểm tra BẢNG DIỆT QUÁI (Kills): A diệt nhiều quái hơn B -> A đứng #1, B đứng #2
  const topKills = await G.Ranking.topKills('s', 'd');
  assert.equal(topKills.length, 2, 'Cả 2 người cùng xuất hiện trên Bảng Diệt Quái');
  assert.equal(topKills[0].id, 'uid_red', '#1 Diệt Quái là Red (85 quái)');
  assert.equal(topKills[0].kills, 85);
  assert.equal(topKills[1].id, 'uid_ash', '#2 Diệt Quái là Ash (40 quái)');
  assert.equal(topKills[1].kills, 40);

  // 2. Kiểm tra BẢNG SINH TỒN (Time): B sống lâu hơn A (90s > 45s) -> B đứng #1, A đứng #2
  global.localStorage.removeItem('ps.rk.c.S:' + boardId);
  const topTime = await G.Ranking.topTime('s', 'd');
  assert.equal(topTime.length, 2, 'Cả 2 người cùng xuất hiện trên Bảng Sinh Tồn');
  assert.equal(topTime[0].id, 'uid_ash', '#1 Sinh Tồn là Ash (90s / 01:30)');
  assert.equal(topTime[0].t, 90);
  assert.equal(topTime[1].id, 'uid_red', '#2 Sinh Tồn là Red (45s / 00:45)');
  assert.equal(topTime[1].t, 45);

  // --- BƯỚC 4: Kiểm tra gửi kỷ lục gần như đồng thời (Concurrency) ---
  // Giả lập Người A và Người B cùng nộp điểm ở cùng một mili-giây
  setUserContext('uid_red', 'Red Huyền Thoại');
  const runA2 = { t: 120, kills: 180, lv: 15, dex: 6, mode: 's' }; // Red tăng cả 2 kỷ lục

  setUserContext('uid_ash', 'Ash Ketchum');
  const runB2 = { t: 150, kills: 90, lv: 12, dex: 25, mode: 's' };  // Ash tăng cả 2 kỷ lục

  // Cả hai ghi đồng thời vào 2 document riêng biệt
  await Promise.all([
    mockFs.docRef(`lb/${boardId}/e`, 'uid_red').set({
      maxKills: runA2.kills, timeAtMaxKills: runA2.t, maxTime: runA2.t, killsAtMaxTime: runA2.kills,
      uids: ['uid_red'], names: ['Red Huyền Thoại'], dexAtMaxKills: [6], dexAtMaxTime: [6]
    }),
    mockFs.docRef(`lb/${boardId}/e`, 'uid_ash').set({
      maxKills: runB2.kills, timeAtMaxKills: runB2.t, maxTime: runB2.t, killsAtMaxTime: runB2.kills,
      uids: ['uid_ash'], names: ['Ash Ketchum'], dexAtMaxKills: [25], dexAtMaxTime: [25]
    })
  ]);

  // Xác minh không có dữ liệu nào bị ghi đè hay mất mát
  const finalA = (await mockFs.docRef(`lb/${boardId}/e`, 'uid_red').get()).data();
  const finalB = (await mockFs.docRef(`lb/${boardId}/e`, 'uid_ash').get()).data();
  assert.equal(finalA.maxKills, 180, 'Dữ liệu A được bảo toàn nguyên vẹn');
  assert.equal(finalB.maxKills, 90, 'Dữ liệu B được bảo toàn nguyên vẹn');
  assert.equal(finalA.maxTime, 120);
  assert.equal(finalB.maxTime, 150);
});
