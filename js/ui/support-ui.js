/* ============ support-ui.js — "Apoyar el proyecto" / "Ủng hộ" ============
 * Cửa sổ ủng hộ dự án và bản Việt hóa.
 * Tuân thủ giấy phép PolyForm Noncommercial: trên bản web công khai,
 * tính năng quét QR được ẩn mặc định để bảo vệ an toàn bản quyền.
 */
G.SupportUI = (() => {
  const $ = G.UI.$;
  const F = G.Funding;
  const val = v => typeof v === 'number'
    ? (Math.round(v * 100) / 100).toLocaleString(G.I18n.locale, { style: 'currency', currency: 'EUR' }) + ' / mes'
    : v;

  function isVN() {
    return (window.PS_LOCALES && window.PS_LOCALES.lang === 'vi-VN') || (G.I18n && G.I18n.lang === 'vi-VN');
  }

  function canShowQR() {
    try {
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
      return localStorage.getItem('ps.dev_qr') === '1';
    } catch (e) { return false; }
  }

  function init() {
    const b = $('btn-support');
    if (!b) return;
    if (!F.url && !isVN()) return;
    b.classList.remove('hidden');
    b.innerHTML = G.Icons.html('heart', 18) + ` <span>${isVN() ? 'Ủng hộ' : 'Apoyar'}</span>`;
    b.title = isVN() ? 'Ủng hộ' : 'Apoyar el proyecto';
    b.onclick = open;
    const cl = $('sup-close');
    if (cl) cl.onclick = close;
  }

  function open() {
    const h2 = $('scr-support')?.querySelector('h2');
    if (isVN()) {
      if (h2) h2.textContent = 'Ủng hộ';
      const showQr = canShowQR();
      $('sup-body').innerHTML = `
        <p>PokéSurvivor là dự án game của người hâm mộ, <b>hoàn toàn miễn phí</b>, không quảng cáo và không nạp thẻ.</p>
        <p class="sub">Dự án <b>PokéSurvivor Việt Nam</b> phi thương mại phát triển bởi <b>Vũ Trung Nghĩa</b>. Mọi đóng góp đều nhằm xây dựng và phát triển cộng đồng người chơi.</p>
        ${showQr ? `
        <div style="text-align:center;margin:14px 0">
          <a href="assets/ui/qr-ung-ho.png" target="_blank" rel="noopener noreferrer" title="Nhấn để xem ảnh kích thước lớn">
            <img src="assets/ui/qr-ung-ho.png" alt="Mã QR ủng hộ bản Việt hóa" style="max-width:240px;width:100%;height:auto;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,0.4);object-fit:contain;cursor:pointer">
          </a>
          <p class="sub" style="margin-top:6px;font-size:12px">Nhấn vào ảnh để xem kích thước lớn</p>
        </div>` : `
        <div style="background:rgba(255,210,63,.08);border:1px dashed rgba(255,210,63,.3);border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;line-height:1.5">
          <b>Ủng hộ cộng đồng:</b> Để tuân thủ chính sách phi thương mại của Nintendo và Pokémon, trang công khai không kích hoạt nhận tiền quyên góp.
          Cách ủng hộ tốt nhất là tham gia kết nối cộng đồng, chia sẻ game và gửi ý kiến đóng góp tính năng!
        </div>`}
        <div class="row wrap" style="gap:8px;justify-content:center;margin-top:10px">
          <a class="btn" href="https://www.facebook.com/vunghiaaa" target="_blank" rel="noopener noreferrer" style="background:#1877f2;color:#fff">Facebook Vũ Trung Nghĩa</a>
          <a class="btn" style="background:#ffd23f;color:#0a1430;font-weight:700;text-shadow:none" href="https://github.com/vunghia54/pokesurvivor-vietnam/issues/new?template=feature_request.yml" target="_blank" rel="noopener noreferrer">Góp ý tính năng</a>
          <a class="btn ghost" href="https://github.com/vunghia54/pokesurvivor-vietnam" target="_blank" rel="noopener noreferrer">Mã nguồn GitHub</a>
        </div>
        <p class="sub center" style="margin-top:10px;font-size:11px;color:var(--muted)">Lưu ý: Không bán vật phẩm hay trao đổi lợi thế trong game. Bản quyền Pokémon thuộc về Nintendo, GAME FREAK và Creatures Inc.</p>`;
      $('scr-support').classList.remove('hidden');
      return;
    }

    if (h2) h2.textContent = G.T ? G.T('Apoyar el proyecto') : 'Apoyar el proyecto';
    const rows = F.costs.map(([c, v]) => `<tr><td>${c}</td><td class="num">${val(v)}</td></tr>`).join('');
    $('sup-body').innerHTML = `
      <p>PokéSurvivor es y será <b>gratis</b>, sin anuncios ni compras. Si quieres ayudar a que siga en línea, puedes hacer una
      <b>donación voluntaria</b>: todo el dinero se usa para los <b>servidores y el dominio</b>, nada más.</p>
      <p class="sub">Donar no da ninguna ventaja en el juego.</p>
      <h3>Lo que cuesta mantenerlo</h3>
      <table class="sup-tab">${rows}</table>
      <p class="sub">Cuanta más gente juega, más cuestan los servidores. Lo que sobre se guarda para los gastos de los meses siguientes.</p>
      <div class="row wrap" style="gap:8px;justify-content:center;margin-top:10px">
        <a class="btn gold" href="${F.url}" target="_blank" rel="noopener">${G.Icons.html('heart', 18)} Donar en Ko-fi</a>
        ${window.PS_PAGES ? `<a class="btn" href="${G.I18n.lang === 'en' ? 'en/support/' : 'apoyar/'}" target="_blank">Más información</a>` : ''}
      </div>`;
    $('scr-support').classList.remove('hidden');
  }

  function close() {
    const s = $('scr-support');
    if (s) s.classList.add('hidden');
  }

  return { init, open, close };
})();
