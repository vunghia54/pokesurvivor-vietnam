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
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
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

test('Firebase Security Rules v1.3: Realtime Database Co-op Room & Signaling Isolation', async (t) => {
  const userA = await createAuthUser(`host_${Date.now()}@test.vn`, 'Pass123456!');
  const userB = await createAuthUser(`guest_${Date.now()}@test.vn`, 'Pass123456!');
  const userC = await createAuthUser(`intruder_${Date.now()}@test.vn`, 'Pass123456!');

  const roomId = `room_${Date.now()}`;

  await t.test('1. Host creates room successfully', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      host: userA.uid,
      open: true,
      at: Date.now(),
      m: {
        [userA.uid]: { name: 'PlayerA', dex: 25, at: Date.now() }
      }
    });
    assert.strictEqual(res.status, 200, `Host failed to create room: ${JSON.stringify(res.body)}`);
  });

  await t.test('2. Non-host cannot overwrite room ownership', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, {
      host: userB.uid
    });
    assert.ok(res.status === 401 || res.status === 403, `Non-host unexpectedly hijacked room: status ${res.status}`);
  });

  await t.test('3. Guest B joins room under their own UID', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/m/${userB.uid}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'PlayerB',
      dex: 6,
      at: Date.now()
    });
    assert.strictEqual(res.status, 200, `Guest failed to join: ${JSON.stringify(res.body)}`);
  });

  await t.test('4. Guest B cannot join under User C UID (Anti-Impersonation)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/m/${userC.uid}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'ImpersonatedC',
      dex: 1
    });
    assert.ok(res.status === 401 || res.status === 403, `Impersonation succeeded unexpectedly: status ${res.status}`);
  });

  await t.test('5. Room member A sends WebRTC signal to Member B', async () => {
    const msgId = `msg_${Date.now()}`;
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}/${msgId}.json?auth=${userA.idToken}&ns=${RTDB_NS}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(JSON.stringify({ type: 'offer', sdp: 'v=0...' })));
    assert.strictEqual(res.status, 200, `Member A failed to signal B: ${JSON.stringify(res.body)}`);
  });

  await t.test('6. Member B can read their own incoming signals', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}.json?auth=${userB.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body && Object.keys(res.body).length > 0, 'Signal payload missing');
  });

  await t.test('7. Intruder C cannot eavesdrop on B signals (Signaling Privacy)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: RTDB_PORT,
      path: `/rooms/${roomId}/q/${userB.uid}.json?auth=${userC.idToken}&ns=${RTDB_NS}`,
      method: 'GET'
    });
    assert.ok(res.status === 401 || res.status === 403, `Intruder C eavesdropped on signaling: status ${res.status}`);
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
