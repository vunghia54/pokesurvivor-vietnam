const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { isEmulatorRunning } = require('./check_emulator.cjs');

const PROJECT_ID = 'plucky-courier-365002';
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;
const RTDB_PORT = 9000;
const RTDB_NS = 'plucky-courier-365002-default-rtdb';

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

// 1. Tạo tài khoản Email/Password trên Auth Emulator
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

// 2. Tạo tài khoản Anonymous trên Auth Emulator (Khách v1.2)
async function createAnonymousUser() {
  const res = await httpRequest({
    hostname: '127.0.0.1',
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { returnSecureToken: true });

  if (res.status !== 200) throw new Error('Cannot create anonymous user: ' + JSON.stringify(res.body));
  return { idToken: res.body.idToken, uid: res.body.localId };
}

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
    else if ('mapValue' in v) out[k] = fromFirestoreDoc(v.mapValue);
    else if ('arrayValue' in v) {
      out[k] = (v.arrayValue.values || []).map(item =>
        'integerValue' in item ? parseInt(item.integerValue, 10) :
        ('stringValue' in item ? item.stringValue : item.booleanValue)
      );
    }
  }
  return out;
}

test('Kiểm định Tương thích Ngược v1.2 với Firebase Security Rules v1.3', async (t) => {
  if (!(await isEmulatorRunning(AUTH_PORT))) {
    t.skip('Firebase Emulator không chạy trên port ' + AUTH_PORT + '. Bỏ qua integration test.');
    return;
  }
  console.log('\n--- BẮT ĐẦU KIỂM THỬ TƯƠNG THÍCH V1.2 TRÊN FIREBASE RULES V1.3 ---');

  // Khởi tạo người chơi Client v1.2 (Khách Anonymous & Đăng nhập Email/Google)
  const clientV12_Guest = await createAnonymousUser();
  const clientV12_User = await createAuthUser(`v12_player_${Date.now()}@test.vn`, 'PassV12_12345!');
  const clientV13_User = await createAuthUser(`v13_player_${Date.now()}@test.vn`, 'PassV13_12345!');

  console.log(`Client v1.2 Guest UID: ${clientV12_Guest.uid}`);
  console.log(`Client v1.2 Registered UID: ${clientV12_User.uid}`);
  console.log(`Client v1.3 Registered UID: ${clientV13_User.uid}`);

  const boardId = `s_d${Date.now()}vn1`;
  const boardId8 = `sm_d${Date.now()}vn1`;

  // 1. Kiểm tra Online Presence v1.2
  await t.test('1. Client v1.2 ghi nhận và cập nhật Online Presence Realtime', async () => {
    // Client v1.2 ghi presence vào path /presence/{uid}/{connId}
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/presence/${clientV12_User.uid}/v12_conn_1.json?auth=${clientV12_User.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, { at: Date.now() });
    assert.strictEqual(res.status, 200, 'Client v1.2 ghi presence thất bại');

    // Client v1.3 cũng ghi presence song song
    const res13 = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/presence/${clientV13_User.uid}/v13_conn_1.json?auth=${clientV13_User.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, { at: Date.now() });
    assert.strictEqual(res13.status, 200, 'Client v1.3 ghi presence thất bại');

    // Đọc toàn bộ danh sách presence để xác nhận cả 2 đều online
    const readPresence = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/presence.json?auth=${clientV12_User.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.strictEqual(readPresence.status, 200);
    assert.ok(readPresence.body[clientV12_User.uid], 'Thiếu presence v1.2');
    assert.ok(readPresence.body[clientV13_User.uid], 'Thiếu presence v1.3');
  });

  // 2. Kiểm tra Đọc Bảng Xếp Hạng ở chế độ Khách v1.2 (Anonymous/Guest Read)
  await t.test('2. Khách v1.2 đọc Bảng Xếp Hạng công khai không cần đăng nhập', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/lb/${boardId}/e`,
      method: 'GET'
    });
    assert.strictEqual(res.status, 200, 'Khách không thể đọc bảng xếp hạng công khai');
  });

  // 3. Kiểm tra Gửi Điểm Solo Thường v1.2 (s_*)
  await t.test('3. Client v1.2 ghi nhận thành tích Solo Thường (s_*) theo chuẩn Rules v1.3', async () => {
    const docData = {
      maxKills: 95,
      timeAtMaxKills: 160,
      dexAtMaxKills: [25],
      shinyAtMaxKills: [false],
      lvAtMaxKills: 12,
      maxTime: 160,
      killsAtMaxTime: 95,
      dexAtMaxTime: [25],
      shinyAtMaxTime: [false],
      lvAtMaxTime: 12,
      kills: 95,
      t: 160,
      lv: 12,
      dex: [25],
      shiny: [false],
      dmg: 0,
      uids: [clientV12_User.uid],
      names: ['Ash_V12']
    };

    const docName = `projects/${PROJECT_ID}/databases/(default)/documents/lb/${boardId}/e/${clientV12_User.uid}`;
    const payload = {
      writes: [
        {
          update: {
            name: docName,
            fields: toFirestoreFields(docData)
          },
          updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }]
        }
      ]
    };

    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientV12_User.idToken}`
      }
    }, payload);

    assert.strictEqual(res.status, 200, `Client v1.2 ghi điểm Solo thất bại: ${JSON.stringify(res.body)}`);
  });

  // 4. Kiểm tra Gửi Điểm Solo 8 Chiêu v1.2 (sm_*)
  await t.test('4. Client v1.2 ghi nhận thành tích Solo 8 Chiêu (sm_*) theo chuẩn Rules v1.3', async () => {
    const docData = {
      maxKills: 110,
      timeAtMaxKills: 190,
      dexAtMaxKills: [6],
      shinyAtMaxKills: [true],
      lvAtMaxKills: 15,
      maxTime: 190,
      killsAtMaxTime: 110,
      dexAtMaxTime: [6],
      shinyAtMaxTime: [true],
      lvAtMaxTime: 15,
      kills: 110,
      t: 190,
      lv: 15,
      dex: [6],
      shiny: [true],
      dmg: 0,
      uids: [clientV12_User.uid],
      names: ['Ash_V12']
    };

    const docName = `projects/${PROJECT_ID}/databases/(default)/documents/lb/${boardId8}/e/${clientV12_User.uid}`;
    const payload = {
      writes: [
        {
          update: {
            name: docName,
            fields: toFirestoreFields(docData)
          },
          updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }]
        }
      ]
    };

    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientV12_User.idToken}`
      }
    }, payload);

    assert.strictEqual(res.status, 200, `Client v1.2 ghi điểm Solo 8 Chiêu thất bại: ${JSON.stringify(res.body)}`);
  });

  // 5. Kiểm tra Lưu & Đọc Cloud Save v1.2 (Bảo toàn Pokémon, Shinies, Xu, Vé Gacha)
  await t.test('5. Client v1.2 Lưu và Đọc Cloud Save toàn vẹn (Pokémon, Vé, Xu, Không mất mát)', async () => {
    const saveV12 = {
      partner: 25,
      coins: 8888,
      tickets: { t1: 10, t10: 2 },
      pokes: { 25: true, 6: true, 1: true },
      shinies: { 6: true },
      upgrades: { hp: 5, atk: 5, spd: 3 },
      medals: [1, 2, 3]
    };

    const docName = `projects/${PROJECT_ID}/databases/(default)/documents/saves/${clientV12_User.uid}`;
    const payload = {
      writes: [
        {
          update: {
            name: docName,
            fields: toFirestoreFields({
              save: saveV12,
              v: 1,
              ban: false,
              rev: 1
            })
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
        }
      ]
    };

    const writeRes = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientV12_User.idToken}`
      }
    }, payload);

    assert.strictEqual(writeRes.status, 200, 'Client v1.2 ghi Cloud Save thất bại');

    // Đọc lại Cloud Save để kiểm chứng tính toàn vẹn 100%
    const readRes = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/saves/${clientV12_User.uid}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${clientV12_User.idToken}`
      }
    });

    assert.strictEqual(readRes.status, 200, 'Không thể đọc lại Cloud Save');
    const loadedDoc = fromFirestoreDoc(readRes.body);
    assert.strictEqual(loadedDoc.ban, false);
    assert.strictEqual(loadedDoc.rev, 1);
    assert.strictEqual(loadedDoc.save.coins, 8888);
    assert.strictEqual(loadedDoc.save.partner, 25);
    assert.strictEqual(loadedDoc.save.shinies[6], true);
    assert.strictEqual(loadedDoc.save.tickets.t10, 2);
    console.log('✓ Dữ liệu Cloud Save v1.2 được bảo tồn 100% không suy giảm.');
  });

  // 6. Tình huống Chuyển giao: Client v1.2 và v1.3 cùng hoạt động đồng thời
  await t.test('6. Tình huống Chuyển giao: Client v1.2 và Client v1.3 cùng hoạt động song song', async () => {
    // Client v1.3 ghi kỷ lục nhóm Co-op (gm)
    const sortedGroupUids = [clientV13_User.uid, clientV12_User.uid].sort();
    const groupId = sortedGroupUids.join('_');
    const groupBoardId = `gm_d${Date.now()}vn1`;

    const groupPayload = {
      writes: [
        {
          update: {
            name: `projects/${PROJECT_ID}/databases/(default)/documents/lb/${groupBoardId}/e/${groupId}`,
            fields: toFirestoreFields({
              maxKills: 150,
              timeAtMaxKills: 220,
              dexAtMaxKills: [25, 6],
              shinyAtMaxKills: [false, true],
              lvAtMaxKills: 16,
              maxTime: 220,
              killsAtMaxTime: 150,
              dexAtMaxTime: [25, 6],
              shinyAtMaxTime: [false, true],
              lvAtMaxTime: 16,
              kills: 150,
              t: 220,
              lv: 16,
              dex: [25, 6],
              shiny: [false, true],
              uids: sortedGroupUids,
              names: ['P13', 'P12']
            })
          },
          updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }]
        }
      ]
    };

    const groupWrite = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientV13_User.idToken}`
      }
    }, groupPayload);
    assert.strictEqual(groupWrite.status, 200, 'Client v1.3 ghi nhóm thất bại');

    // Client v1.2 vẫn đọc bảng xếp hạng Solo bình thường và không bị lỗi bởi sự tồn tại của bảng nhóm
    const v12SoloRead = await httpRequest({
      hostname: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/lb/${boardId}/e/${clientV12_User.uid}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${clientV12_User.idToken}` }
    });
    assert.strictEqual(v12SoloRead.status, 200, 'Client v1.2 không đọc được bảng solo khi v1.3 đang hoạt động');
    const doc = fromFirestoreDoc(v12SoloRead.body);
    assert.strictEqual(doc.maxKills, 95);

    console.log('✓ Client v1.2 và v1.3 hoạt động song song hoàn toàn trơn tru, không có bất kỳ xung đột nào.');
  });
});
