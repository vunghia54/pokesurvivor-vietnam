import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const ROOT = path.resolve('.');
const CACHE_DIR = path.join(ROOT, 'tools', 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-contact-test-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--window-size=1280,720',
  'about:blank'
], { stdio: 'ignore' });

let ws, seq = 0;
const waiting = new Map();
const consoleErrors = [];

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => waiting.set(id, { res, rej, method }));
}

async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(expr.slice(0, 100) + ': ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch (e) {}
  }
  if (!target) throw new Error('Chrome remote debugging did not respond');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      consoleErrors.push(d.params.args.map(a => a.value ?? a.description ?? JSON.stringify(a)).join(' '));
    } else if (d.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text);
    }
    if (d.id && waiting.has(d.id)) {
      const w = waiting.get(d.id);
      waiting.delete(d.id);
      if (d.error) w.rej(new Error(`${w.method}: ${d.error.message}`));
      else w.res(d.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('=== TEST 1: KIỂM TRA NÚT FACEBOOK TRÊN TOPBAR (INDEX.HTML) ===');
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' });
  await sleep(2500);

  // Đăng nhập khách để hiển thị topbar
  await ev('document.getElementById("btn-guest")?.click()');
  await sleep(1000);
  // Bỏ qua trắc nghiệm để vào menu
  await ev('if (typeof G !== "undefined" && G.UI) G.UI.show("scr-menu"); if (typeof G !== "undefined" && G.UI) G.UI.chrome(true);');
  await sleep(1000);

  const fbBtnHTML = await ev('document.getElementById("btn-yt")?.innerHTML');
  const fbBtnTitle = await ev('document.getElementById("btn-yt")?.title');
  console.log('Social button HTML:', fbBtnHTML);
  console.log('Social button title:', fbBtnTitle);

  const isFB = fbBtnHTML?.includes('Facebook');
  console.log(`[${isFB ? 'PASS' : 'FAIL'}] Nút mạng xã hội đã chuyển thành Facebook: ${isFB}`);

  // Chụp ảnh menu với nút Facebook
  const scr1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(CACHE_DIR, 'verify-fb-button.png'), Buffer.from(scr1.data, 'base64'));

  console.log('\n=== TEST 2: KIỂM TRA GIAO DIỆN ỦNG HỘ & ẢNH QR ===');
  // Mở modal Ủng hộ
  await ev('if (typeof G !== "undefined" && G.SupportUI) G.SupportUI.open(); else document.getElementById("btn-support")?.click();');
  await sleep(1200);

  const supModalVisible = await ev('!document.getElementById("scr-support").classList.contains("hidden")');
  const supTitle = await ev('document.querySelector("#scr-support h2")?.innerText');
  const qrImgSrc = await ev('document.querySelector("#scr-support img")?.src');
  const qrImgNatural = await ev('document.querySelector("#scr-support img")?.naturalWidth');
  const fbLinkSupport = await ev('document.querySelector("#scr-support a[href*=\'facebook\']")?.href');

  console.log(`Support modal visible: ${supModalVisible}`);
  console.log(`Support title: "${supTitle}"`);
  console.log(`QR image source: ${qrImgSrc}`);
  console.log(`QR natural width: ${qrImgNatural}px`);
  console.log(`Support Facebook link: ${fbLinkSupport}`);

  const qrOk = qrImgNatural > 0 && fbLinkSupport?.includes('facebook.com/vunghiaaa');
  console.log(`[${qrOk ? 'PASS' : 'FAIL'}] Ảnh QR hợp lệ và liên kết Facebook chính xác!`);

  // Chụp ảnh giao diện Ủng hộ trên Desktop
  const scr2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(CACHE_DIR, 'verify-support-desktop.png'), Buffer.from(scr2.data, 'base64'));

  // Kiểm tra responsive trên Mobile (844x390)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' }
  });
  await sleep(500);
  const scr3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(CACHE_DIR, 'verify-support-mobile.png'), Buffer.from(scr3.data, 'base64'));
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  console.log('\n=== TEST 3: KIỂM TRA TRANG LIÊN HỆ (CONTACTO/INDEX.HTML) ===');
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/contacto/' });
  await sleep(2000);

  const contactTitle = await ev('document.title');
  const contactEmail = await ev('document.getElementById("mail-vn")?.innerText');
  const mailtoLink = await ev('document.querySelector("a[href^=\'mailto:vunghia546@gmail.com\']")?.href');
  const fbContactLink = await ev('document.querySelector("a[href*=\'facebook.com/vunghiaaa\']")?.href');

  console.log(`Contact page title: "${contactTitle}"`);
  console.log(`Contact email displayed: "${contactEmail}"`);
  console.log(`Mailto href: "${mailtoLink}"`);
  console.log(`Contact Facebook href: "${fbContactLink}"`);

  const contactOk = contactEmail === 'vunghia546@gmail.com' && mailtoLink?.includes('vunghia546@gmail.com') && fbContactLink === 'https://www.facebook.com/vunghiaaa';
  console.log(`[${contactOk ? 'PASS' : 'FAIL'}] Trang liên hệ hiển thị chuẩn thông tin Vũ Trung Nghĩa!`);

  const scr4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(CACHE_DIR, 'verify-contact-page.png'), Buffer.from(scr4.data, 'base64'));

  console.log('\n=== TEST 4: TỔNG KẾT LỖI JAVASCRIPT CONSOLE ===');
  console.log(`Total console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach((err, i) => console.log(`  [${i + 1}] ${err}`));
  } else {
    console.log('[PASS] Tuyệt đối không có bất kỳ lỗi JavaScript nào!');
  }

} catch (err) {
  console.error('Test error:', err);
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}
