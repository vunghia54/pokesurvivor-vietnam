/* ============ ranking.js — Bảng Xếp Hạng Diệt Quái & Sinh Tồn Online ============
 * PokéSurvivor Việt Nam v1.2:
 *
 *   lbs/{tabla}        TỔNG HỢP: Top 50 Diệt Quái (ktop) & Top 50 Sinh Tồn (ttop) trong 1 document
 *                      { ktop: { id: { kills, t, uids, names, dex, shiny, lv } },
 *                        ttop: { id: { t, kills, uids, names, dex, shiny, lv } },
 *                        me_k, ev_k, me_t, ev_t }
 *                      Đọc 1 lần nạp được cả 2 bảng xếp hạng (1 lần đọc Firestore duy nhất).
 *   lb/{tabla}/e/{id}  Bản ghi chi tiết của người chơi / nhóm:
 *                      - maxKills + timeAtMaxKills: Kỷ lục diệt quái cao nhất trong 1 trận.
 *                      - maxTime + killsAtMaxTime: Kỷ lục sinh tồn lâu nhất trong 1 trận.
 *                      Hai kỷ lục độc lập, không ghi đè lẫn nhau nếu đến từ 2 trận khác nhau.
 *
 *   Chế độ (Mode):
 *     s_   : Solo Thường (Standard)       sm_ : Solo 8 Kỹ Năng Multi-Cast
 *     g_   : Nhóm Thường (Co-op Standard)  gm_ : Nhóm 8 Kỹ Năng Multi-Cast
 *
 *   Múi giờ & Kỳ xếp hạng:
 *     Múi giờ Việt Nam: Asia/Ho_Chi_Minh (UTC+7)
 *     d: Hôm nay (Daily)      w: Tuần này (ISO Week)
 *     m: Tháng này (Monthly)  a: Mọi thời đại (All-Time)
 *     Hậu tố thế hệ: vn1 (ví dụ: s_d20261024vn1, sm_all_vn1)
 */
