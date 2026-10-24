/* ============ ranking-ui.js — Giao diện Bảng Xếp Hạng Diệt Quái & Sinh Tồn ============
 * PokéSurvivor Việt Nam v1.2:
 *   - Hai bảng xếp hạng chính hiển thị song song: DIỆT QUÁI & SINH TỒN
 *   - Bộ lọc: Chế độ (Solo Thường / Solo 8 Chiêu / Nhóm), Kỳ (Hôm nay / Tuần này / Tháng này / Mọi thời đại)
 *   - Lọc theo Pokémon trong mục Mọi thời đại
 *   - Xem được ở chế độ Khách (Guest Read-Only), nhắc đăng nhập Google để lưu điểm
 */
G.RankingUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let mode = 's';       // 's' | 'sm' | 'g' | 'gm'
  let period = 'd';     // 'd' | 'w' | 'm' | 'a'
  let scope = 'all';    // 'all' | 'friends'
  let view = 'both';    // 'both' | 'kills' | 'time'
  let dex = null;
  let token = 0;

  function init() {
    const dl = $('rk-dl');
    if (dl) dl.innerHTML = G.DEX.map(p => `<option value="${esc(G.T(p.name))}">`).join('');
    const pokeInp = $('rk-poke');
    if (pokeInp) {
      pokeInp.onchange = () => {
        const v = pokeInp.value.trim().toLowerCase();
        const p = G.DEX.find(x => (x.name.toLowerCase() === v || G.T(x.name).toLowerCase() === v));
        if (!v) { setDex(null); return; }
        if (!p) { G.UI.toast('Không tìm thấy Pokémon này'); return; }
        setDex(p.dex);
      };
    }
    const clearBtn = $('rk-clear');
    if (clearBtn) clearBtn.onclick = () => { if (pokeInp) pokeInp.value = ''; setDex(null); };
    const modBtn = $('rk-mod');
    if (modBtn) modBtn.onclick = () => G.ModUI.open();
  }

  function setDex(d) {
    dex = d;
    if (d && period !== 'a') period = 'a';
    const clearBtn = $('rk-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !d);
    tabs();
    load();
  }

  function open() {
    G.UI.show('scr-rank', true);
    if (G.Social && !G.Social.started && G.Social.start) G.Social.start();
    const modBtn = $('rk-mod');
    if (modBtn) modBtn.classList.toggle('hidden', !(G.Ranking && G.Ranking.isAdmin && G.Ranking.isAdmin()));
    tabs();
    load();
  }

  function tabs() {
    const mk = (box, items, cur, set, cls) => {
      if (!box) return;
      box.innerHTML = '';
      for (const [k, label] of items) {
        const b = document.createElement('button');
        b.className = cls + (k === cur ? ' on' : '');
        b.innerHTML = label;
        b.onclick = () => { set(k); tabs(); load(); };
        box.appendChild(b);
      }
    };

    // Chế độ chơi: Solo Thường, Solo 8 Chiêu, Nhóm Thường, Nhóm 8 Chiêu
    mk($('rk-mode'), [
      ['s', `<b>${G.Icons.html('user', 16)} Solo Thường</b>`],
      ['sm', `<b>${G.Icons.html('user', 16)} ⚡ Solo 8 Chiêu</b>`],
      ['g', `<b>${G.Icons.html('friends', 16)} Nhóm Thường</b>`],
      ['gm', `<b>${G.Icons.html('friends', 16)} ⚡ Nhóm 8 Chiêu</b>`]
    ], mode, k => { mode = k; }, 'gen-tab');

    // Kỳ thời gian: Hôm nay, Tuần này, Tháng này, Mọi thời đại
    mk($('rk-period'), [
      ['d', 'Hôm nay'],
      ['w', 'Tuần này'],
      ['m', 'Tháng này'],
      ['a', 'Mọi thời đại']
    ], period, k => {
      period = k;
      if (k !== 'a' && dex) {
        dex = null;
        if ($('rk-poke')) $('rk-poke').value = '';
        if ($('rk-clear')) $('rk-clear').classList.add('hidden');
      }
    }, 'chip');

    // Phạm vi: Tất cả, Bạn bè
    mk($('rk-scope'), [
      ['all', 'Tất cả'],
      ['friends', 'Bạn bè']
    ], scope, k => { scope = k; }, 'chip');

    // Bộ lọc hiển thị cột: Cả hai, Chỉ Diệt Quái, Chỉ Sinh Tồn
    mk($('rk-view'), [
      ['both', 'Cả hai bảng'],
      ['kills', 'Chỉ Diệt Quái'],
      ['time', 'Chỉ Sinh Tồn']
    ], view, k => {
      view = k;
      applyView();
    }, 'chip');

    applyView();
  }

  function applyView() {
    const colK = $('rk-col-kills');
    const colT = $('rk-col-time');
    const split = document.querySelector('.rk-split');
    if (!colK || !colT) return;

    if (view === 'kills') {
      colK.classList.remove('hidden');
      colT.classList.add('hidden');
      if (split) split.style.gridTemplateColumns = '1fr';
    } else if (view === 'time') {
      colK.classList.add('hidden');
      colT.classList.remove('hidden');
      if (split) split.style.gridTemplateColumns = '1fr';
    } else {
      colK.classList.remove('hidden');
      colT.classList.remove('hidden');
      if (split) split.style.gridTemplateColumns = '';
    }
  }

  const fmt = t => (t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t));
  const num = n => (n || 0).toLocaleString(G.I18n.locale);

  async function load() {
    const my = ++token;
    const klist = $('rk-klist');
    const tlist = $('rk-tlist');
    const kme = $('rk-kme');
    const tme = $('rk-tme');

    if (klist) klist.innerHTML = '<p class="sub">Đang tải bảng Diệt Quái…</p>';
    if (tlist) tlist.innerHTML = '<p class="sub">Đang tải bảng Sinh Tồn…</p>';
    if (kme) kme.innerHTML = '';
    if (tme) tme.innerHTML = '';

    let kRows = [], tRows = [];
    let meK = null, meT = null;

    try {
      [kRows, tRows, meK, meT] = await Promise.all([
        G.Ranking.topKills(mode, period, dex, scope === 'friends'),
        G.Ranking.topTime(mode, period, dex, scope === 'friends'),
        G.Social && G.Social.me ? G.Ranking.myRankKills(mode, period, dex) : Promise.resolve(null),
        G.Social && G.Social.me ? G.Ranking.myRankTime(mode, period, dex) : Promise.resolve(null)
      ]);
    } catch (e) {
      if (my !== token) return;
      const errMsg = '<p class="sub">Không thể tải bảng xếp hạng (' + esc(e.code || e.message) + ').</p>';
      if (klist) klist.innerHTML = errMsg;
      if (tlist) tlist.innerHTML = errMsg;
      return;
    }

    if (my !== token) return;
    if (klist) klist.innerHTML = '';
    if (tlist) tlist.innerHTML = '';

    const uid = G.Social ? G.Social.uid : null;
    const b = G.Ranking.board(mode, period, dex);
    const done = G.Ranking.reported ? G.Ranking.reported() : new Set();

    // 1. Render Bảng Diệt Quái
    if (!kRows.length) {
      if (klist) klist.innerHTML = '<p class="sub">Chưa có thành tích diệt quái. Hãy là người đầu tiên ghi danh!</p>';
    } else {
      kRows.forEach((r, i) => {
        if (klist) klist.appendChild(rowEl(r, i + 1, uid && r.uids.includes(uid), b, done, 'kills'));
      });
    }

    // 2. Render Bảng Sinh Tồn
    if (!tRows.length) {
      if (tlist) tlist.innerHTML = '<p class="sub">Chưa có thành tích sinh tồn. Hãy là người đầu tiên ghi danh!</p>';
    } else {
      tRows.forEach((r, i) => {
        if (tlist) tlist.appendChild(rowEl(r, i + 1, uid && r.uids.includes(uid), b, done, 'time'));
      });
    }

    // 3. Render Footer Hạng Cá Nhân
    renderMe(kme, meK, 'kills');
    renderMe(tme, meT, 'time');
  }

  function renderMe(el, me, type) {
    if (!el) return;
    if (!G.Social || !G.Social.me) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
        '<span style="color:var(--muted)">Chế độ khách (chưa liên kết tài khoản).</span>' +
        '<button class="btn small gold" style="white-space:nowrap" onclick="G.LoginUI.open()">Đăng nhập Google</button>' +
        '</div>';
      return;
    }

    if (!me) {
      el.innerHTML = '<span style="color:var(--muted)">Chưa có dữ liệu xếp hạng trong kỳ này.</span>';
      return;
    }

    if (me.out) {
      if ((type === 'kills' && me.kills > 0) || (type === 'time' && me.t > 0)) {
        if (type === 'kills') {
          el.innerHTML = `Kỷ lục cá nhân: <b style="color:var(--gold)">${num(me.kills)} quái</b> <small style="color:var(--muted)">(Sống sót ${fmt(me.t)} · Ngoài Top 50)</small>`;
        } else {
          el.innerHTML = `Kỷ lục cá nhân: <b style="color:var(--gold)">${fmt(me.t)}</b> <small style="color:var(--muted)">(${num(me.kills)} quái · Ngoài Top 50)</small>`;
        }
      } else {
        el.innerHTML = '<span style="color:var(--muted)">Bạn chưa lọt vào Top 50 trong kỳ này. Hãy nỗ lực phá vỡ kỷ lục!</span>';
      }
      return;
    }

    const pos = '#' + me.pos;
    if (type === 'kills') {
      el.innerHTML = `Thành tích của bạn: <b class="gold">${pos}</b> · <b style="color:var(--gold)">${num(me.kills)} quái</b> <small style="color:var(--muted)">(Sống sót ${fmt(me.t)})</small>`;
    } else {
      el.innerHTML = `Thành tích của bạn: <b class="gold">${pos}</b> · <b style="color:var(--gold)">${fmt(me.t)}</b> <small style="color:var(--muted)">(${num(me.kills)} quái)</small>`;
    }
  }

  function rowEl(r, pos, mine, b, done, type) {
    const el = document.createElement('div');
    el.className = 'rk-row' + (mine ? ' mine' : '') + (pos <= 3 ? ' top' + pos : '');
    el.insertAdjacentHTML('beforeend', `<span class="pos">${pos <= 3 ? G.Icons.html('trophy', 20) : ''}${pos}</span>`);

    const mons = document.createElement('span');
    mons.className = 'mons';
    if (r.dex && r.dex.length) {
      r.dex.forEach((d, i) => {
        if (G.DEX_BY && G.DEX_BY[d]) {
          mons.appendChild(G.UI.spriteCanvas(d, 44, 40, { scale: 1, shiny: !!(r.shiny && r.shiny[i]) }));
        }
      });
    }
    el.appendChild(mons);

    const namesHtml = r.names.map((n, i) =>
      `<a href="#" class="plink" data-u="${esc((r.uids && r.uids[i]) || '')}">${esc(n)}</a>`
    ).join(' · ');

    if (type === 'kills') {
      el.insertAdjacentHTML('beforeend',
        `<span class="who"><b translate="no">${namesHtml}</b><small>Thời gian: ${fmt(r.t)} · Cấp ${r.lv || 1}</small></span>
         <span class="time" style="color:var(--gold);font-weight:bold">${num(r.kills)}<small style="font-size:12px;margin-left:3px;font-weight:normal">quái</small></span>`
      );
    } else {
      el.insertAdjacentHTML('beforeend',
        `<span class="who"><b translate="no">${namesHtml}</b><small>${num(r.kills)} quái · Cấp ${r.lv || 1}</small></span>
         <span class="time" style="color:var(--gold);font-weight:bold">${fmt(r.t)}</span>`
      );
    }

    el.querySelectorAll('.plink').forEach(a => {
      a.onclick = e => {
        e.preventDefault();
        if (G.ProfileUI && G.ProfileUI.show) G.ProfileUI.show(a.dataset.u);
      };
    });

    // Nút báo cáo gian lận
    if (!mine && G.Social && G.Social.me) {
      const rep = document.createElement('button');
      const sent = done.has(b + '__' + r.id);
      rep.className = 'rk-rep' + (sent ? ' sent' : '');
      rep.title = sent ? 'Đã báo cáo' : 'Báo cáo điểm nghi vấn';
      rep.innerHTML = G.Icons.html('flag', 16);
      rep.onclick = async () => {
        if (rep.classList.contains('sent')) { G.UI.toast('Bạn đã báo cáo bản ghi này'); return; }
        if (!confirm('Báo cáo điểm số của ' + r.names.join(', ') + ' là gian lận?')) return;
        rep.classList.add('sent');
        rep.title = 'Đã báo cáo';
        await G.Ranking.report(b, r);
        G.UI.toast('Cảm ơn bạn: ban quản trị sẽ kiểm tra');
      };
      el.appendChild(rep);
    } else {
      el.appendChild(document.createElement('span'));
    }

    return el;
  }

  return { init, open, setDex };
})();
