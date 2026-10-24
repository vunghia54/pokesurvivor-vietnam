const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

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
    if (postData !== null && postData !== undefined) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

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

async function commitGroupScore(board, docId, record, token) {
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

test('Firebase Security Rules v1.3: Realtime Database Co-op Room & Signaling Isolation (3 Users Same Room)', async (t) => {
  const userA = await createAuthUser(`host_a_${Date.now()}@test.vn`, 'Pass123456!');
  const userB = await createAuthUser(`guest_b_${Date.now()}@test.vn`, 'Pass123456!');
  const userC = await createAuthUser(`guest_c_${Date.now()}@test.vn`, 'Pass123456!');
  const userOutsider = await createAuthUser(`outsider_${Date.now()}@test.vn`, 'Pass123456!');

  const roomId = `room_iso_${Date.now()}`;

  // 1. Host A tạo phòng
  await t.test('1. Host A tạo phòng thành công', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      host: userA.uid,
      slots: { 0: userA.uid },
      open: true,
      at: Date.now(),
      m: {
        [userA.uid]: { name: 'PlayerA', dex: 25, at: Date.now(), slot: '0' }
      }
    });
    assert.strictEqual(res.status, 200, `Host failed to create room: ${JSON.stringify(res.body)}`);
  });

  // 2. Guest B vào phòng
  await t.test('2. Guest B tham gia phòng hợp lệ', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, { ['m/' + userB.uid]: { name: 'Player1', dex: 6, at: Date.now(), slot: '1' }, ['slots/1']: userB.uid });
    assert.strictEqual(res.status, 200);
  });

  // 3. Guest C vào phòng (Lúc này cả 3 A, B, C đều là thành viên phòng)
  await t.test('3. Guest C tham gia phòng hợp lệ (Cả 3 A, B, C cùng ở trong phòng)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}.json?auth=${userC.idToken}&ns=${RTDB_NS}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, { ['m/' + userC.uid]: { name: 'Player2', dex: 1, at: Date.now(), slot: '2' }, ['slots/2']: userC.uid });
    assert.strictEqual(res.status, 200);
  });

  // 4. Host A gửi WebRTC signal cho Guest B
  const msgIdB = `${userA.uid}~msg_b_${Date.now()}`;
  await t.test('4. Host A gửi tín hiệu WebRTC cho Guest B (q/uidB)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}/${msgIdB}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(JSON.stringify({ type: 'offer', sdp: 'sdp_for_b' })));
    assert.strictEqual(res.status, 200);
  });

  // 5. Guest B đọc tín hiệu của chính mình
  await t.test('5. Guest B đọc thành công tín hiệu dành riêng cho mình (q/uidB)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body && res.body[msgIdB], 'Tín hiệu của B không tìm thấy');
  });

  // 6. Host A CỐ TÌNH đọc tín hiệu của Guest B -> PHẢI BỊ CHẶN 401 (Kiểm tra chống kế thừa .read từ node cha!)
  await t.test('6. Host A cố đọc tín hiệu của B -> BỊ TỪ CHỐI (401/403) vì không có .read kế thừa ở $room', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.ok(res.status === 401 || res.status === 403, `Host A bất ngờ đọc được q/uidB: status ${res.status}`);
  });

  // 7. Đồng đội C trong cùng phòng CỐ TÌNH đọc tín hiệu của B -> PHẢI BỊ CHẶN 401
  await t.test('7. Đồng đội C (cùng phòng) cố đọc tín hiệu của B -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}.json?auth=${userC.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.ok(res.status === 401 || res.status === 403, `Đồng đội C bất ngờ đọc được q/uidB: status ${res.status}`);
  });

  // 8. Host A CỐ TÌNH đọc toàn bộ danh sách hàng đợi q -> PHẢI BỊ CHẶN 401
  await t.test('8. Host A cố đọc toàn bộ node q -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.ok(res.status === 401 || res.status === 403, `Host A bất ngờ đọc được toàn bộ q: status ${res.status}`);
  });

  // 9. Host A CỐ TÌNH ghi đè/giả mạo dữ liệu của B (m/uidB) -> PHẢI BỊ CHẶN 401
  await t.test('9. Host A cố tình sửa/giả mạo dữ liệu của B (m/uidB) -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/m/${userB.uid}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, { dex: 999, name: 'ForgedByHost' });
    assert.ok(res.status === 401 || res.status === 403, `Host A bất ngờ sửa được dữ liệu B: status ${res.status}`);
  });

  // 10. B CỐ TÌNH sửa dữ liệu của C -> PHẢI BỊ CHẶN 401
  await t.test('10. Thành viên B cố tình sửa dữ liệu của C (m/uidC) -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/m/${userC.uid}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, { dex: 999, name: 'ForgedByB' });
    assert.ok(res.status === 401 || res.status === 403, `Thành viên B bất ngờ sửa được dữ liệu C: status ${res.status}`);
  });

  // 11. Người ngoài (Outsider) không thể gửi tín hiệu vào q/uidB
  await t.test('11. Người ngoài phòng (Outsider) không thể gửi tín hiệu vào phòng', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}/msg_spam.json?auth=${userOutsider.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify("spam_sdp"));
    assert.ok(res.status === 401 || res.status === 403, `Outsider bất ngờ gửi được tín hiệu: status ${res.status}`);
  });

  // 12. Thành viên B xóa tin nhắn sau khi đã nhận
  await t.test('12. Thành viên B xóa tin nhắn của mình thành công', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}/${msgIdB}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 200);
  });

  // 13. Thành viên C CỐ TÌNH xóa tin nhắn của B -> PHẢI BỊ CHẶN 401
  await t.test('13. Thành viên C cố tình xóa tin nhắn của B -> BỊ TỪ CHỐI (401/403)', async () => {
    // Tạo tin nhắn mới cho B
    const tempMsg = `${userA.uid}~msg_temp_${Date.now()}`;
    await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}/${tempMsg}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify("test"));

    const delRes = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}/${tempMsg}.json?auth=${userC.idToken}&ns=${RTDB_NS}`,
      method: 'DELETE'
    });
    assert.ok(delRes.status === 401 || delRes.status === 403, `Thành viên C bất ngờ xóa được tin nhắn của B: status ${delRes.status}`);
  });

  // 14. Host A cập nhật trạng thái phòng open = false
  await t.test('14. Host A cập nhật đóng phòng (open = false) thành công', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/open.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, false);
    assert.strictEqual(res.status, 200);
  });

  // 15. Thành viên B CỐ TÌNH mở lại phòng -> PHẢI BỊ CHẶN 401
  await t.test('15. Thành viên B không phải Host cố tình sửa trạng thái phòng -> BỊ TỪ CHỐI (401/403)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/open.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, true);
    assert.ok(res.status === 401 || res.status === 403);
  });

  // 16. Thành viên B tự rời phòng (DELETE m/uidB)
  await t.test('16. Thành viên B tự rời phòng (DELETE m/uidB) thành công', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/m/${userB.uid}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 200);
  });

  // 17. Host A xóa toàn bộ phòng
  await t.test('17. Host A xóa toàn bộ phòng khi kết thúc thành công', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 200);
  });
});

test('Firebase Security Rules v1.3: Chống tấn công chèn dữ liệu con giả mạo lúc tạo phòng mới', async (t) => {
  const host = await createAuthUser(`atk_host_${Date.now()}@test.vn`, 'Pass123456!');
  const victim = await createAuthUser(`atk_vic_${Date.now()}@test.vn`, 'Pass123456!');

  await t.test('1. Chặn tạo phòng có chèn thành viên giả mạo trong m (Anti-Forged Members)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/room_forged_m_${Date.now()}.json?auth=${host.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      host: host.uid,
      slots: { 0: host.uid, 1: victim.uid },
      open: true,
      at: Date.now(),
      m: {
        [host.uid]: { name: 'Host', dex: 25, slot: '0' },
        [victim.uid]: { name: 'ForgedVictim', dex: 6, slot: '1' }
      }
    });
    assert.ok(res.status === 401 || res.status === 403, `Chèn thành viên mạo danh thành công bất ngờ: status ${res.status}`);
  });

  await t.test('2. Chặn tạo phòng có chèn sẵn hàng đợi q (Anti-Injected Queue)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/room_forged_q_${Date.now()}.json?auth=${host.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      host: host.uid,
      slots: { 0: host.uid },
      open: true,
      at: Date.now(),
      m: {
        [host.uid]: { name: 'Host', dex: 25, slot: '0' }
      },
      q: {
        [victim.uid]: { 'fake_msg': 'forged_sdp' }
      }
    });
    assert.ok(res.status === 401 || res.status === 403, `Chèn hàng đợi q lúc tạo phòng thành công bất ngờ: status ${res.status}`);
  });

  await t.test('3. Tạo phòng hợp lệ chỉ chứa đúng Host trong m và không có q', async () => {
    const validRoomId = `room_valid_${Date.now()}`;
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${validRoomId}.json?auth=${host.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      host: host.uid,
      slots: { 0: host.uid },
      open: true,
      at: Date.now(),
      m: {
        [host.uid]: { name: 'Host', dex: 25, slot: '0' }
      }
    });
    assert.strictEqual(res.status, 200, `Tạo phòng hợp lệ thất bại: ${JSON.stringify(res.body)}`);

    // Dọn dẹp
    await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${validRoomId}.json?auth=${host.idToken}&ns=${RTDB_NS}`,
      method: 'DELETE'
    });
  });
});

