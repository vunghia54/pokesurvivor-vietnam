/* ============ settings-ui.js — pantalla de Ajustes (PC y móvil) ============
 * Se abre por encima de lo que haya (menú o pausa) y al cerrar vuelve ahí.
 * Pestañas: Sonido · Gráficos · Controles · Accesibilidad · Cuenta · Acerca de.
 * Los ajustes son de este dispositivo (G.Settings / G.Audio en el navegador).
 */
G.SettingsUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERSION = '1.2 · 2026-10-09';
  const REPO = 'https://github.com/vunghia54/pokesurvivor-vietnam';
  const REPO_VN = 'https://github.com/vunghia54/pokesurvivor-vietnam';
  const BUG_VN = 'https://github.com/vunghia54/pokesurvivor-vietnam/issues/new?template=bug_report.yml';
  const FEAT_VN = 'https://github.com/vunghia54/pokesurvivor-vietnam/issues/new?template=feature_request.yml';
  let tab = 'sound';

  function init() {
    document.querySelectorAll('#set-tabs .gen-tab').forEach(b => { b.onclick = () => { tab = b.dataset.t; render(); }; });
    // En el móvil no hay apuntado a mano (siempre apunta solo): fuera la pestaña, que sólo tenía eso.
    if (G.Settings.touch) document.querySelector('#set-tabs [data-t="a11y"]').classList.add('hidden');
    // Al conectar o quitar un mando con Controles abierto, se ve al momento.
    for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { if (isOpen() && tab === 'ctl') render(); });
    $('set-close').onclick = close;
    $('btn-settings').innerHTML = G.Icons.html('gear', 20);
    $('btn-settings').onclick = () => open();
    $('btn-pause-settings').onclick = () => open('sound');
    // Pantalla completa (si el navegador la permite; en iPhone, cómo conseguirla).
    if (canFull() || iosTip()) {
      $('btn-full').classList.remove('hidden');
      updateFullBtn();
      $('btn-full').onclick = toggleFull;
      for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
        document.addEventListener(ev, () => {
          updateFullBtn();
          if (isOpen()) render();
        });
      }
    }
  }

  function open(t) {
    if (t) tab = t;
    $('scr-settings').classList.remove('hidden');
    if (G.UI && G.UI.chrome) {
      G.UI.chrome(false);
      if (document.body) document.body.classList.add('in-subscreen');
    }
    render();
  }
  function close() {
    $('scr-settings').classList.add('hidden');
    if (G.UI && G.UI.chrome && G.UI.isOpen && G.UI.isOpen('scr-menu') && !(G.UI.hasActiveSubscreen && G.UI.hasActiveSubscreen())) {
      G.UI.chrome(true);
      if (document.body) document.body.classList.remove('in-subscreen');
    }
  }
  const isOpen = () => !$('scr-settings').classList.contains('hidden');

  // ---------------- pantalla completa ----------------
  function canFull() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  // iPhone: Safari no deja poner una web a pantalla completa (por eso a veces
  // no salía la opción). Sí se puede abriéndola desde la pantalla de inicio.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => !!navigator.standalone || (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
  function iosTip() { return IOS && !canFull() && !standalone(); }
  const IOS_TIP = 'En iPhone, Safari no deja poner las webs a pantalla completa. Pulsa Compartir y luego "Añadir a pantalla de inicio": abriendo el juego desde ese icono se juega a pantalla completa.';

  function updateFullBtn() {
    const btn = $('btn-full');
    if (!btn) return;
    const full = isFull();
    btn.innerHTML = G.Icons.html('full', 20);
    btn.classList.toggle('active', full);
    const vn = isVN();
    const isEn = G.I18n && G.I18n.lang === 'en';
    const title = full
      ? (vn ? 'Thoát toàn màn hình' : (isEn ? 'Exit Fullscreen' : 'Salir de pantalla completa'))
      : (vn ? 'Toàn màn hình' : (isEn ? 'Fullscreen' : 'Pantalla completa'));
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }

  let fullPending = false;
  function toggleFull() {
    if (fullPending) return;
    if (!canFull()) { if (iosTip()) G.UI.toast(IOS_TIP, 9000); return; }
    fullPending = true;
    try {
      if (isFull()) {
        const exit = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        if (exit && exit.then) {
          exit.catch(() => {}).finally(() => { fullPending = false; updateFullBtn(); });
        } else {
          fullPending = false;
          updateFullBtn();
        }
      } else {
        const el = document.documentElement;
        const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (p && p.then) {
          p.then(() => {
            try {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
              }
            } catch (e) { /* nada */ }
          }).catch(() => {
            // Fullscreen bị từ chối hoặc không có quyền trong môi trường hiện tại
          }).finally(() => {
            fullPending = false;
            updateFullBtn();
          });
        } else {
          fullPending = false;
          updateFullBtn();
        }
      }
    } catch (e) {
      fullPending = false;
      updateFullBtn();
    }
    setTimeout(() => { updateFullBtn(); if (isOpen()) render(); }, 300);
  }

  // ---------------- piezas ----------------
  function section(title, sub) { return `<h3 class="set-h">${esc(title)}</h3>${sub ? `<p class="sub">${sub}</p>` : ''}`; }
  function toggle(key, label, desc) {
    const on = !!G.Settings.get(key);
    const isVi = G.I18n && G.I18n.lang === 'vi-VN';
    const isEn = G.I18n && G.I18n.lang === 'en';
    const onText = isVi ? 'Bật' : (isEn ? 'On' : 'Sí');
    const offText = isVi ? 'Tắt' : (isEn ? 'Off' : 'No');
    return `<div class="set-row"><div class="grow"><b>${esc(label)}</b><small>${esc(desc)}</small></div>
      <button class="btn small switch ${on ? 'gold' : ''}" data-k="${key}">${on ? onText : offText}</button></div>`;
  }
  function choice(key, opts) {
    const cur = G.Settings.get(key);
    return `<div class="chips set-chips">${opts.map(([v, l]) => `<button class="chip ${v === cur ? 'on' : ''}" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  }

  function render() {
    document.querySelectorAll('#set-tabs .gen-tab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const box = $('set-body');
    box.scrollTop = 0;
    if (tab === 'sound') {
      box.innerHTML = section('Sonido') + '<div id="set-sound" class="sound-inline"></div>';
      G.UI.soundControls($('set-sound'));
    } else if (tab === 'gfx') {
      const auto = ['baja', 'media', 'alta'][G.Settings.autoLevel];
      box.innerHTML = section('Idioma', 'El juego se recarga al cambiarlo.')
        + `<div class="chips set-chips" translate="no">${G.I18n.choices.map(([v, l]) =>
             `<button class="chip ${G.I18n.lang === v ? 'on' : ''}" data-lang="${v}">${l}</button>`).join('')}</div>`
        + section('Calidad', 'Cuántos efectos y partículas se dibujan. <b>Auto</b> la baja sola si el juego va a tirones (ahora: ' + auto + ').')
        + choice('quality', [['auto', 'Auto'], ['high', 'Alta'], ['mid', 'Media'], ['low', 'Baja']])
        + section('Pantalla')
        + toggle('dmgNumbers', 'Números de daño', 'Los números que salen al golpear y al recibir daño.')
        + toggle('calm', 'Menos sacudidas y destellos', 'La cámara tiembla menos y los fogonazos son suaves.')
        + toggle('fps', 'Mostrar FPS', 'Fotogramas por segundo, en la esquina de abajo.')
        + (canFull() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>Sin barras del navegador.</small></div>
             <button class="btn small" id="set-full">${isFull() ? 'Salir' : 'Activar'}</button></div>`
           : iosTip() ? `<div class="set-row"><div class="grow"><b>Pantalla completa</b><small>${esc(IOS_TIP)}</small></div></div>` : '');
    } else if (tab === 'ctl') {
      const isVi = G.I18n && G.I18n.lang === 'vi-VN';
      const isEn = G.I18n && G.I18n.lang === 'en';
      const curMode = G.Settings.get('autoSkillMode') || (G.Settings.get('autoSkill') === false ? 'off' : 'simultaneous');
      const modeDesc = {
        off: isVi ? 'Thủ công: dùng phím 1–8, Q/E hoặc bấm HUD để chọn và tung từng kỹ năng.'
                  : (isEn ? 'Manual: use keys 1–8, Q/E or tap HUD to select and cast moves.'
                          : 'Manual: usa las teclas 1–8, Q/E o pulsa el HUD para elegir y lanzar movimientos.'),
        cycle: isVi ? 'Luân phiên: tự động luân chuyển và thi triển từng chiêu thức khi hồi chiêu xong.'
                    : (isEn ? 'Cycle: automatically switches to and casts ready moves one by one.'
                            : 'Alternar: cambia y lanza automáticamente un movimiento listo.'),
        simultaneous: isVi ? 'Đồng thời: tự động thi triển tất cả 8 kỹ năng đã trang bị độc lập cùng lúc (kiểu Vampire Survivors).'
                           : (isEn ? 'Simultaneous: automatically casts all 8 equipped moves independently (Vampire Survivors style).'
                                   : 'Simultáneo: lanza automáticamente los 8 movimientos equipados a la vez (estilo Vampire Survivors).')
      }[curMode] || '';

      const autoSkillSection = section(isVi ? 'Kỹ năng chiến đấu' : (isEn ? 'Combat' : 'Combate'),
                                       isVi ? 'Tùy chỉnh cách tung kỹ năng trong trận chiến.' : (isEn ? 'Configure how moves are cast in battle.' : 'Configura cómo se lanzan los movimientos en combate.'))
        + `<div class="set-row"><div class="grow"><b>${isVi ? 'Chế độ tự động kỹ năng' : (isEn ? 'Auto Skill Mode' : 'Modo automático')}</b><small>${esc(modeDesc)}</small></div></div>`
        + choice('autoSkillMode', [
            ['off', isVi ? 'Tắt' : (isEn ? 'Off' : 'Desactivado')],
            ['cycle', isVi ? 'Luân phiên' : (isEn ? 'Cycle' : 'Alternar')],
            ['simultaneous', isVi ? 'Đồng thời' : (isEn ? 'Simultaneous' : 'Simultáneo')]
          ]);

      const pn = G.Pad.name;
      box.innerHTML = autoSkillSection
        + section('Con mando', pn
          ? 'Mando conectado: <b translate="no">' + esc(pn.replace(/\s*\(.*$/, '')) + '</b>'
          : 'Xbox, PlayStation, Switch y la mayoría de mandos USB o Bluetooth. Conéctalo y pulsa cualquier botón.')
        + toggle('gamepad', 'Usar mando', 'Moverte, cambiar de ataque y manejar los menús con el mando.')
        + toggle('padRumble', 'Vibración', 'El mando vibra al recibir daño (si el mando y el navegador lo permiten).')
        + `<div class="keys">
             <div><span class="padkey">Stick izq.</span> o <span class="padkey">Cruceta</span></div><span>moverse · elegir en los menús</span>
             <div><span class="padkey">LB</span> / <span class="padkey">RB</span></div><span>ataque anterior / siguiente</span>
             <div><span class="padkey">Start</span></div><span>pausa</span>
             <div><span class="padkey">A</span></div><span>pulsar (en los menús) · saltar la animación de Arceus</span>
             <div><span class="padkey">B</span></div><span>atrás / cerrar</span>
             <div><span class="padkey">Y</span></div><span>cambiar las cartas al subir de nivel</span>
             <div><span class="padkey">Stick der.</span></div><span>desplazar las listas · apuntar (si activas Apuntar a mano en Accesibilidad)</span>
           </div>`
        + section('En móvil o tablet')
        + `<p class="sub">Pon el dedo en cualquier parte y arrastra para moverte: el joystick aparece donde tocas. Toca un ataque de abajo para cambiarlo y el botón de arriba a la derecha para pausar. Se juega en horizontal.</p>`
        + `<div class="set-row"><div class="grow"><b>Tamaño del joystick</b><small>Cuánto hay que arrastrar el dedo.</small></div></div>`
        + choice('stick', [[0.8, 'Pequeño'], [1, 'Normal'], [1.25, 'Grande']])
        + `<div class="set-row"><div class="grow"><b>Colocar los botones</b><small>Pon los ataques, la pausa y el joystick (fijo, si quieres) donde quieras de la pantalla.</small></div>
             <button class="btn small" id="set-layout">Colocar</button></div>`
        + section('En PC')
        + `<div class="keys">
             <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas</div><span>moverse</span>
             <div><kbd>1</kbd>–<kbd>4</kbd> o clic en el icono</div><span>elegir ataque</span>
             <div><kbd>Q</kbd> / <kbd>E</kbd></div><span>ataque anterior / siguiente</span>
             <div><kbd>Esc</kbd> o <kbd>P</kbd></div><span>pausa</span>
             <div><kbd>1</kbd>–<kbd>3</kbd></div><span>elegir carta al subir de nivel</span>
           </div>`;
    } else if (tab === 'a11y') {
      const isVi = G.I18n && G.I18n.lang === 'vi-VN';
      const isEn = G.I18n && G.I18n.lang === 'en';
      const curMode = G.Settings.get('autoSkillMode') || (G.Settings.get('autoSkill') === false ? 'off' : 'simultaneous');
      const modeDesc = {
        off: isVi ? 'Thủ công: dùng phím 1–8, Q/E hoặc bấm HUD để chọn và tung từng kỹ năng.'
                  : (isEn ? 'Manual: use keys 1–8, Q/E or tap HUD to select and cast moves.'
                          : 'Manual: usa las teclas 1–8, Q/E o pulsa el HUD para elegir y lanzar movimientos.'),
        cycle: isVi ? 'Luân phiên: tự động luân chuyển và thi triển từng chiêu thức khi hồi chiêu xong.'
                    : (isEn ? 'Cycle: automatically switches to and casts ready moves one by one.'
                            : 'Alternar: cambia y lanza automáticamente un movimiento listo.'),
        simultaneous: isVi ? 'Đồng thời: tự động thi triển tất cả 8 kỹ năng đã trang bị độc lập cùng lúc (kiểu Vampire Survivors).'
                           : (isEn ? 'Simultaneous: automatically casts all 8 equipped moves independently (Vampire Survivors style).'
                                   : 'Simultáneo: lanza automáticamente los 8 movimientos equipados a la vez (estilo Vampire Survivors).')
      }[curMode] || '';

      const autoSkillSection = section(isVi ? 'Kỹ năng chiến đấu' : (isEn ? 'Combat' : 'Combate'),
                                       isVi ? 'Tùy chỉnh cách tung kỹ năng trong trận chiến.' : (isEn ? 'Configure how moves are cast in battle.' : 'Configura cómo se lanzan los movimientos en combate.'))
        + `<div class="set-row"><div class="grow"><b>${isVi ? 'Chế độ tự động kỹ năng' : (isEn ? 'Auto Skill Mode' : 'Modo automático')}</b><small>${esc(modeDesc)}</small></div></div>`
        + choice('autoSkillMode', [
            ['off', isVi ? 'Tắt' : (isEn ? 'Off' : 'Desactivado')],
            ['cycle', isVi ? 'Luân phiên' : (isEn ? 'Cycle' : 'Alternar')],
            ['simultaneous', isVi ? 'Đồng thời' : (isEn ? 'Simultaneous' : 'Simultáneo')]
          ]);

      box.innerHTML = autoSkillSection
        + section('Apuntado')
        + toggle('aimManual', 'Apuntar a mano', 'Tus ataques van hacia el ratón (o hacia donde empujes el stick derecho del mando) en vez de al enemigo más cercano. Si sueltas el stick y no mueves el ratón, vuelve a apuntar solo. La cadena y los meteoros siguen buscando a los enemigos solos.');
    } else if (tab === 'acc') {
      renderAccount(box);
    } else {
      box.innerHTML = `<div class="about-logo">PokéSurvivor</div><p class="sub center">Versión ${esc(VERSION)}</p>`
        + `<p class="sub">Juego de fans <b>gratuito y sin ánimo de lucro</b>: sin anuncios ni compras. Pokémon y sus personajes son propiedad de Nintendo, Creatures y GAME FREAK; este proyecto no está afiliado a ellos.</p>`
        + section('Créditos')
        + `<ul class="credits">
             <li><b>Sprites:</b> PMD SpriteCollab y sus artistas (CC BY-NC 4.0).</li>
             <li><b>Datos de los Pokémon:</b> PokéAPI.</li>
             <li><b>Música y sonidos:</b> originales, generados por el propio juego.</li>
             <li><b>Fuente:</b> Pixelify Sans (OFL).</li>
           </ul>`
        + `<div class="row wrap" style="justify-content:center;gap:8px">
             ${G.I18n && G.I18n.lang === 'vi-VN' ? `
             <a class="btn small" style="background:#e0533d;color:#fff" href="${BUG_VN}" target="_blank" rel="noopener noreferrer">Báo lỗi game</a>
             <a class="btn small" style="background:#ffd23f;color:#0a1430;font-weight:700;text-shadow:none" href="${FEAT_VN}" target="_blank" rel="noopener noreferrer">Góp ý tính năng</a>
             <a class="btn small" href="contacto/" target="_blank" rel="noopener">Liên hệ</a>
             <a class="btn small" href="https://www.facebook.com/vunghiaaa" target="_blank" rel="noopener noreferrer" style="background:#1877f2;color:#fff">Facebook</a>
             <a class="btn small" href="${REPO_VN}" target="_blank" rel="noopener noreferrer">Mã nguồn GitHub</a>
             <button class="btn small" data-legal>Aviso legal y privacidad</button>
             ` : `
             ${window.PS_PAGES ? `<a class="btn small" href="${G.I18n.lang === 'en' ? 'en/guide/' : 'guia/'}" target="_blank">Guía y preguntas</a>
             <a class="btn small" href="${G.I18n.lang === 'en' ? 'en/pokedex/' : 'pokedex/'}" target="_blank">Pokédex</a>` : ''}
             <button class="btn small" data-legal>Aviso legal y privacidad</button>
             <a class="btn small" href="contacto/" target="_blank" rel="noopener">Contacto</a>
             <a class="btn small" href="${REPO}" target="_blank" rel="noopener">Código (GitHub)</a>
             `}
           </div>`;
    }
    wire(box);
  }

  function isVN() {
    return (window.PS_LOCALES && window.PS_LOCALES.lang === 'vi-VN') || (window.G && window.G.I18n && window.G.I18n.lang === 'vi-VN');
  }

  function renderAccount(box) {
    const vn = isVN();
    const st = G.DB.guest ? 'guest' : G.DB.syncState;
    const SYNC = vn
      ? { ok: 'Đã lưu trên đám mây', syncing: 'Đang lưu…', pending: 'Chờ tải lên (sẽ tải khi đóng game)',
          offline: 'Mất kết nối: sẽ tải lên khi có mạng', local: 'Chỉ lưu trong trình duyệt này', guest: 'Khách: không lưu' }
      : { ok: 'Guardado en la nube', syncing: 'Guardando…', pending: 'Pendiente de subir (se sube al salir del juego)',
          offline: 'Sin conexión: se subirá al volver', local: 'Guardado sólo en este navegador', guest: 'Invitado: no se guarda' };
    if (G.DB.guest) {
      box.innerHTML = section(vn ? 'Tài khoản' : 'Cuenta', vn ? 'Bạn đang chơi với tư cách <b>Khách</b>: tiến trình không lưu khi thoát.' : 'Estás jugando como <b>invitado</b>: tu progreso no se guarda al salir.')
        + `<button class="btn gold" id="set-login">${vn ? 'Tạo tài khoản hoặc đăng nhập' : 'Crear cuenta o entrar'}</button>`;
      return;
    }
    const nick = G.Social.me ? G.Social.me.name : (G.DB.user || '');
    const kind = vn
      ? (G.DB.mode === 'local' ? 'Tài khoản trình duyệt này' : G.DB.nameAccount ? 'Tên đăng nhập & mật khẩu' : 'Google')
      : (G.DB.mode === 'local' ? 'Cuenta de este navegador' : G.DB.nameAccount ? 'Nombre y contraseña' : 'Google');
    box.innerHTML = section(vn ? 'Tài khoản' : 'Cuenta')
      + `<div class="set-row"><div class="grow"><b>${vn ? 'Biệt danh' : 'Apodo'}</b><small>${vn ? 'Tên duy nhất hiển thị cho bạn bè.' : 'Es único y no se puede cambiar.'}</small></div><span class="gold" translate="no">${esc(nick)}</span></div>`
      + `<div class="set-row"><div class="grow"><b>${vn ? 'Loại tài khoản' : 'Tipo de cuenta'}</b></div><span>${esc(kind)}</span></div>`
      + `<div class="set-row"><div class="grow"><b>${vn ? 'Trạng thái dữ liệu' : 'Partida'}</b></div><span>${esc(SYNC[st] || st)}</span></div>`
      + `<div class="row wrap" style="gap:8px;margin-top:12px">
           <button class="btn" id="set-logout">${vn ? 'Đăng xuất' : 'Cerrar sesión'}</button>
           <button class="btn danger" id="set-delete">${vn ? 'Xóa tài khoản' : 'Borrar cuenta'}</button>
         </div><p class="note" id="set-msg"></p>`;
  }

  function wire(box) {
    box.querySelectorAll('.switch[data-k]').forEach(b => { b.onclick = () => { G.Settings.set(b.dataset.k, !G.Settings.get(b.dataset.k)); render(); }; });
    box.querySelectorAll('.chip[data-k]').forEach(b => {
      b.onclick = () => { const v = b.dataset.v; G.Settings.set(b.dataset.k, isNaN(+v) ? v : +v); render(); };
    });
    const full = $('set-full'); if (full) full.onclick = toggleFull;
    const lay = $('set-layout'); if (lay) lay.onclick = () => G.LayoutUI.open();
    box.querySelectorAll('[data-lang]').forEach(b => { b.onclick = () => { if (b.dataset.lang !== G.I18n.lang) G.I18n.set(b.dataset.lang); }; });
    const lo = $('set-login'); if (lo) lo.onclick = () => { close(); leave(); };
    const out = $('set-logout'); if (out) out.onclick = () => { close(); leave(); };
    const del = $('set-delete');
    if (del) del.onclick = async () => {
      const ok = await G.UI.confirmDelete();
      if (!ok) return;
      del.disabled = true;
      const r = await G.DB.deleteAccount(ok.pass);
      if (!r.ok) { $('set-msg').textContent = r.error; del.disabled = false; return; }
      close();
      G.UI.toast('Cuenta borrada');
      G.Audio.music(null);
      G.Flow.toLogin();
    };
  }

  /** Cerrar sesión (si estás en una partida, se abandona). */
  function leave() {
    if (G.DB.guest && !confirm('Eres invitado: se perderá todo el progreso. ¿Salir?')) return;
    if (G.Game.state !== 'ui') G.Game.quit && G.Game.quit();
    G.Audio.music(null);
    G.DB.logout().then(() => G.Flow.toLogin());
  }

  return { init, open, close, get isOpen() { return isOpen(); } };
})();
