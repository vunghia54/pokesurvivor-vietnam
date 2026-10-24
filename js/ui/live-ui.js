/* ============ live-ui.js — botón de redes / canal ============
 * Botón en la barra de arriba:
 * - En la versión vietnamita (vi-VN): lleva al Facebook del responsable
 *   de la traducción (Vũ Trung Nghĩa).
 * - Kênh cộng đồng và trang Facebook dự án (Vũ Trung Nghĩa)
 *   si está en directo.
 */
G.LiveUI = (() => {
  const $ = G.UI.$;
  const CHANNEL = 'https://www.facebook.com/vunghiaaa';
  const FB_VN = 'https://www.facebook.com/vunghiaaa';
  const SRC = '';
  const EVERY = 5 * 60 * 1000, STALE = 90 * 60 * 1000;
  let live = null, lastT = 0;

  function isVN() {
    return (window.PS_LOCALES && window.PS_LOCALES.lang === 'vi-VN') || (G.I18n && G.I18n.lang === 'vi-VN');
  }

  function init() {
    const b = $('btn-yt');
    if (!b) return;
    b.onclick = () => {
      if (isVN()) {
        window.open(FB_VN, '_blank', 'noopener,noreferrer');
      } else {
        window.open(live ? 'https://www.youtube.com/watch?v=' + live : CHANNEL, '_blank', 'noopener,noreferrer');
      }
    };
    draw();
    if (!isVN()) {
      check();
      setInterval(check, EVERY);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }
  }

  function draw() {
    const b = $('btn-yt');
    if (!b) return;
    if (isVN()) {
      b.classList.remove('live');
      b.title = 'Facebook Vũ Trung Nghĩa';
      b.innerHTML = G.Icons.html('fb', 18) + ' <span>Facebook</span>';
      return;
    }
    b.classList.toggle('live', !!live);
    b.title = live ? '¡Estoy en directo! Pulsa para verlo' : 'Mi canal de YouTube';
    b.innerHTML = live ? '<i class="rec"></i><span>EN DIRECTO</span>' : G.Icons.html('yt', 18) + ' <span>YouTube</span>';
  }

  async function check() {
    if (isVN() || !SRC) return;
    if (document.hidden || Date.now() - lastT < EVERY - 5000) return;
    lastT = Date.now();
    try {
      const r = await fetch(SRC, { cache: 'no-cache' });
      if (!r.ok) return;
      const d = await r.json();
      const id = d.live && /^[\w-]{11}$/.test(d.id || '') && Date.now() - Date.parse(d.at) < STALE ? d.id : null;
      if (id !== live) { live = id; draw(); }
    } catch (e) { /* sin red o sin archivo */ }
  }

  return { init, draw };
})();