test('Firebase Security Rules v1.3: Firestore Group Leaderboard Protection (g and gm)', async (t) => {
  const user1 = await createAuthUser(`p1_${Date.now()}@test.vn`, 'Pass123456!');
  const user2 = await createAuthUser(`p2_${Date.now()}@test.vn`, 'Pass123456!');
  const user3 = await createAuthUser(`p3_${Date.now()}@test.vn`, 'Pass123456!');
  const intruder = await createAuthUser(`hacker_${Date.now()}@test.vn`, 'Pass123456!');

  const sortedUids = [user1.uid, user2.uid].sort();
  const groupId = sortedUids.join('_');
  const boardId = `gm_d${Date.now()}vn1`;

  await t.test('1. Valid 2-player group submission by group member succeeds', async () => {
    const docData = {
      maxKills: 120,
      timeAtMaxKills: 200,
      dexAtMaxKills: [25, 6],
      shinyAtMaxKills: [false, true],
      lvAtMaxKills: 15,
      maxTime: 200,
      killsAtMaxTime: 120,
      dexAtMaxTime: [25, 6],
      shinyAtMaxTime: [false, true],
      lvAtMaxTime: 15,
      kills: 120,
      t: 200,
      lv: 15,
      dex: [25, 6],
      shiny: [false, true],
      uids: sortedUids,
      names: ['Player1', 'Player2']
    };

    const res = await commitGroupScore(boardId, groupId, docData, user1.idToken);
    assert.strictEqual(res.status, 200, `Valid group submission failed: ${JSON.stringify(res.body)}`);
  });

  await t.test('2. Outsider cannot submit or modify group record (Anti-Impersonation)', async () => {
    const docData = {
      maxKills: 999,
      timeAtMaxKills: 300,
      dexAtMaxKills: [25, 6],
      shinyAtMaxKills: [false, true],
      lvAtMaxKills: 20,
      maxTime: 300,
      killsAtMaxTime: 999,
      dexAtMaxTime: [25, 6],
      shinyAtMaxTime: [false, true],
      lvAtMaxTime: 20,
      kills: 999,
      t: 300,
      lv: 20,
      dex: [25, 6],
      shiny: [false, true],
      uids: sortedUids,
      names: ['Hacked', 'Hacked']
    };

    const res = await commitGroupScore(boardId, groupId, docData, intruder.idToken);
    assert.strictEqual(res.status, 403, `Outsider was able to write group record: status ${res.status}`);
  });

  await t.test('3. Rejection of group submission with >4 players (Room size limit)', async () => {
    const fiveUids = [user1.uid, user2.uid, user3.uid, intruder.uid, 'extra_uid_5'].sort();
    const invalidGroupId = fiveUids.join('_');

    const docData = {
      maxKills: 50,
      timeAtMaxKills: 100,
      dexAtMaxKills: [1, 2, 3, 4, 5],
      shinyAtMaxKills: [false, false, false, false, false],
      lvAtMaxKills: 10,
      maxTime: 100,
      killsAtMaxTime: 50,
      dexAtMaxTime: [1, 2, 3, 4, 5],
      shinyAtMaxTime: [false, false, false, false, false],
      lvAtMaxTime: 10,
      kills: 50,
      t: 100,
      lv: 10,
      dex: [1, 2, 3, 4, 5],
      shiny: [false, false, false, false, false],
      uids: fiveUids,
      names: ['A', 'B', 'C', 'D', 'E']
    };

    const res = await commitGroupScore(boardId, invalidGroupId, docData, user1.idToken);
    assert.strictEqual(res.status, 403, `5-player group was unexpectedly accepted: status ${res.status}`);
  });

  await t.test('4. Rejection of impossible kill rate (Anti-Cheat: maxKills > 100 + time*25)', async () => {
    const docData = {
      maxKills: 50000, // 50,000 kills in 100 seconds = impossible
      timeAtMaxKills: 100,
      dexAtMaxKills: [25, 6],
      shinyAtMaxKills: [false, true],
      lvAtMaxKills: 15,
      maxTime: 100,
      killsAtMaxTime: 50000,
      dexAtMaxTime: [25, 6],
      shinyAtMaxTime: [false, true],
      lvAtMaxTime: 15,
      kills: 50000,
      t: 100,
      lv: 15,
      dex: [25, 6],
      shiny: [false, true],
      uids: sortedUids,
      names: ['Player1', 'Player2']
    };

    const res = await commitGroupScore(boardId, groupId, docData, user1.idToken);
    assert.strictEqual(res.status, 403, `Impossible kill rate was unexpectedly accepted: status ${res.status}`);
  });
});