G.Ranking = (() => {
  const TZ = 'Asia/Ho_Chi_Minh';
  const PERIODS = [['d', 'Hôm nay'], ['w', 'Tuần này'], ['m', 'Tháng này'], ['a', 'Mọi thời đại']];
  const MODES = [
    ['s', 'Solo Thường'],
    ['sm', '⚡ Solo 8 Chiêu'],
    ['g', 'Nhóm Thường'],
    ['gm', '⚡ Nhóm 8 Chiêu']
  ];
  const TOP_ONLY = new Set(['d', 'w', 'm', 'p']);
  const TOP = 50;

  // Điều kiện chống spam: Trận đấu hợp lệ phải từ 30s trở lên HOẶC tiêu diệt từ 10 quái
  const MIN_T = 30;
  const MIN_KILLS = 10;
  // Bảng xếp hạng theo từng Pokémon chỉ tính trong Mọi thời đại (tối thiểu 120s)
  const MIN_T_MON = 120;
  // Cache đọc bảng: 5 phút trong localStorage (cập nhật mới kịp thời, không hiển thị thành tích cũ)
  const TTL = 5 * 60 * 1000;
  const GEN = 'vn1';
  const ALL = 'all_vn1';

  const fbx = () => (G.DB && G.DB.online) ? G.DB.fb : null;

  // ---------------- Múi giờ & Kỳ xếp hạng (Asia/Ho_Chi_Minh) ----------------

  function vnDate(date = new Date()) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)) {
      p[x.type] = x.value;
    }
    return { y: +p.year, m: +p.month, d: +p.day };
  }

  function isoWeek(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
  }

  function periodIds(date = new Date()) {
    const { y, m, d } = vnDate(date);
    const w = isoWeek(y, m, d);
    const p2 = n => String(n).padStart(2, '0');
    return {
      d: 'd' + y + p2(m) + p2(d),
      w: 'w' + w.year + '-' + p2(w.week),
      m: 'm' + y + p2(m),
      y: 'y' + y,
      a: ALL
    };
  }

  function boardIds(date) {
    const p = periodIds(date);
    return {
      d: p.d + GEN,
      w: p.w + GEN,
      m: p.m + GEN,
      y: p.y + GEN,
      a: ALL
    };
  }

  function board(mode = 's', period = 'd', dex = null) {
    return mode + '_' + boardIds()[period] + (dex && period === 'a' ? '_p' + dex : '');
  }

  const col = b => fbx().fs.collection('lb').doc(b).collection('e');
  const sumRef = b => fbx().fs.collection('lbs').doc(b);

  // ---------------- Bộ nhớ đệm (Cache) ----------------

  const mem = new Map();
  const RANK_TTL = 6 * 3600 * 1000;
  const ttlOf = k => (k.startsWith('r:') ? RANK_TTL : TTL);

  function cacheGet(k) {
    let c = mem.get(k);
    if (!c) {
      try { c = JSON.parse(localStorage.getItem('ps.rk.c.' + k) || 'null'); } catch (e) { c = null; }
      if (c) mem.set(k, c);
    }
    return (c && Date.now() - c.at < ttlOf(k)) ? c.v : undefined;
  }

  function cacheSet(k, v) {
    const c = { at: Date.now(), v };
    mem.set(k, c);
    try { localStorage.setItem('ps.rk.c.' + k, JSON.stringify(c)); } catch (e) {}
  }

  function cachePrune() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('ps.rk.c.')) continue;
        const c = JSON.parse(localStorage.getItem(k) || 'null');
        if (!c || Date.now() - c.at > ttlOf(k.slice(8))) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  cachePrune();

  // Kỷ lục cá nhân tốt nhất đã lưu trên máy
  const bestKey = () => 'ps.rk.best.vn.' + ((fbx() && fbx().uid) || 'guest');
  function bests() {
    try { return JSON.parse(localStorage.getItem(bestKey()) || '{}'); } catch (e) { return {}; }
  }
  function saveBests(b) {
    try { localStorage.setItem(bestKey(), JSON.stringify(b)); } catch (e) {}
  }

  // Ngưỡng điểm của Top 50 trong từng bảng
  const THR = 'ps.rk.thr.vn';
  function thresholds() {
    try { return JSON.parse(localStorage.getItem(THR) || '{}'); } catch (e) { return {}; }
  }

  function noteTop(b, sum) {
    const t = thresholds();
    let changed = false;
    if (sum.ktop) {
      const valsK = Object.values(sum.ktop);
      if (valsK.length >= TOP) {
        const lowK = Math.min(...valsK.map(v => v.kills));
        if ((t[b + '#k'] || 0) < lowK) { t[b + '#k'] = lowK; changed = true; }
      }
    }
    if (sum.ttop) {
      const valsT = Object.values(sum.ttop);
      if (valsT.length >= TOP) {
        const lowT = Math.min(...valsT.map(v => v.t));
        if ((t[b + '#t'] || 0) < lowT) { t[b + '#t'] = lowT; changed = true; }
      }
    }
    if (changed) {
      try { localStorage.setItem(THR, JSON.stringify(t)); } catch (e) {}
    }
  }

  // ---------------- Xử lý dữ liệu & Sắp xếp ----------------

  const rowOf = (id, v) => {
    const U = G.U; v = v || {};
    return {
      id: U.str(String(id), 200),
      kills: U.int(v.kills != null ? v.kills : (v.maxKills != null ? v.maxKills : 0), 1e9),
      t: U.int(v.t != null ? v.t : (v.timeAtMaxKills != null ? v.timeAtMaxKills : (v.maxTime != null ? v.maxTime : 0)), 86400),
      uids: U.list(v.uids, 4).map(x => U.str(x, 128)),
      names: U.list(v.names, 4).map(x => U.str(x, 24)),
      dex: U.list(v.dex, 4).map(x => U.int(x, 2000)),
      shiny: U.list(v.shiny, 4).map(x => x === true),
      lv: U.int(v.lv, 999) || 1
    };
  };

  // 1. Sắp xếp Bảng Diệt Quái: Số quái giảm dần, hòa ưu tiên sống lâu hơn
  const sortedKills = ktop => Object.entries(ktop || {})
    .map(([id, v]) => rowOf(id, v))
    .sort((a, b) => (b.kills - a.kills) || (b.t - a.t));

  // 2. Sắp xếp Bảng Sinh Tồn: Thời gian giảm dần, hòa ưu tiên diệt nhiều quái hơn
  const sortedTime = ttop => Object.entries(ttop || {})
    .map(([id, v]) => rowOf(id, v))
    .sort((a, b) => (b.t - a.t) || (b.kills - a.kills));

  const shinyOf = (e, row) => {
    if (e.shiny && e.shiny.some(Boolean)) row.shiny = e.shiny;
    return row;
  };

  const rowK = e => {
    const row = {
      kills: e.maxKills,
      t: e.timeAtMaxKills,
      uids: e.uids,
      names: e.names,
      dex: e.dexAtMaxKills,
      lv: e.lvAtMaxKills
    };
    const s = e.shinyAtMaxKills || e.shiny;
    if (s && s.some(Boolean)) row.shiny = s;
    return row;
  };

  const rowT = e => {
    const row = {
      t: e.maxTime,
      kills: e.killsAtMaxTime,
      uids: e.uids,
      names: e.names,
      dex: e.dexAtMaxTime,
      lv: e.lvAtMaxTime
    };
    const s = e.shinyAtMaxTime || e.shiny;
    if (s && s.some(Boolean)) row.shiny = s;
    return row;
  };

  // ---------------- Lưu trữ thành tích vào Firestore ----------------

  let busy = Promise.resolve();
  function track(p) { busy = p.catch(() => {}); return p; }

  async function store(boards, id, entry) {
    const fb = fbx();
    if (!fb) return [];
    const better = [];
    const known = bests();
    const thr = thresholds();

    await Promise.all(boards.map(async ([b, period]) => {
      const keyK = b + ':k:' + id;
      const keyT = b + ':t:' + id;

      try {
        const topOnly = TOP_ONLY.has(period);
        const thrK = thr[b + '#k'] || 0;
        const thrT = thr[b + '#t'] || 0;
        const cached = cacheGet('S:' + b);

        const canK = !thrK || entry.kills > thrK || !!(cached && cached.ktop && id in cached.ktop);
        const canT = !thrT || entry.t > thrT || !!(cached && cached.ttop && id in cached.ttop);

        if (topOnly && !canK && !canT) return;

        // Kiểm tra xem kỷ lục mới có vượt qua kỷ lục đã lưu không
        const curKnownK = known[keyK] || 0;
        const curKnownT = known[keyT] || 0;
        const beatsKnownK = entry.kills > curKnownK;
        const beatsKnownT = entry.t > curKnownT;

        if (!beatsKnownK && !beatsKnownT && known[keyK] !== undefined && known[keyT] !== undefined) {
          return;
        }

        let wrote = false;
        const docRef = col(b).doc(id);
        const oldSnap = await docRef.get().catch(() => null);
        const o = (oldSnap && oldSnap.exists) ? oldSnap.data() : null;
        const oldMaxK = o ? (o.maxKills != null ? o.maxKills : (o.kills || 0)) : 0;
        const oldMaxT = o ? (o.maxTime != null ? o.maxTime : (o.t || 0)) : 0;

        const isRealUpK = entry.kills > oldMaxK;
        const isRealUpT = entry.t > oldMaxT;

        if (!isRealUpK && !isRealUpT && o) {
          known[keyK] = oldMaxK;
          known[keyT] = oldMaxT;
          return;
        }

        const newDoc = {
          maxKills: isRealUpK ? entry.kills : oldMaxK,
          timeAtMaxKills: isRealUpK ? entry.t : (o ? (o.timeAtMaxKills || o.t || 0) : 0),
          dexAtMaxKills: isRealUpK ? entry.dex : (o ? (o.dexAtMaxKills || o.dex || entry.dex) : entry.dex),
          shinyAtMaxKills: isRealUpK ? entry.shiny : (o ? (o.shinyAtMaxKills || o.shiny || entry.shiny) : entry.shiny),
          lvAtMaxKills: isRealUpK ? entry.lv : (o ? (o.lvAtMaxKills || o.lv || 1) : 1),

          maxTime: isRealUpT ? entry.t : oldMaxT,
          killsAtMaxTime: isRealUpT ? entry.kills : (o ? (o.killsAtMaxTime || o.kills || 0) : 0),
          dexAtMaxTime: isRealUpT ? entry.dex : (o ? (o.dexAtMaxTime || o.dex || entry.dex) : entry.dex),
          shinyAtMaxTime: isRealUpT ? entry.shiny : (o ? (o.shinyAtMaxTime || o.shiny || entry.shiny) : entry.shiny),
          lvAtMaxTime: isRealUpT ? entry.lv : (o ? (o.lvAtMaxTime || o.lv || 1) : 1),

          kills: isRealUpK ? entry.kills : oldMaxK,
          t: isRealUpT ? entry.t : oldMaxT,
          lv: Math.max(entry.lv || 1, o ? (o.lv || 1) : 1),
          dex: entry.dex,
          shiny: entry.shiny,

          uids: entry.uids,
          names: entry.names,
          at: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
            ? firebase.firestore.FieldValue.serverTimestamp()
            : new Date().toISOString()
        };

        // Ghi trực tiếp vào document của chính mình (chỉ 1 document write, an toàn tuyệt đối)
        await docRef.set(newDoc);
        wrote = true;

        known[keyK] = newDoc.maxKills;
        known[keyT] = newDoc.maxTime;

        // Cập nhật ngay vào cache hiển thị nếu bảng này đang mở
        let cachedSum = cacheGet('S:' + b);
        if (!cachedSum) cachedSum = { ktop: {}, ttop: {} };
        if (isRealUpK) cachedSum.ktop[id] = rowK(newDoc);
        if (isRealUpT) cachedSum.ttop[id] = rowT(newDoc);
        cacheSet('S:' + b, cachedSum);
        noteTop(b, cachedSum);

        known[keyK] = Math.max(known[keyK] || 0, entry.kills);
        known[keyT] = Math.max(known[keyT] || 0, entry.t);

        if (wrote && period && period !== 'p' && !better.includes(period)) {
          better.push(period);
        }
      } catch (e) {
        console.warn('[Ranking] Không thể lưu tại', b, e.code || e.message);
      }
    }));

    saveBests(known);
    return better;
  }

  function announce(better) {
    if (!better.length) return;
    const names = { d: 'hôm nay', w: 'tuần này', m: 'tháng này', a: 'mọi thời đại' };
    const best = PERIODS.map(p => p[0]).filter(p => better.includes(p)).pop();
    if (G.UI && G.UI.toast) G.UI.toast('🎉 Kỷ lục mới ' + (names[best] || '') + ' trên Bảng Xếp Hạng!', 3600);
  }

  // ---------------- Ghi nhận điểm Solo & Nhóm ----------------

  function submitSolo(r) { return track(submitSoloNow(r)); }
  async function submitSoloNow(r) {
    const fb = fbx();
    if (!fb || !G.Social.me) return [];
    if (r.t < MIN_T && r.kills < MIN_KILLS) return [];

    const mode = r.mode || 's'; // 's' (Solo Thường) hoặc 'sm' (Solo 8 Chiêu)
    const ids = boardIds();
    const entry = {
      t: r.t,
      kills: r.kills,
      lv: r.lv || 1,
      uids: [fb.uid],
      names: [G.Social.me.name],
      dex: [r.dex],
      shiny: [!!r.shiny]
    };

    const boards = PERIODS.map(([p]) => [mode + '_' + ids[p], p]);
    if (r.t >= MIN_T_MON) {
      boards.push([mode + '_' + ALL + '_p' + r.dex, 'p']);
    }

    const better = await store(boards, fb.uid, entry);
    announce(better);
    return better;
  }

  function submitGroup(r) { return track(submitGroupNow(r)); }
  async function submitGroupNow(r) {
    const fb = fbx();
    if (!fb || !r.members || r.members.length < 2) return [];
    if (r.t < MIN_T && r.kills < MIN_KILLS) return [];

    const mode = r.mode || 'g'; // 'g' (Nhóm Thường) hoặc 'gm' (Nhóm 8 Chiêu)
    const ms = r.members.slice().sort((a, b) => (a.uid < b.uid ? -1 : 1));
    const id = ms.map(m => m.uid).join('_');
    const entry = {
      t: r.t,
      kills: r.kills,
      lv: r.lv || 1,
      uids: ms.map(m => m.uid),
      names: ms.map(m => m.name),
      dex: ms.map(m => m.dex),
      shiny: ms.map(m => !!m.shiny)
    };

    const ids = boardIds();
    const boards = PERIODS.map(([p]) => [mode + '_' + ids[p], p]);
    if (r.t >= MIN_T_MON) {
      for (const d of new Set(entry.dex)) {
        boards.push([mode + '_' + ALL + '_p' + d, 'p']);
      }
    }

    const better = await store(boards, id, entry);
    announce(better);
    return better;
  }

  // Checkpoint định kỳ trong trận đấu (tối đa 3 phút/lần và chỉ ghi khi vượt kỷ lục)
  let lastCheckpointTime = 0;
  function checkpoint(r) {
    const now = Date.now();
    if (now - lastCheckpointTime < 180000) return;
    lastCheckpointTime = now;
    submitSoloNow(r).catch(() => {});
  }

  // ---------------- Đọc dữ liệu Bảng Xếp Hạng ----------------

  const inflight = new Map();
  async function sumOf(b) {
    const c = cacheGet('S:' + b);
    if (c !== undefined) return c;
    if (!inflight.has(b)) {
      inflight.set(b, (async () => {
        try {
          const fb = fbx();
          if (!fb) return { ktop: {}, ttop: {} };

          // 1. Thử đọc từ tài liệu tổng hợp nếu có
          let d = null;
          try {
            const s = await sumRef(b).get();
            if (s.exists) d = s.data();
          } catch (e) {}

          if (d && (d.ktop || d.ttop || d.top)) {
            const sum = {
              ktop: d.ktop || {},
              ttop: d.ttop || d.top || {}
            };
            cacheSet('S:' + b, sum);
            noteTop(b, sum);
            return sum;
          }

          // 2. Truy vấn trực tiếp từ bảng cá nhân col(b).doc(id)
          const [snapK, snapT] = await Promise.all([
            col(b).orderBy('maxKills', 'desc').limit(TOP).get().catch(() => null),
            col(b).orderBy('maxTime', 'desc').limit(TOP).get().catch(() => null)
          ]);

          const ktop = {};
          if (snapK && snapK.docs) {
            snapK.docs.forEach(doc => {
              const row = rowK(doc.data());
              row.id = doc.id;
              ktop[doc.id] = row;
            });
          }

          const ttop = {};
          if (snapT && snapT.docs) {
            snapT.docs.forEach(doc => {
              const row = rowT(doc.data());
              row.id = doc.id;
              ttop[doc.id] = row;
            });
          }

          const sum = { ktop, ttop };
          cacheSet('S:' + b, sum);
          noteTop(b, sum);
          return sum;
        } catch (err) {
          console.warn('[Ranking] Lỗi khi nạp dữ liệu bảng', b, err.code || err.message);
          return { ktop: {}, ttop: {} };
        }
      })().finally(() => inflight.delete(b)));
    }
    return inflight.get(b);
  }

  async function circleOf(fb) {
    if (!fb || !G.Social.ensureFriends) return [];
    await G.Social.ensureFriends();
    return [fb.uid, ...G.Social.friends.filter(f => f.status === 'ok').map(f => f.uid)].slice(0, 30);
  }

  async function topKills(mode, period, dex, friendsOnly) {
    const b = board(mode, period, dex);
    let rows = sortedKills((await sumOf(b)).ktop);
    const fb = fbx();
    if (friendsOnly && fb) {
      const circle = await circleOf(fb);
      rows = rows.filter(r => r.uids.some(u => circle.includes(u)));
    }
    return rows.slice(0, TOP);
  }

  async function topTime(mode, period, dex, friendsOnly) {
    const b = board(mode, period, dex);
    let rows = sortedTime((await sumOf(b)).ttop);
    const fb = fbx();
    if (friendsOnly && fb) {
      const circle = await circleOf(fb);
      rows = rows.filter(r => r.uids.some(u => circle.includes(u)));
    }
    return rows.slice(0, TOP);
  }

  async function myRankKills(mode, period, dex) {
    const fb = fbx();
    if (!fb || !G.Social.me) return null;
    const b = board(mode, period, dex);
    const rows = sortedKills((await sumOf(b)).ktop);
    const i = rows.findIndex(r => r.uids.includes(fb.uid));
    if (i >= 0) return { pos: i + 1, kills: rows[i].kills, t: rows[i].t, row: rows[i] };
    const known = bests();
    const curK = known[b + ':k:' + fb.uid] || 0;
    const curT = known[b + ':t:' + fb.uid] || 0;
    return { out: true, kills: curK, t: curT };
  }

  async function myRankTime(mode, period, dex) {
    const fb = fbx();
    if (!fb || !G.Social.me) return null;
    const b = board(mode, period, dex);
    const rows = sortedTime((await sumOf(b)).ttop);
    const i = rows.findIndex(r => r.uids.includes(fb.uid));
    if (i >= 0) return { pos: i + 1, t: rows[i].t, kills: rows[i].kills, row: rows[i] };
    const known = bests();
    const curK = known[b + ':k:' + fb.uid] || 0;
    const curT = known[b + ':t:' + fb.uid] || 0;
    return { out: true, kills: curK, t: curT };
  }

  function runStarted(mode) {
    const fb = fbx();
    if (!fb) return;
    try {
      fb.fs.collection('saves').doc(fb.uid).collection('meta').doc('run').set({
        mode: mode || 's',
        at: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    } catch (e) {}
  }

  async function removeMine() {
    const fb = fbx();
    if (!fb) return;
    try {
      const ids = boardIds();
      const boards = [];
      for (const [m] of MODES) {
        for (const [p] of PERIODS) {
          boards.push(m + '_' + ids[p]);
        }
      }
      await Promise.all(boards.map(b => removeEntry(b, fb.uid)));
    } catch (e) {}
  }

  function isAdmin() {
    return fbx() && ['admin'].includes(fbx().uid);
  }

  const reportedMarks = new Set();
  function reported() { return reportedMarks; }
  async function report(b, r) {
    const fb = fbx();
    if (!fb) return;
    reportedMarks.add(b + '__' + r.id);
    try {
      await fb.fs.collection('reports').doc(b + '__' + r.id + '__' + fb.uid).set({
        board: b,
        id: r.id,
        reporter: fb.uid,
        row: r,
        at: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {}
  }

  async function reports() {
    const fb = fbx();
    if (!fb) return [];
    try {
      const s = await fb.fs.collection('reports').orderBy('at', 'desc').limit(400).get();
      const by = new Map();
      for (const d of s.docs) {
        const v = d.data(), k = v.board + '__' + v.id;
        if (!by.has(k)) {
          const r = v.row || {};
          by.set(k, {
            board: v.board,
            e: v.id,
            names: r.names || [],
            t: r.t || 0,
            kills: r.kills || 0,
            dex: r.dex || [],
            n: 0,
            ids: [],
            at: v.at && v.at.toMillis ? v.at.toMillis() : 0
          });
        }
        const g = by.get(k);
        g.n++;
        g.ids.push(d.id);
      }
      return [...by.values()].sort((a, b) => b.n - a.n || b.at - a.at);
    } catch (e) {
      return [];
    }
  }

  async function entryInfo(b, e) {
    const sum = await sumOf(b);
    return (sum.ktop && sum.ktop[e]) ? rowOf(e, sum.ktop[e]) : ((sum.ttop && sum.ttop[e]) ? rowOf(e, sum.ttop[e]) : null);
  }

  async function removeEntry(b, e) {
    const fb = fbx();
    if (!fb) return;
    await col(b).doc(e).delete().catch(() => {});
    await fb.fs.runTransaction(async tx => {
      const s = await tx.get(sumRef(b));
      const d = s.exists ? s.data() : {};
      const ktop = Object.assign({}, d.ktop || {});
      const ttop = Object.assign({}, d.ttop || {});
      if (!(e in ktop) && !(e in ttop)) return;
      delete ktop[e];
      delete ttop[e];
      tx.set(sumRef(b), {
        ktop,
        ttop,
        me_k: '',
        ev_k: e,
        me_t: '',
        ev_t: e
      });
    }).catch(err => console.warn('[Ranking] removeEntry:', b, err.code || err.message));
    mem.delete('S:' + b);
    try { localStorage.removeItem('ps.rk.c.S:' + b); } catch (e) {}
  }

  async function removeEverywhere(e, mode, dexes = [], also = null) {
    const ids = boardIds();
    const boards = new Set(PERIODS.map(([p]) => mode + '_' + ids[p]));
    for (const d of dexes) boards.add(mode + '_' + ALL + '_p' + d);
    if (also) boards.add(also);
    await Promise.all([...boards].map(b => removeEntry(b, e)));
  }

  async function purgeAbove(maxT, onProgress) {
    const fb = fbx();
    if (!fb) return { rows: 0, boards: 0 };
    const fs = fb.fs;
    const all = await fs.collection('lbs').get();
    let rows = 0, boards = 0, n = 0;
    for (const d of all.docs) {
      n++;
      if (onProgress && n % 50 === 0) onProgress(n, all.size);
      const data = d.data();
      const ttop = data.ttop || {};
      const bad = Object.keys(ttop).filter(id => (ttop[id].t || 0) > maxT);
      if (!bad.length) continue;
      await fs.runTransaction(async tx => {
        const s = await tx.get(d.ref);
        const cur = Object.assign({}, (s.exists && s.data().ttop) || {});
        const gone = Object.keys(cur).filter(id => (cur[id].t || 0) > maxT);
        if (!gone.length) return;
        for (const id of gone) delete cur[id];
        tx.set(d.ref, { ktop: s.data().ktop || {}, ttop: cur, me_k: '', ev_k: '', me_t: '', ev_t: gone[0] });
      }).catch(() => {});
      await Promise.all(bad.map(id => fs.collection('lb').doc(d.id).collection('e').doc(id).delete().catch(() => {})));
      rows += bad.length;
      boards++;
      mem.delete('S:' + d.id);
      try { localStorage.removeItem('ps.rk.c.S:' + d.id); } catch (e) {}
    }
    return { rows, boards };
  }

  function setMarked(uid, on) {
    const fb = fbx();
    if (!fb) return Promise.resolve();
    return fb.fs.collection('saves').doc(uid).update({ ban: !!on });
  }

  function dismiss(ids) {
    const fb = fbx();
    if (!fb) return Promise.resolve();
    return Promise.all(ids.map(id => fb.fs.collection('reports').doc(id).delete().catch(() => {})));
  }

  async function markedAccounts() {
    const fb = fbx();
    if (!fb) return [];
    const s = await fb.fs.collection('saves').where('ban', '==', true).limit(100).get();
    return s.docs.map(d => {
      const v = d.data().save || {};
      return {
        uid: d.id,
        name: v.name || '?',
        coins: v.coins || 0,
        t1: (v.tickets || {}).t1 || 0,
        t10: (v.tickets || {}).t10 || 0,
        owned: Object.keys(v.owned || {}).length
      };
    });
  }

  return {
    PERIODS,
    MODES,
    board,
    boardIds,
    periodIds,
    runStarted,
    removeMine,
    submitSolo,
    submitGroup,
    checkpoint,
    topKills,
    topTime,
    myRankKills,
    myRankTime,
    isAdmin,
    reported,
    report,
    reports,
    entryInfo,
    removeEntry,
    removeEverywhere,
    purgeAbove,
    setMarked,
    dismiss,
    markedAccounts,
    // Hàm tương thích ngược
    top: topTime,
    topDmg: topKills,
    myRank: myRankTime
  };
})();
