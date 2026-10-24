import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9555;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-after-'));
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
    console.error('JS Exception:', r.exceptionDetails);
  }
  return r.result?.value;
};

async function checkLayout(vpName) {
  const res = await ev(`(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const hasHorizontalOverflow = docWidth > winWidth;
    const topbar = document.getElementById('topbar');
    const tbRect = topbar ? { w: topbar.offsetWidth, h: topbar.offsetHeight, top: topbar.offsetTop, right: topbar.offsetLeft + topbar.offsetWidth } : null;
    
    // Check buttons wrapping
    const saveBtn = document.getElementById('btn-save');
    const saveBtnHeight = saveBtn ? saveBtn.offsetHeight : 0;
    const saveBtnWidth = saveBtn ? saveBtn.offsetWidth : 0;

    const ytBtn = document.getElementById('btn-yt');
    const ytBtnHeight = ytBtn ? ytBtn.offsetHeight : 0;

    const logoutBtn = document.getElementById('btn-logout');
    const logoutVisible = logoutBtn ? window.getComputedStyle(logoutBtn).display !== 'none' : false;

    // Check menu grid columns
    const menuList = document.querySelector('.menu-list');
    const menuListStyle = menuList ? window.getComputedStyle(menuList).gridTemplateColumns : '';

    return {
      docWidth,
      winWidth,
      hasHorizontalOverflow,
      tbRect,
      saveBtnHeight,
      saveBtnWidth,
      ytBtnHeight,
      logoutVisible,
      menuListCols: menuListStyle.split(' ').length
    };
  })()`);

  console.log(`Layout check for ${vpName}:`, JSON.stringify(res, null, 2));
  if (res.hasHorizontalOverflow) {
    throw new Error(`FAIL: Horizontal overflow detected in ${vpName}: docWidth=${res.docWidth} > winWidth=${res.winWidth}`);
  }
  return res;
}

async function main() {
  try {
    await connect();
    await send('Page.enable');
    await send('DOM.enable');

    const viewports = [
      { name: 'after-mobile-390x844.png', w: 390, h: 844, mobile: true },
      { name: 'after-mobile-412x915.png', w: 412, h: 915, mobile: true },
      { name: 'after-mobile-360x800.png', w: 360, h: 800, mobile: true },
      { name: 'after-landscape-844x390.png', w: 844, h: 390, mobile: true },
      { name: 'after-desktop-1920x1080.png', w: 1920, h: 1080, mobile: false, dsf: 1 }
    ];

    for (const vp of viewports) {
      console.log(`Setting viewport: ${vp.w}x${vp.h} (mobile: ${vp.mobile})`);
      await setViewport(vp.w, vp.h, vp.mobile, vp.dsf || 2);
      await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
      await sleep(2500);

      // Dismiss login if guest button exists
      await ev(`(() => {
        const bg = document.getElementById('btn-guest');
        if (bg && bg.offsetParent !== null) bg.click();
      })()`);
      await sleep(1500);

      await checkLayout(vp.name);
      await capture(vp.name);
    }

    // Capture modal screens on 390x844
    await setViewport(390, 844, true, 2);
    // Click user-pill to open Account settings
    console.log('Testing Account settings modal via user-pill click...');
    await ev(`(() => {
      const up = document.getElementById('user-pill');
      if (up) up.click();
    })()`);
    await sleep(1500);
    await capture('after-mobile-settings-account.png');

    // Close settings
    await ev(`document.getElementById('set-close') && document.getElementById('set-close').click()`);
    await sleep(800);

    // Open Friends modal
    console.log('Testing Friends modal...');
    await ev(`(() => {
      const b = document.querySelector('[data-go="friends"]');
      if (b) b.click();
    })()`);
    await sleep(1500);
    await capture('after-mobile-friends.png');

    // Close friends
    await ev(`(() => {
      const b = document.querySelector('#scr-friends [data-back]');
      if (b) b.click();
    })()`);
    await sleep(800);

    // Open Pokédex modal
    console.log('Testing Pokédex modal...');
    await ev(`(() => {
      const b = document.querySelector('[data-go="dex"]');
      if (b) b.click();
    })()`);
    await sleep(2000);
    await capture('after-mobile-dex.png');

    console.log('ALL AFTER SCREENSHOTS AND VERIFICATIONS COMPLETED SUCCESSFULLY!');
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