test('RTDB server enforcement: four reservations, adversarial writes and reconnect', async t => {
  const users = await Promise.all(Array.from({length:6},(_,i)=>createAuthUser(`seat_${i}_${Date.now()}@test.vn`,'Pass123456!')));
  const [host,b,c,d,fifth,sixth]=users;
  const id='capacity_'+Date.now();
  const ref=(user,method,suffix='',body)=>httpRequest({hostname:'127.0.0.1',port:RTDB_PORT,path:`/rooms/${id}${suffix}.json?auth=${user.idToken}&ns=${RTDB_NS}`,method,headers:{'Content-Type':'application/json'}},body===undefined?null:JSON.stringify(body));
  const member=(slot)=>({name:'Trainer',dex:25,slot:String(slot),at:Date.now(),shiny:false});
  const join=(u,slot)=>ref(u,'PATCH','',{['m/'+u.uid]:member(slot),['slots/'+slot]:u.uid});
  const allow=res=>assert.equal(res.status,200,JSON.stringify(res.body));
  const deny=res=>assert.ok([401,403].includes(res.status),`Expected Rules denial, got ${res.status}: ${JSON.stringify(res.body)}`);
  allow(await ref(host,'PUT','',{host:host.uid,open:true,at:Date.now(),m:{[host.uid]:member(0)},slots:{0:host.uid}}));
  try {
    await t.test('2nd, 3rd and 4th authenticated players join atomically',async()=>{allow(await join(b,1));allow(await join(c,2));allow(await join(d,3));});
    await t.test('5th direct membership PUT denied for every existing seat',async()=>{for(let i=0;i<4;i++)deny(await ref(fifth,'PUT','/m/'+fifth.uid,member(i)));});
    await t.test('5th cannot create seat 4 using room multipath PATCH',async()=>deny(await join(fifth,4)));
    await t.test('5th cannot overwrite an occupied seat',async()=>{for(let i=0;i<4;i++)deny(await join(fifth,i));});
    await t.test('5th cannot omit the seat field',async()=>deny(await ref(fifth,'PUT','/m/'+fifth.uid,{name:'NoSeat',dex:25})));
    await t.test('UID field injection and unbounded member properties denied',async()=>deny(await ref(b,'PATCH','/m/'+b.uid,{uid:host.uid})));
    await t.test('host cannot change a member through root multipath PATCH',async()=>deny(await ref(host,'PATCH','',{['m/'+b.uid+'/name']:'Forged'})));
    await t.test('host cannot replace existing room with forged roster',async()=>deny(await ref(host,'PUT','',{host:host.uid,open:true,at:Date.now(),m:{[host.uid]:member(0),[b.uid]:member(1)},slots:{0:host.uid,1:b.uid}})));
    await t.test('outsider and host cannot read recipient signaling or ancestor room',async()=>{
      for(const u of [host,fifth]) {deny(await ref(u,'GET','/q/'+b.uid));deny(await ref(u,'GET'));}
    });
    const signalPath='/q/'+b.uid+'/'+host.uid+'~offer';
    await t.test('host signal accepted once and cannot be overwritten',async()=>{allow(await ref(host,'PUT',signalPath,JSON.stringify({f:host.uid,sig:{sdp:{type:'offer'}}})));deny(await ref(host,'PUT',signalPath,'replacement'));});
    await t.test('guest cannot forge host sender key or signal another guest',async()=>{deny(await ref(c,'PUT','/q/'+b.uid+'/'+host.uid+'~forged','forged'));deny(await ref(c,'PUT','/q/'+b.uid+'/'+c.uid+'~forged','forged'));});
    await t.test('member cannot send to an outsider',async()=>deny(await ref(host,'PUT','/q/'+fifth.uid+'/'+host.uid+'~offer','offer')));
    await t.test('recipient may read and remove own signal',async()=>{allow(await ref(b,'GET','/q/'+b.uid));allow(await ref(b,'DELETE',signalPath));});
    await t.test('cannot release reservation while membership remains',async()=>deny(await ref(b,'DELETE','/slots/1')));
    await t.test('guest reconnects with own reserved seat in a closed room',async()=>{
      allow(await ref(host,'PUT','/open',false));allow(await ref(b,'DELETE','/m/'+b.uid));
      deny(await join(fifth,1));allow(await join(b,1));
    });
    await t.test('host kicks atomically; kicked player cannot rejoin a closed room',async()=>{
      allow(await ref(host,'PATCH','',{['m/'+b.uid]:null,'slots/1':null}));deny(await join(b,1));
    });
    await t.test('two concurrent claims for the last seat: exactly one succeeds',async()=>{
      allow(await ref(host,'PUT','/open',true));
      const results=await Promise.all([join(fifth,1),join(sixth,1)]);
      assert.equal(results.filter(r=>r.status===200).length,1);deny(results.find(r=>r.status!==200));
      const roster=await ref(host,'GET','/m');allow(roster);assert.equal(Object.keys(roster.body).length,4);
    });
  } finally {allow(await ref(host,'DELETE'));}
});

