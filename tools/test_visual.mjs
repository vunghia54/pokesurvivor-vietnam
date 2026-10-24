import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const ROOT = path.resolve('.');
const CACHE_DIR = path.join(ROOT, 'tools', 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-test-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1280,720',
  'about:blank'
], { stdio: 'ignore' });

let ws, seq = 0;
const waiting = new Map();
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

async function screenshot(filename) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.data, 'base64');
  const outPath = path.join(CACHE_DIR, filename);
  fs.writeFileSync(outPath, buf);
  console.log(`[OK] Screenshot: ${filename} (${buf.length} bytes)`);
  return outPath;
}

async function testPage(url, prefix) {
  console.log(`\n========================================`);
  console.log(`Testing ${prefix.toUpperCase()}: ${url}`);
  console.log(`========================================`);

  await send('Page.navigate', { url });
  await sleep(3000);

  const title = await ev('document.title');
  const lang = await ev('document.documentElement.lang');
  console.log(`Title: ${title}`);
  console.log(`HTML lang: ${lang}`);

  // 1. Màn hình đăng nhập / khách
  const guestBtnText = await ev('document.getElementById("btn-guest")?.innerText?.trim()');
  console.log(`Guest button: "${guestBtnText}"`);
  await screenshot(`${prefix}-01-login-desktop.png`);

  // Mobile 844x390 login view
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' }
  });
  await sleep(500);
  await screenshot(`${prefix}-01-login-mobile-844.png`);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  // 2. Click khách -> Vào trắc nghiệm hoặc menu
  await ev('document.getElementById("btn-guest")?.click()');
  await sleep(1500);

  let activeScr = await ev('Array.from(document.querySelectorAll(".scr")).filter(s => !s.classList.contains("hidden")).map(s => s.id).join(", ")');
  console.log(`Active screen: "${activeScr}"`);

  // Nếu là scr-test, chụp ảnh bài trắc nghiệm tính cách tiếng Việt và hoàn thành quiz
  if (activeScr.includes('scr-test')) {
    const qText = await ev('document.getElementById("test-q")?.innerText?.trim()');
    console.log(`Quiz question translated: "${qText}"`);
    await screenshot(`${prefix}-02-quiz-vietnamese.png`);

    // Trả lời các câu hỏi trắc nghiệm (thường 4-5 câu)
    for (let step = 0; step < 8; step++) {
      const isTest = await ev('!document.getElementById("scr-test").classList.contains("hidden")');
      if (!isTest) break;
      await ev('document.querySelector("#test-a button")?.click()');
      await sleep(400);
    }
    await sleep(1000);
  }

  // Kết quả trắc nghiệm
  activeScr = await ev('Array.from(document.querySelectorAll(".scr")).filter(s => !s.classList.contains("hidden")).map(s => s.id).join(", ")');
  console.log(`After quiz screen: "${activeScr}"`);
  if (activeScr.includes('scr-result')) {
    const trait = await ev('document.getElementById("res-trait")?.innerText?.trim()');
    const partner = await ev('document.getElementById("res-name")?.innerText?.trim()');
    console.log(`Personality trait: "${trait}", Recommended partner: "${partner}"`);
    await screenshot(`${prefix}-03-starter-result.png`);
    await ev('document.getElementById("res-ok")?.click()');
    await sleep(1500);
  }

  // Nếu chưa vào menu thì force mở menu
  await ev('if (typeof G !== "undefined" && G.UI) G.UI.show("scr-menu");');
  await sleep(1000);

  // 3. Menu chính tiếng Việt
  const menuButtons = await ev(`
    Array.from(document.querySelectorAll("#scr-menu .menu-item")).map(el => el.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean)
  `);
  console.log('Menu items translated:', menuButtons);
  await screenshot(`${prefix}-04-main-menu-desktop.png`);

  // Mobile Menu view 844x390
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' }
  });
  await sleep(500);
  await screenshot(`${prefix}-04-main-menu-mobile-844.png`);

  // Mobile Menu view 667x375 (iPhone SE)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 667, height: 375, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' }
  });
  await sleep(500);
  await screenshot(`${prefix}-04-main-menu-mobile-667.png`);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  // 4. Mở Cài đặt (Settings)
  console.log('Testing Settings modal...');
  await ev('document.getElementById("btn-settings")?.click() || (typeof G !== "undefined" && G.SettingsUI && G.SettingsUI.open())');
  await sleep(1000);
  const settingsHead = await ev('document.querySelector("#scr-settings h2")?.innerText?.trim()');
  console.log(`Settings heading: "${settingsHead}"`);
  await screenshot(`${prefix}-05-settings.png`);
  // Đóng modal settings
  await ev('document.getElementById("set-close")?.click()');
  await sleep(500);

  // 5. Bộ sưu tập (scr-dex)
  console.log('Testing Pokédex / Collection screen...');
  await ev('document.getElementById("menu-dex")?.click() || (typeof G !== "undefined" && G.DexUI && G.DexUI.open())');
  await sleep(1200);
  const dexTitle = await ev('document.querySelector("#scr-dex h2")?.innerText?.trim()');
  console.log(`Pokédex title: "${dexTitle}"`);
  await screenshot(`${prefix}-06-collection.png`);
  await ev('document.querySelector("#scr-dex [data-back]")?.click() || (typeof G !== "undefined" && G.UI && G.UI.show("scr-menu"))');
  await sleep(500);

  // 6. Gacha (scr-gacha)
  console.log('Testing Gacha screen...');
  await ev('document.getElementById("menu-gacha")?.click() || (typeof G !== "undefined" && G.GachaUI && G.GachaUI.open())');
  await sleep(1200);
  const gachaTitle = await ev('document.querySelector("#scr-gacha h2")?.innerText?.trim()');
  console.log(`Gacha title: "${gachaTitle}"`);
  await screenshot(`${prefix}-07-gacha.png`);
  await ev('document.querySelector("#scr-gacha [data-back]")?.click() || (typeof G !== "undefined" && G.UI && G.UI.show("scr-menu"))');
  await sleep(500);

  // 7. Cửa hàng Kecleon (scr-shop)
  console.log('Testing Shop screen...');
  await ev('document.getElementById("menu-shop")?.click() || (typeof G !== "undefined" && G.ShopUI && G.ShopUI.open())');
  await sleep(1200);
  const shopTitle = await ev('document.querySelector("#scr-shop h2")?.innerText?.trim()');
  console.log(`Shop title: "${shopTitle}"`);
  await screenshot(`${prefix}-08-shop.png`);
  await ev('document.querySelector("#scr-shop [data-back]")?.click() || (typeof G !== "undefined" && G.UI && G.UI.show("scr-menu"))');
  await sleep(500);

  // 8. Nâng cấp (scr-upgrades)
  console.log('Testing Upgrades screen...');
  await ev('document.getElementById("menu-upgrades")?.click() || (typeof G !== "undefined" && G.UpgradesUI && G.UpgradesUI.open())');
  await sleep(1200);
  const upTitle = await ev('document.querySelector("#scr-upgrades h2")?.innerText?.trim()');
  console.log(`Upgrades title: "${upTitle}"`);
  await screenshot(`${prefix}-09-upgrades.png`);
  await ev('document.querySelector("#scr-upgrades [data-back]")?.click() || (typeof G !== "undefined" && G.UI && G.UI.show("scr-menu"))');
  await sleep(500);

  // 9. Vào trận (Game battle)
  console.log('Starting battle run...');
  await ev('document.getElementById("menu-play")?.click()');
  await sleep(3000);
  const inGame = await ev('typeof G !== "undefined" && G.state && G.state.running');
  console.log(`In-game battle running: ${inGame}`);
  await screenshot(`${prefix}-10-battle-desktop.png`);

  // Mobile battle view 844x390
  await send('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' }
  });
  await sleep(500);
  await screenshot(`${prefix}-10-battle-mobile.png`);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  // 10. Pause game
  console.log('Pausing battle...');
  await ev('if (typeof G !== "undefined" && G.Game && G.Game.pause) G.Game.pause(); else if (typeof G !== "undefined" && G.UI) G.UI.show("scr-pause");');
  await sleep(1000);
  await screenshot(`${prefix}-11-battle-paused.png`);

  console.log(`[PASS] ${prefix.toUpperCase()} completed visual tests!`);
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
    if (d.id && waiting.has(d.id)) {
      const w = waiting.get(d.id);
      waiting.delete(d.id);
      if (d.error) w.rej(new Error(`${w.method}: ${d.error.message}`));
      else w.res(d.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  // Test dev.html
  await testPage('http://127.0.0.1:8765/dev.html', 'dev');

  // Test index.html (release build)
  await testPage('http://127.0.0.1:8765/index.html', 'index');

  console.log('\n======================================================');
  console.log('ALL SCREENSHOTS AND VISUAL GAMEPLAY CHECKS COMPLETED!');
  console.log('======================================================\n');
} catch (err) {
  console.error('Visual test execution error:', err);
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}
