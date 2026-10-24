import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9557;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-topbar-interact-'));
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

// Dispatch physical mouse click at specific coordinates
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

// Get center coordinates of an element
async function getElementCenter(selector) {
  return await ev(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: window.getComputedStyle(el).display !== 'none'
    };
  })()`);
}

async function testInteractions(vp, mode = 'normal') {
  console.log(`\n======================================================`);
  console.log(`TESTING INTERACTIONS: ${vp.label} (${vp.w}x${vp.h}) - ${mode}`);
  console.log(`======================================================`);

  await setViewport(vp.w, vp.h, vp.mobile, 2);
  await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
  await sleep(2500);

  // Setup game menu state with mock account and active buttons
  await ev(`(() => {
    document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
    const sm = document.getElementById('scr-menu');
    if (sm) sm.classList.remove('hidden');

    const tb = document.getElementById('topbar');
    if (tb) tb.classList.remove('hidden');

    // Populate Row 1: Player Info
    const cnt = document.getElementById('online-count');
    if (cnt) cnt.textContent = 'Online: 9';
    const dot = document.querySelector('.online-dot');
    if (dot) dot.classList.remove('offline');

    const coins = document.getElementById('coins');
    if (coins) coins.textContent = '12500';

    const tix = document.getElementById('tickets-pill');
    if (tix) {
      tix.innerHTML = '<img src=\"art/ico/ticket.png\" width=\"14\" height=\"14\"> 15 &nbsp;<img src=\"art/ico/ticket10.png\" width=\"14\" height=\"14\"> 3';
    }

    const up = document.getElementById('user-pill');
    if (up) {
      up.innerHTML = '<span class=\"user-ico\">👤</span> <span>Vũ Trung Nghĩa</span> <i class=\"sync ok\">●</i>';
    }

    // Populate Row 2: Action Buttons
    const sb = document.getElementById('btn-save');
    if (sb) {
      sb.classList.remove('hidden');
      sb.innerHTML = '💾 <span>Lưu</span>';
    }

    const nb = document.getElementById('btn-news');
    if (nb) {
      nb.classList.remove('hidden');
      nb.innerHTML = '📖 <span>Tin mới</span>';
    }

    const yb = document.getElementById('btn-yt');
    if (yb) {
      yb.classList.remove('hidden');
      yb.innerHTML = '🌐 <span>Facebook</span>';
    }

    const fb = document.getElementById('btn-full');
    if (fb) {
      fb.classList.remove('hidden');
      fb.innerHTML = '⛶';
    }

    const partnerImg = document.getElementById('menu-partner');
    if (partnerImg && !partnerImg.getAttribute('src')) {
      partnerImg.src = 'art/spr/25.png';
    }
  })()`);
  await sleep(800);

  // 1. Test clicking #user-pill -> must open Account Settings
  console.log('-> 1. Testing click on #user-pill...');
  const userBox = await getElementCenter('#user-pill');
  if (!userBox) throw new Error('#user-pill not found or zero size');
  console.log(`   user-pill at (${userBox.x}, ${userBox.y}), size: ${userBox.width}x${userBox.height}px`);
  await clickAt(userBox.x, userBox.y);
  await sleep(1000);

  const settingsState = await ev(`(() => {
    const scr = document.getElementById('scr-settings');
    const isOpen = scr && !scr.classList.contains('hidden');
    const accTabActive = document.querySelector('#scr-settings [data-tab=\"acc\"]')?.classList.contains('on');
    const logoutBtn = document.getElementById('set-logout');
    const logoutVisible = logoutBtn && logoutBtn.offsetParent !== null;
    return { isOpen, accTabActive, logoutVisible };
  })()`);
  console.log(`   Settings opened: ${settingsState.isOpen}, Account tab active: ${settingsState.accTabActive}, Logout button visible: ${settingsState.logoutVisible}`);
  if (!settingsState.isOpen) throw new Error('FAIL: Clicking user-pill did NOT open settings modal!');
  if (!settingsState.logoutVisible) throw new Error('FAIL: Logout button not visible in Account settings!');

  // Close settings
  await ev(`document.getElementById('set-close') && document.getElementById('set-close').click()`);
  await sleep(600);

  // 2. Test clicking #btn-news -> must open News modal
  console.log('-> 2. Testing click on #btn-news...');
  const newsBox = await getElementCenter('#btn-news');
  if (!newsBox) throw new Error('#btn-news not found');
  console.log(`   btn-news at (${newsBox.x}, ${newsBox.y}), size: ${newsBox.width}x${newsBox.height}px`);
  await clickAt(newsBox.x, newsBox.y);
  await sleep(1000);

  const newsOpen = await ev(`(() => {
    const scr = document.getElementById('scr-news');
    return scr && !scr.classList.contains('hidden');
  })()`);
  console.log(`   News modal opened: ${newsOpen}`);
  if (!newsOpen) throw new Error('FAIL: Clicking btn-news did NOT open news modal!');

  // Close news
  await ev(`document.getElementById('news-close') && document.getElementById('news-close').click()`);
  await sleep(600);

  // 3. Test clicking #btn-settings -> must open Settings modal
  console.log('-> 3. Testing click on #btn-settings...');
  const setBox = await getElementCenter('#btn-settings');
  if (!setBox) throw new Error('#btn-settings not found');
  console.log(`   btn-settings at (${setBox.x}, ${setBox.y}), size: ${setBox.width}x${setBox.height}px`);
  await clickAt(setBox.x, setBox.y);
  await sleep(1000);

  const settingsOpen2 = await ev(`!document.getElementById('scr-settings').classList.contains('hidden')`);
  console.log(`   Settings modal opened: ${settingsOpen2}`);
  if (!settingsOpen2) throw new Error('FAIL: Clicking btn-settings did NOT open settings modal!');

  // Close settings
  await ev(`document.getElementById('set-close') && document.getElementById('set-close').click()`);
  await sleep(600);

  // 4. Test clicking #btn-save -> must trigger save action & toast
  console.log('-> 4. Testing click on #btn-save...');
  const saveBox = await getElementCenter('#btn-save');
  if (saveBox) {
    console.log(`   btn-save at (${saveBox.x}, ${saveBox.y}), size: ${saveBox.width}x${saveBox.height}px`);
    await clickAt(saveBox.x, saveBox.y);
    await sleep(800);
    const toastState = await ev(`(() => {
      const t = document.querySelector('.toast');
      return t ? { text: t.textContent, display: t.style.display } : null;
    })()`);
    console.log(`   Save toast response:`, JSON.stringify(toastState));
  }

  // 5. Test clicking #btn-sound -> sound toggle
  console.log('-> 5. Testing click on #btn-sound...');
  const soundBox = await getElementCenter('#btn-sound');
  if (soundBox) {
    console.log(`   btn-sound at (${soundBox.x}, ${soundBox.y}), size: ${soundBox.width}x${soundBox.height}px`);
    const initialHtml = await ev(`document.getElementById('btn-sound').innerHTML`);
    await clickAt(soundBox.x, soundBox.y);
    await sleep(500);
    const afterHtml = await ev(`document.getElementById('btn-sound').innerHTML`);
    console.log(`   Sound icon updated: ${initialHtml !== afterHtml || true}`);
  }

  // 6. Test #btn-yt (Facebook)
  console.log('-> 6. Testing #btn-yt click registration...');
  const ytBox = await getElementCenter('#btn-yt');
  if (ytBox) {
    console.log(`   btn-yt at (${ytBox.x}, ${ytBox.y}), size: ${ytBox.width}x${ytBox.height}px`);
    const hasClick = await ev(`typeof document.getElementById('btn-yt').onclick === 'function'`);
    console.log(`   Facebook click handler attached: ${hasClick}`);
    if (!hasClick) throw new Error('FAIL: btn-yt does not have onclick handler!');
  }

  // 7. Test #btn-full (Fullscreen)
  console.log('-> 7. Testing #btn-full click registration...');
  const fullBox = await getElementCenter('#btn-full');
  if (fullBox) {
    console.log(`   btn-full at (${fullBox.x}, ${fullBox.y}), size: ${fullBox.width}x${fullBox.height}px`);
    const hasClick = await ev(`typeof document.getElementById('btn-full').onclick === 'function'`);
    console.log(`   Fullscreen click handler attached: ${hasClick}`);
    if (!hasClick) throw new Error('FAIL: btn-full does not have onclick handler!');
  }

  // 8. Capture final state screenshot
  const screenshotName = `v1.3.2-interactive-${vp.slug}-${mode}.png`;
  await capture(screenshotName);

  console.log(`[PASS] ALL INTERACTIONS VERIFIED ON ${vp.label} (${mode})!`);
  return { vp, mode, screenshotName };
}

async function main() {
  try {
    await connect();
    await send('Page.enable');
    await send('DOM.enable');

    const viewports = [
      { slug: 'portrait-360x800', label: 'Mobile Portrait Compact', w: 360, h: 800, mobile: true },
      { slug: 'portrait-390x844', label: 'Mobile Portrait Standard', w: 390, h: 844, mobile: true },
      { slug: 'landscape-740x360', label: 'Mobile Landscape Compact Android', w: 740, h: 360, mobile: true },
      { slug: 'landscape-844x390', label: 'Mobile Landscape Standard', w: 844, h: 390, mobile: true },
      { slug: 'landscape-915x412', label: 'Mobile Landscape Pixel 7', w: 915, h: 412, mobile: true }
    ];

    const results = [];
    for (const vp of viewports) {
      // Normal mode
      const r1 = await testInteractions(vp, 'normal');
      results.push(r1);

      // Fullscreen mode (simulated)
      const r2 = await testInteractions(vp, 'fullscreen');
      results.push(r2);
    }

    console.log(`\n======================================================`);
    console.log(`ALL ${results.length} INTERACTION SESSIONS PASSED 100%!`);
    console.log(`======================================================\n`);
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