test('Firestore compatibility: friend consent, invitations, unique group participants', async t => {
  const [a,b,x]=await Promise.all(['a','b','x'].map(n=>createAuthUser(`friend_${n}_${Date.now()}@test.vn`,'Pass123456!')));
  const pair=[a.uid,b.uid].sort().join('_');
  const doc=(p)=>`projects/${PROJECT_ID}/databases/(default)/documents/${p}`;
  async function put(u,p,data){return httpRequest({hostname:'127.0.0.1',port:FIRESTORE_PORT,path:`/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+u.idToken}},{writes:[{update:{name:doc(p),fields:toFirestoreFields(data)},updateTransforms:[{fieldPath:'at',setToServerValue:'REQUEST_TIME'}]}]});}
  const friendship={users:[a.uid,b.uid].sort(),from:a.uid,to:b.uid,status:'pending',names:{[a.uid]:'Alice',[b.uid]:'Bobby'}};
  await t.test('sender creates pending request',async()=>assert.equal((await put(a,'friendships/'+pair,friendship)).status,200));
  await t.test('sender cannot accept own request',async()=>assert.equal((await put(a,'friendships/'+pair,{...friendship,status:'ok'})).status,403));
  await t.test('outsider cannot accept request',async()=>assert.equal((await put(x,'friendships/'+pair,{...friendship,status:'ok'})).status,403));
  const invitation={from:a.uid,to:b.uid,name:'Alice',room:'compat_room'};
  await t.test('pending friendship cannot invite',async()=>assert.equal((await put(a,'inv/'+b.uid+'_'+a.uid,invitation)).status,403));
  await t.test('recipient accepts request',async()=>assert.equal((await put(b,'friendships/'+pair,{...friendship,status:'ok'})).status,200));
  await t.test('confirmed friend invitation remains supported',async()=>assert.equal((await put(a,'inv/'+b.uid+'_'+a.uid,invitation)).status,200));
  const record={kills:20,t:100,lv:5,uids:[a.uid,a.uid],names:['Alice','Alice']};
  await t.test('one UID repeated cannot impersonate a group',async()=>assert.equal((await commitGroupScore('gm_audit',record.uids.join('_'),record,a.idToken)).status,403));
  await t.test('arbitrary leaderboard mode rejected',async()=>assert.equal((await commitGroupScore('unknown_audit',pair,{...record,uids:[a.uid,b.uid].sort()},a.idToken)).status,403));
  for(const mode of ['g','gm'])await t.test(`${mode} leaderboard accepts valid legacy-shaped group score`,async()=>assert.equal((await commitGroupScore(mode+'_audit_'+Date.now(),pair,{...record,uids:[a.uid,b.uid].sort()},a.idToken)).status,200));
});
