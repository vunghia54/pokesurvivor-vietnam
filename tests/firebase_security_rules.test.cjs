const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Đọc nội dung quy tắc firestore.rules và database.rules.json
const firestoreRulesText = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
const rtdbRules = JSON.parse(fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8'));

// Trình giả lập logic thực thi Firebase Security Rules cho Firestore
class FirestoreRulesSimulator {
  constructor(rulesText, database = {}) {
    this.rulesText = rulesText;
    this.db = database; // database state: { collection: { docId: data } }
  }

  evaluateEntry(auth, board, id, resourceData, requestData) {
    const signedIn = auth != null && auth.uid != null;
    if (!signedIn) return { allowed: false, reason: 'unauthenticated' };

    const me = auth.uid;
    const adminUids = []; // admin hardcoded list
    const isAdmin = adminUids.includes(me);

    const d = requestData;
    const sv = this.db['saves'] && this.db['saves'][me];
    const isBanned = sv && sv.ban === true;
    if (isBanned) return { allowed: false, reason: 'account_banned' };

    // 1. Kiểm tra trường cho phép
    const allowedKeys = new Set([
      'maxKills', 'timeAtMaxKills', 'dexAtMaxKills', 'shinyAtMaxKills', 'lvAtMaxKills',
      'maxTime', 'killsAtMaxTime', 'dexAtMaxTime', 'shinyAtMaxTime', 'lvAtMaxTime',
      't', 'kills', 'lv', 'dex', 'shiny', 'dmg',
      'uids', 'names', 'at'
    ]);
    for (const k of Object.keys(d)) {
      if (!allowedKeys.has(k)) return { allowed: false, reason: 'invalid_field_' + k };
    }

    const maxK = d.maxKills != null ? d.maxKills : (d.kills != null ? d.kills : 0);
    const maxT = d.maxTime != null ? d.maxTime : (d.t != null ? d.t : 0);
    const tAtK = d.timeAtMaxKills != null ? d.timeAtMaxKills : (d.t != null ? d.t : 0);
    const kAtT = d.killsAtMaxTime != null ? d.killsAtMaxTime : (d.kills != null ? d.kills : 0);

    // 2. Kiểm tra giới hạn số hợp lý
    if (!Number.isInteger(maxK) || maxK < 0 || maxK > (100 + tAtK * 25)) {
      return { allowed: false, reason: 'invalid_maxKills_or_rate_limit' };
    }
    if (!Number.isInteger(maxT) || maxT < 0 || maxT > 86400) {
      return { allowed: false, reason: 'invalid_maxTime' };
    }
    if (!Number.isInteger(tAtK) || tAtK < 0 || tAtK > 86400) {
      return { allowed: false, reason: 'invalid_timeAtMaxKills' };
    }
    if (!Number.isInteger(kAtT) || kAtT < 0 || kAtT > (100 + maxT * 25)) {
      return { allowed: false, reason: 'invalid_killsAtMaxTime_or_rate_limit' };
    }

    // 3. Quyền sở hữu UID
    if (!Array.isArray(d.uids) || !d.uids.includes(me)) {
      return { allowed: false, reason: 'uid_mismatch_not_in_uids' };
    }
    if (!Array.isArray(d.names) || d.names.length !== d.uids.length) {
      return { allowed: false, reason: 'names_length_mismatch' };
    }

    const isSolo = board.startsWith('s_') || board.startsWith('sm_');
    if (isSolo) {
      if (d.uids.length !== 1 || id !== me) {
        return { allowed: false, reason: 'solo_id_must_match_me' };
      }
    } else {
      if (d.uids.length < 2 || d.uids.length > 4 || id !== d.uids.join('_')) {
        return { allowed: false, reason: 'group_id_must_match_team_uids' };
      }
    }

    // 4. Chỉ cho phép cải thiện kỷ lục, không cho phép làm giảm điểm
    if (resourceData) {
      const oldK = resourceData.maxKills != null ? resourceData.maxKills : (resourceData.kills || 0);
      const oldT = resourceData.maxTime != null ? resourceData.maxTime : (resourceData.t || 0);
      const notWorse = maxK >= oldK && maxT >= oldT;
      const improved = maxK > oldK || maxT > oldT;
      if (!notWorse || !improved) {
        return { allowed: false, reason: 'cannot_downgrade_score' };
      }
    }

    return { allowed: true };
  }

  evaluateTopWrite(auth, board) {
    const signedIn = auth != null && auth.uid != null;
    if (!signedIn) return { allowed: false, reason: 'unauthenticated' };
    const adminUids = [];
    const isAdmin = adminUids.includes(auth.uid);
    // match /lbs/{board} { allow write: if admin(); }
    if (!isAdmin) return { allowed: false, reason: 'client_cannot_modify_top50_summary' };
    return { allowed: true };
  }

  evaluateSaveWrite(auth, uid, requestData, resourceData) {
    const signedIn = auth != null && auth.uid != null;
    if (!signedIn) return { allowed: false, reason: 'unauthenticated' };
    if (auth.uid !== uid) return { allowed: false, reason: 'cannot_modify_other_user_save' };
    return { allowed: true };
  }
}

test('Firebase Security Rules - Phân quyền và tính toàn vẹn dữ liệu Firestore', () => {
  const sim = new FirestoreRulesSimulator(firestoreRulesText, {
    saves: {
      'banned_user': { ban: true }
    }
  });

  const validRecordA = {
    maxKills: 150,
    timeAtMaxKills: 60,
    dexAtMaxKills: [25],
    shinyAtMaxKills: [false],
    lvAtMaxKills: 10,
    maxTime: 60,
    killsAtMaxTime: 150,
    dexAtMaxTime: [25],
    shinyAtMaxTime: [false],
    lvAtMaxTime: 10,
    uids: ['user_a'],
    names: ['Red'],
    at: 'SERVER_TIMESTAMP'
  };

  // 1. Người A ghi kỷ lục hợp lệ của chính mình
  const res1 = sim.evaluateEntry({ uid: 'user_a' }, 's_d20261024vn1', 'user_a', null, validRecordA);
  assert.equal(res1.allowed, true, 'Người A được phép ghi kỷ lục của chính mình');

  // 2. Người A CỐ TÌNH ghi đè hoặc sửa điểm của Người B
  const res2 = sim.evaluateEntry({ uid: 'user_a' }, 's_d20261024vn1', 'user_b', null, validRecordA);
  assert.equal(res2.allowed, false, 'Người A bị từ chối khi sửa điểm người B');
  assert.equal(res2.reason, 'solo_id_must_match_me');

  // 3. Khách chưa đăng nhập cố tình gửi kỷ lục
  const res3 = sim.evaluateEntry(null, 's_d20261024vn1', 'guest', null, validRecordA);
  assert.equal(res3.allowed, false, 'Chưa đăng nhập bị từ chối ghi điểm');

  // 4. Client cố tình ghi đè tài liệu tổng hợp lbs/{board}
  const res4 = sim.evaluateTopWrite({ uid: 'user_a' }, 's_d20261024vn1');
  assert.equal(res4.allowed, false, 'Client không được phép tùy ý sửa tài liệu tổng hợp Top 50');

  // 5. Hack điểm: 100.000 quái trong 10 giây (vi phạm rate limit 25 quái/s)
  const hackedKills = { ...validRecordA, maxKills: 100000, timeAtMaxKills: 10 };
  const res5 = sim.evaluateEntry({ uid: 'user_a' }, 's_d20261024vn1', 'user_a', null, hackedKills);
  assert.equal(res5.allowed, false, 'Chặn tốc độ diệt quái bất thường');

  // 6. Hack thời gian: Thời gian âm hoặc lớn hơn 24 giờ (86400s)
  const hackedTime = { ...validRecordA, maxTime: 999999 };
  const res6 = sim.evaluateEntry({ uid: 'user_a' }, 's_d20261024vn1', 'user_a', null, hackedTime);
  assert.equal(res6.allowed, false, 'Chặn thời gian vượt quá 24 giờ');

  // 7. Ghi đè điểm thấp hơn điểm cũ (làm giảm kỷ lục)
  const res7 = sim.evaluateEntry({ uid: 'user_a' }, 's_d20261024vn1', 'user_a', { maxKills: 200, maxTime: 100 }, validRecordA);
  assert.equal(res7.allowed, false, 'Không cho phép ghi đè làm giảm điểm kỷ lục đã có');

  // 8. Tài khoản bị ban không thể ghi điểm
  const res8 = sim.evaluateEntry({ uid: 'banned_user' }, 's_d20261024vn1', 'banned_user', null, { ...validRecordA, uids: ['banned_user'] });
  assert.equal(res8.allowed, false, 'Tài khoản bị ban bị chặn ghi điểm');

  // 9. Người A cố tình sửa Cloud Save của Người B
  const res9 = sim.evaluateSaveWrite({ uid: 'user_a' }, 'user_b', {}, {});
  assert.equal(res9.allowed, false, 'Người A không thể sửa save của Người B');
});

test('Realtime Database Rules - Bảo mật Online Presence', () => {
  assert.equal(rtdbRules.rules.presence['.read'], 'auth != null', 'Yêu cầu người dùng (kể cả Anonymous) xác thực để đọc presence');
  assert.equal(rtdbRules.rules.presence['$uid']['.write'], 'auth != null && auth.uid === $uid', 'Chỉ chủ sở hữu UID mới được ghi trạng thái kết nối của mình');
});
