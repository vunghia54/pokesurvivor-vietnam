const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { isEmulatorRunning } = require('./check_emulator.cjs');

const PROJECT_ID = 'plucky-courier-365002';
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;
const RTDB_PORT = 9000;

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

// 1. Tạo tài khoản trên Auth Emulator
async function createAuthUser(email, password) {
  const res = await httpRequest({
    hostname: '127.0.0.1',
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email, password, returnSecureToken: true });

  if (res.status !== 200) throw new Error('Cannot create auth user: ' + JSON.stringify(res.body));
  return { idToken: res.body.idToken, uid: res.body.localId };
}

// 2. Chuyển đổi Firestore document JSON sang định dạng Firestore REST API
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map(item => {
            if (typeof item === 'boolean') return { booleanValue: item };
            if (typeof item === 'number') return { integerValue: String(item) };
            return { stringValue: String(item) };
          })
        }
      };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if ('integerValue' in v) out[k] = parseInt(v.integerValue, 10);
    else if ('stringValue' in v) out[k] = v.stringValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else if ('arrayValue' in v) {
      out[k] = (v.arrayValue.values || []).map(item =>
        'integerValue' in item ? parseInt(item.integerValue, 10) :
        ('stringValue' in item ? item.stringValue : item.booleanValue)
      );
    }
  }
  return out;
}

// 3. Helper ghi score qua :commit với serverTimestamp 'at'
async function commitScore(board, docId, record, token) {
  const fields = toFirestoreFields(record);
  delete fields.at;

  const docName = `projects/${PROJECT_ID}/databases/(default)/documents/lb/${board}/e/${docId}`;
  const payload = {
    writes: [
      {
        update: {
          name: docName,
          fields: fields
        },
        updateTransforms: [
          {
            fieldPath: 'at',
            setToServerValue: 'REQUEST_TIME'
          }
        ]
      }
    ]
  };

  return httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, payload);
}

