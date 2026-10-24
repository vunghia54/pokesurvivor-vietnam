import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9666;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-interact-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank'
], { stdio: 'ignore' });

let ws, seq = 0;
const waiting = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => waiting.set(id, { res, rej, method }));
}

async function connect() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://')) || list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.onopen = res;
          ws.onerror = rej;
          ws.onmessage = e => {
            const msg = JSON.parse(e.data);
            if (msg.id && waiting.has(msg.id)) {
              const { res, rej } = waiting.get(msg.id);
              waiting.delete(msg.id);
              if (msg.error) rej(msg.error);
              else res(msg.result);
            }
          };
        });
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('Cannot connect to Chrome CDP');
}

async function setViewport(width, height, isMobile = true, deviceScaleFactor = 2) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: isMobile,
    screenOrientation: width > height ? { angle: 90, type: 'landscapePrimary' } : { angle: 0, type: 'portraitPrimary' }
  });
  if (isMobile) {
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
    });
  } else {
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }
}

async function capture(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.data, 'base64');
  const file = path.join(ARTIFACT_DIR, name);
  fs.writeFileSync(file, buf);
  console.log(`[SAVED] ${name} (${buf.length} bytes)`);
  return file;
}

const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error('Browser error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result?.value;
};

async function main() {
  try {
    await connect();
    await send('Page.enable');
    await send('DOM.enable');

    console.log('=== TEST 1: KIỂM TRA ĐA VIEWPORT & KHÔNG TRÀN NGANG ===');
    const viewports = [
      { name: 'Mobile 360x800', w: 360, h: 800, mobile: true },
      { name: 'Mobile 390x844', w: 390, h: 844, mobile: true },
      { name: 'Mobile 412x915', w: 412, h: 915, mobile: true },
      { name: 'iPhone 375x812', w: 375, h: 812, mobile: true },
      { name: 'Landscape 844x390', w: 844, h: 390, mobile: true },
      { name: 'Desktop 1920x1080', w: 1920, h: 1080, mobile: false, dsf: 1 }
    ];

    for (const vp of viewports) {
      await setViewport(vp.w, vp.h, vp.mobile, vp.dsf || 2);
      await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
      await sleep(2000);

      // Enter guest mode
      await ev(`(() => {
        const bg = document.getElementById('btn-guest');
        if (bg && bg.offsetParent !== null) bg.click();
      })()`);
      await sleep(1500);

      const check = await ev(`(() => {
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        const topbar = document.getElementById('topbar');
        const tbH = topbar ? topbar.offsetHeight : 0;
        const menuList = document.querySelector('.menu-list');
        const cols = menuList ? window.getComputedStyle(menuList).gridTemplateColumns.split(' ').length : 0;
        
        return {
          docW,
          winW,
          overflow: docW > winW,
          tbH,
          cols
        };
      })()`);

      console.log(`[PASS] ${vp.name}: docW=${check.docW}, winW=${check.winW}, overflow=${check.overflow}, cols=${check.cols}`);
      if (check.overflow) throw new Error(`FAIL: Tràn ngang trên ${vp.name}`);
    }

    console.log('\n=== TEST 2: KIỂM TRA TƯƠNG TÁC TẤT CẢ NÚT TOPBAR ===');
    // Using 390x844 mobile viewport
    await setViewport(390, 844, true, 2);
    await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
    await sleep(2500);
    await ev(`(() => {
      const bg = document.getElementById('btn-guest');
      if (bg && bg.offsetParent !== null) bg.click();
    })()`);
    await sleep(1500);

    // 1. User pill click opens Account settings
    console.log('- Test User Pill -> Account Settings:');
    const userPillRes = await ev(`(() => {
      const up = document.getElementById('user-pill');
      if (!up) return false;
      up.click();
      return true;
    })()`);
    await sleep(1000);
    const settingsActive = await ev(`(() => {
      const scr = document.getElementById('scr-settings');
      return scr && !scr.classList.contains('hidden');
    })()`);
    console.log(`  Modal Cài đặt mở: ${settingsActive}`);
    if (!settingsActive) throw new Error('FAIL: User pill không mở Cài đặt tài khoản');

    // Verify Account tab content in Vietnamese
    const hasAccountFields = await ev(`(() => {
      const b = document.getElementById('set-body');
      const text = b ? b.innerText : '';
      return text.includes('Đăng xuất') || text.includes('Tạo tài khoản') || text.includes('Tài khoản');
    })()`);
    console.log(`  Tab Tài khoản hiển thị đúng tiếng Việt: ${hasAccountFields}`);
    if (!hasAccountFields) throw new Error('FAIL: Tab Tài khoản không hiển thị đúng');

    // Close settings
    await ev(`document.getElementById('set-close').click()`);
    await sleep(600);

    // 2. Test Sound button
    console.log('- Test Nút Âm thanh:');
    await ev(`document.getElementById('btn-sound').click()`);
    await sleep(600);
    const soundPanelOpen = await ev(`!document.getElementById('sound-panel').classList.contains('hidden')`);
    console.log(`  Bảng âm thanh mở: ${soundPanelOpen}`);
    if (!soundPanelOpen) throw new Error('FAIL: Bảng âm thanh không mở');
    await ev(`document.getElementById('btn-sound').click()`);
    await sleep(400);

    // 3. Test News button
    console.log('- Test Nút Tin tức (Novedades):');
    await ev(`document.getElementById('btn-news').click()`);
    await sleep(800);
    const newsActive = await ev(`!document.getElementById('scr-news').classList.contains('hidden')`);
    console.log(`  Modal Tin tức mở: ${newsActive}`);
    if (!newsActive) throw new Error('FAIL: Modal Tin tức không mở');
    await ev(`document.getElementById('news-close').click()`);
    await sleep(600);

    // 4. Test Settings button
    console.log('- Test Nút Cài đặt (Gear):');
    await ev(`document.getElementById('btn-settings').click()`);
    await sleep(600);
    const setOpen = await ev(`!document.getElementById('scr-settings').classList.contains('hidden')`);
    console.log(`  Modal Cài đặt mở qua nút Gear: ${setOpen}`);
    if (!setOpen) throw new Error('FAIL: Nút Cài đặt không mở');
    await ev(`document.getElementById('set-close').click()`);
    await sleep(600);

    console.log('\n=== TEST 3: KIỂM TRA CÁC MODAL KHÔNG BỊ CẮT ===');
    const modals = [
      { name: 'Bạn bè', scr: 'scr-friends', back: '#scr-friends [data-back]' },
      { name: 'Pokédex', scr: 'scr-dex', back: '#scr-dex [data-back]' },
      { name: 'Nâng cấp', scr: 'scr-upgrades', back: '#scr-upgrades [data-back]' },
      { name: 'Gacha', scr: 'scr-gacha', back: '#scr-gacha [data-back]' },
      { name: 'Xếp hạng', scr: 'scr-rank', back: '#scr-rank [data-back]' },
      { name: 'Phòng chờ Lobby', scr: 'scr-lobby', back: '#lobby-back' }
    ];

    for (const m of modals) {
      await ev(`(() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        const el = document.getElementById('${m.scr}');
        if (el) el.classList.remove('hidden');
      })()`);
      await sleep(600);
      const isVisible = await ev(`!document.getElementById('${m.scr}').classList.contains('hidden')`);
      const modalW = await ev(`document.querySelector('#${m.scr} .box') ? document.querySelector('#${m.scr} .box').offsetWidth : 0`);
      const winW = await ev(`window.innerWidth`);
      const fits = modalW <= winW && modalW > 0;
      console.log(`[PASS] Modal ${m.name}: visible=${isVisible}, boxWidth=${modalW} <= winWidth=${winW} (${fits})`);
      if (!isVisible || !fits) throw new Error(`FAIL: Modal ${m.name} không hiển thị hoặc tràn viền`);
    }

    // Return to main menu
    await ev(`(() => {
      document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
      document.getElementById('scr-menu').classList.remove('hidden');
    })()`);
    await sleep(400);

    console.log('\n=== TEST 4: KIỂM TRA XOAY MÀN HÌNH ĐỘNG DỌC <-> NGANG ===');
    // Rotate to landscape 844x390
    await setViewport(844, 390, true, 2);
    await sleep(1000);
    let rotCheck = await ev(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return { docW, winW, ok: docW <= winW };
    })()`);
    console.log(`- Xoay ngang (844x390): docW=${rotCheck.docW}, winW=${rotCheck.winW}, OK=${rotCheck.ok}`);
    if (!rotCheck.ok) throw new Error('FAIL: Lỗi bố cục khi xoay ngang');

    // Rotate back to portrait 390x844
    await setViewport(390, 844, true, 2);
    await sleep(1000);
    rotCheck = await ev(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const cols = document.querySelector('.menu-list') ? window.getComputedStyle(document.querySelector('.menu-list')).gridTemplateColumns.split(' ').length : 0;
      return { docW, winW, cols, ok: docW <= winW && cols === 2 };
    })()`);
    console.log(`- Xoay dọc lại (390x844): docW=${rotCheck.docW}, winW=${rotCheck.winW}, cols=${rotCheck.cols}, OK=${rotCheck.ok}`);
    if (!rotCheck.ok) throw new Error('FAIL: Lỗi bố cục khi xoay dọc lại');

    console.log('\n=== TẤT CẢ CÁC BÀI KIỂM TRA GIAO DIỆN TƯƠNG TÁC THỰC TẾ ĐẠT 100%! ===');
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