test('Firebase Emulator Suite — Kiểm thử thực tế Firestore Rules và Database Rules', async (t) => {
  if (!(await isEmulatorRunning(AUTH_PORT))) {
    t.skip('Firebase Emulator không chạy trên port ' + AUTH_PORT + '. Bỏ qua integration test.');
    return;
  }
  console.log('--- KHỞI TẠO TÀI KHOẢN TRÊN AUTH EMULATOR ---');
  const userA = await createAuthUser(`user_a_${Date.now()}@test.vn`, 'Password123!');
  const userB = await createAuthUser(`user_b_${Date.now()}@test.vn`, 'Password123!');

  console.log(`User A UID: ${userA.uid}`);
  console.log(`User B UID: ${userB.uid}`);

  const board = 's_d' + Date.now() + 'vn1';
  const basePath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  // --- TEST 1: Khách (Chưa đăng nhập) ĐỌC bảng xếp hạng ---
  console.log('1. Kiểm thử: Khách đọc danh sách bảng xếp hạng lb/{board}/e');
  const guestRead = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `${basePath}/lb/${board}/e`,
    method: 'GET'
  });
  assert.equal(guestRead.status, 200, 'Khách được phép đọc công khai bảng xếp hạng');

  // --- TEST 2: Người A ghi kỷ lục hợp lệ của chính mình ---
  console.log('2. Kiểm thử: Người A ghi kỷ lục của chính mình vào lb/{board}/e/{uidA}');
  const recordA = {
    maxKills: 85,
    timeAtMaxKills: 45,
    dexAtMaxKills: [6],
    shinyAtMaxKills: [true],
    lvAtMaxKills: 8,
    maxTime: 45,
    killsAtMaxTime: 85,
    dexAtMaxTime: [6],
    shinyAtMaxTime: [true],
    lvAtMaxTime: 8,
    kills: 85,
    t: 45,
    lv: 8,
    dex: [6],
    shiny: [true],
    dmg: 0,
    uids: [userA.uid],
    names: ['Red Huyền Thoại']
  };

  const writeA = await commitScore(board, userA.uid, recordA, userA.idToken);
  assert.equal(writeA.status, 200, 'Người A ghi thành tích thành công');

  // --- TEST 3: Người A CỐ TÌNH ghi đè hoặc sửa điểm của Người B ---
  console.log('3. Kiểm thử: Người A cố tình ghi đè điểm của Người B vào lb/{board}/e/{uidB}');
  const hackB = await commitScore(board, userB.uid, recordA, userA.idToken);
  assert.equal(hackB.status, 403, 'Người A bị Security Rules từ chối (403 Forbidden) khi cố sửa điểm Người B');

  // --- TEST 4: Client CỐ TÌNH ghi đè tài liệu tổng hợp lbs/{board} ---
  console.log('4. Kiểm thử: Client cố tình ghi đè tài liệu tổng hợp lbs/{board}');
  const writeTop = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userA.idToken}`
    }
  }, {
    writes: [
      {
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/lbs/${board}`,
          fields: { ktop: { nullValue: null } }
        }
      }
    ]
  });
  assert.equal(writeTop.status, 403, 'Client bị chặn khi cố sửa lbs/{board}');

  // --- TEST 5: Hack tốc độ diệt quái (50.000 quái trong 10 giây) ---
  console.log('5. Kiểm thử: Chặn hack tốc độ diệt quái bất thường');
  const hackRate = await commitScore(board, userA.uid, {
    ...recordA,
    maxKills: 50000,
    timeAtMaxKills: 10
  }, userA.idToken);
  assert.equal(hackRate.status, 403, 'Chặn tốc độ diệt quái bất thường vi phạm rate limit');

  // --- TEST 6: Người B đăng nhập, xem thấy Người A và gửi thành tích của mình ---
  console.log('6. Kiểm thử: Người B đọc thấy A, sau đó gửi kỷ lục hợp lệ của mình');
  const readAByB = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `${basePath}/lb/${board}/e/${userA.uid}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userB.idToken}` }
  });
  assert.equal(readAByB.status, 200, 'Người B xem thấy kỷ lục của Người A');
  const docA = fromFirestoreDoc(readAByB.body);
  assert.equal(docA.maxKills, 85);

  const recordB = {
    maxKills: 40,
    timeAtMaxKills: 90,
    dexAtMaxKills: [25],
    shinyAtMaxKills: [false],
    lvAtMaxKills: 6,
    maxTime: 90,
    killsAtMaxTime: 40,
    dexAtMaxTime: [25],
    shinyAtMaxTime: [false],
    lvAtMaxTime: 6,
    kills: 40,
    t: 90,
    lv: 6,
    dex: [25],
    shiny: [false],
    dmg: 0,
    uids: [userB.uid],
    names: ['Ash Ketchum']
  };

  const writeB = await commitScore(board, userB.uid, recordB, userB.idToken);
  assert.equal(writeB.status, 200, 'Người B gửi thành tích thành công');

  // --- TEST 7: Truy vấn Top 50 Diệt Quái & Top 50 Sinh Tồn từ Emulator ---
  console.log('7. Kiểm thử: Truy vấn Top 50 Diệt Quái và Sinh Tồn bằng runQuery');
  // Query 1: Sắp xếp theo maxKills DESC
  const queryKills = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `${basePath}/lb/${board}:runQuery`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    structuredQuery: {
      from: [{ collectionId: 'e' }],
      orderBy: [{ field: { fieldPath: 'maxKills' }, direction: 'DESCENDING' }],
      limit: 50
    }
  });

  assert.equal(queryKills.status, 200, 'Truy vấn Top Diệt Quái thành công');
  const killsResults = queryKills.body.filter(r => r.document).map(r => fromFirestoreDoc(r.document));
  assert.equal(killsResults.length, 2, 'Cả A và B cùng có mặt trên Bảng Diệt Quái');
  assert.equal(killsResults[0].names[0], 'Red Huyền Thoại', '#1 Diệt Quái là Red (85 quái)');
  assert.equal(killsResults[1].names[0], 'Ash Ketchum', '#2 Diệt Quái là Ash (40 quái)');

  // Query 2: Sắp xếp theo maxTime DESC
  const queryTime = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `${basePath}/lb/${board}:runQuery`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    structuredQuery: {
      from: [{ collectionId: 'e' }],
      orderBy: [{ field: { fieldPath: 'maxTime' }, direction: 'DESCENDING' }],
      limit: 50
    }
  });

  assert.equal(queryTime.status, 200, 'Truy vấn Top Sinh Tồn thành công');
  const timeResults = queryTime.body.filter(r => r.document).map(r => fromFirestoreDoc(r.document));
  assert.equal(timeResults.length, 2, 'Cả A và B cùng có mặt trên Bảng Sinh Tồn');
  assert.equal(timeResults[0].names[0], 'Ash Ketchum', '#1 Sinh Tồn là Ash (90 giây)');
  assert.equal(timeResults[1].names[0], 'Red Huyền Thoại', '#2 Sinh Tồn là Red (45 giây)');

  // --- TEST 8: Người A cố tình đọc / ghi Cloud Save của Người B ---
  console.log('8. Kiểm thử: Bảo vệ Cloud Save saves/{uid}');
  const saveB = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `${basePath}/saves/${userB.uid}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userA.idToken}` }
  });
  assert.equal(saveB.status, 403, 'Người A không thể đọc Cloud Save của Người B');

  // --- TEST 9: Realtime Database Rules (Presence) ---
  console.log('9. Kiểm thử: Realtime Database Rules cho Online Presence');
  const RTDB_NS = 'plucky-courier-365002-default-rtdb';

  // 9a. Khách chưa đăng nhập cố tình đọc presence
  const rtdbGuest = await httpRequest({
    hostname: '127.0.0.1',
    port: RTDB_PORT,
    path: `/presence.json?ns=${RTDB_NS}`,
    method: 'GET'
  });
  assert.equal(rtdbGuest.status, 401, 'Khách chưa đăng nhập bị từ chối đọc presence');

  // 9b. Người A ghi presence của chính mình
  const rtdbWriteA = await httpRequest({
    hostname: '127.0.0.1',
    port: RTDB_PORT,
    path: `/presence/${userA.uid}/conn_1.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { at: Date.now() });
  assert.equal(rtdbWriteA.status, 200, 'Người A ghi presence của mình thành công');

  // 9c. Người A cố tình ghi presence dưới UID của Người B
  const rtdbHackB = await httpRequest({
    hostname: '127.0.0.1',
    port: RTDB_PORT,
    path: `/presence/${userB.uid}/conn_1.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { at: Date.now() });
  assert.equal(rtdbHackB.status, 401, 'Bị chặn (401 Unauthorized) khi cố ghi presence người khác');

  // 9d. Người A cố tình nhét thông tin nhạy cảm (email, token) vào presence
  const rtdbLeak = await httpRequest({
    hostname: '127.0.0.1',
    port: RTDB_PORT,
    path: `/presence/${userA.uid}/conn_1.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { at: Date.now(), email: 'secret@gmail.com' });
  assert.equal(rtdbLeak.status, 401, 'Bị chặn (401 Unauthorized) khi cố làm lộ email trong presence');

  // --- TEST 10: Kiểm thử cấm tài khoản (ban) trong saves/{uid} ---
  console.log('10. Kiểm thử: Bảo mật cờ ban trong Cloud Save saves/{uid}');

  // 10a. Người dùng không thể tự tạo Cloud Save với cờ ban: true
  const badCreate = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userA.idToken}`
    }
  }, {
    writes: [
      {
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/saves/${userA.uid}`,
          fields: toFirestoreFields({
            save: { coins: 100 },
            v: 1,
            ban: true,
            rev: 1
          })
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
      }
    ]
  });
  assert.equal(badCreate.status, 403, 'Người dùng không thể tự tạo save với cờ ban: true');

  // 10b. Người A tạo Cloud Save hợp lệ (ban: false)
  const goodCreate = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userA.idToken}`
    }
  }, {
    writes: [
      {
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/saves/${userA.uid}`,
          fields: toFirestoreFields({
            save: { coins: 100 },
            v: 1,
            ban: false,
            rev: 1
          })
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
      }
    ]
  });
  assert.equal(goodCreate.status, 200, 'Người A tạo Cloud Save hợp lệ thành công');

  // 10c. Người A cố tình thay đổi cờ ban khi cập nhật save
  const badUpdateBan = await httpRequest({
    hostname: '127.0.0.1',
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userA.idToken}`
    }
  }, {
    writes: [
      {
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/saves/${userA.uid}`,
          fields: toFirestoreFields({
            save: { coins: 200 },
            v: 1,
            ban: true,
            rev: 2
          })
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
      }
    ]
  });
  assert.equal(badUpdateBan.status, 403, 'Người dùng không thể tự thay đổi cờ ban trong Cloud Save');

  console.log('\n✔ TẤT CẢ 10 KIỂM THỬ THỰC TẾ TRÊN FIREBASE EMULATOR ĐÃ HOÀN TOÀN ĐẠT CHUẨN!');
});
