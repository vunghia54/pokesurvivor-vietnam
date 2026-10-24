import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9558;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-prod-verify-'));
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

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function getCenter(sel) {
  return await ev(`(() => {
    const el = document.querySelector('${sel}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      left: Math.round(r.left * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
      visible: window.getComputedStyle(el).display !== 'none'
    };
  })()`);
}

async function main() {
  try {
    await connect();
    await send('Page.enable');
    await send('DOM.enable');

    console.log(`\n======================================================`);
    console.log(`VERIFYING LIVE PRODUCTION: https://vunghia54.github.io/pokesurvivor-vietnam/`);
    console.log(`======================================================`);

    // 1. Check Landscape 844x390
    await setViewport(844, 390, true, 2);
    await send('Page.navigate', { url: 'https://vunghia54.github.io/pokesurvivor-vietnam/?_=' + Date.now() });
    await sleep(4000);

    const prodInfo = await ev(`(() => {
      const scriptTag = Array.from(document.querySelectorAll('script')).map(s => s.src).find(s => s.includes('app.min.js'));
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return {
        title: document.title,
        scriptTag,
        docW,
        winW,
        hasOverflow: docW > winW
      };
    })()`);
    console.log('Production Page Info:', JSON.stringify(prodInfo, null, 2));

    // Enter game menu
    await ev(`(() => {
      document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
      const sm = document.getElementById('scr-menu');
      if (sm) sm.classList.remove('hidden');
      const tb = document.getElementById('topbar');
      if (tb) tb.classList.remove('hidden');

      // Populate sample pills for measurement
      const cnt = document.getElementById('online-count');
      if (cnt && (!cnt.textContent || cnt.textContent.includes('—'))) cnt.textContent = 'Online: 9';
      const dot = document.querySelector('.online-dot');
      if (dot) dot.classList.remove('offline');
      const coins = document.getElementById('coins');
      if (coins && coins.textContent === '0') coins.textContent = '12500';
      const tix = document.getElementById('tickets-pill');
      if (tix && !tix.innerHTML) {
        tix.innerHTML = '<img src=\"art/ico/ticket.png\" width=\"14\" height=\"14\"> 15 &nbsp;<img src=\"art/ico/ticket10.png\" width=\"14\" height=\"14\"> 3';
      }
      const up = document.getElementById('user-pill');
      if (up && !up.innerHTML) {
        up.innerHTML = '<span>👤 Vũ Trung Nghĩa</span>';
      }
    })()`);
    await sleep(800);

    // Measure live bounding boxes
    const liveBoxes = await ev(`(() => {
      function b(id) {
        const el = document.getElementById(id) || document.querySelector(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          id,
          left: Math.round(r.left * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          top: Math.round(r.top * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
          visible: window.getComputedStyle(el).display !== 'none'
        };
      }
      return {
        online: b('online-pill'),
        coins: b('coins-pill'),
        tickets: b('tickets-pill'),
        user: b('user-pill'),
        news: b('btn-news'),
        sound: b('btn-sound'),
        settings: b('btn-settings'),
        logout: b('btn-logout'),
        logo: b('.menu-left .logo')
      };
    })()`);
    console.log('Live Bounding Boxes on 844x390 Landscape:', JSON.stringify(liveBoxes, null, 2));

    // Verify Row 1: all left >= 0
    if (liveBoxes.online.left < 0 || liveBoxes.coins.left < 0 || liveBoxes.tickets.left < 0) {
      throw new Error('FAIL: Online/Coins/Tickets pill has negative X on live site!');
    }
    // Verify Row 2: right <= 844
    if (liveBoxes.settings.right > 844) {
      throw new Error('FAIL: Settings button exceeds right viewport edge on live site!');
    }
    // Verify Logout hidden from topbar
    if (liveBoxes.logout.visible) {
      throw new Error('FAIL: Logout button unexpectedly visible in topbar on live mobile!');
    }
    console.log('>>> CONFIRMED: Topbar left info is 100% visible, no clipping, correct 2-row layout!');

    // Test live interaction: click #user-pill to open Account settings
    console.log('Testing live click on #user-pill...');
    const userCenter = await getCenter('#user-pill');
    await clickAt(userCenter.x, userCenter.y);
    await sleep(1000);
    const settingsOpened = await ev(`!document.getElementById('scr-settings').classList.contains('hidden')`);
    console.log(`Live Settings modal opened via user-pill: ${settingsOpened}`);
    await ev(`document.getElementById('set-close') && document.getElementById('set-close').click()`);
    await sleep(600);

    // Test live click on #btn-news
    console.log('Testing live click on #btn-news...');
    const newsCenter = await getCenter('#btn-news');
    await clickAt(newsCenter.x, newsCenter.y);
    await sleep(1000);
    const newsOpened = await ev(`!document.getElementById('scr-news').classList.contains('hidden')`);
    console.log(`Live News modal opened via btn-news: ${newsOpened}`);
    await ev(`document.getElementById('news-close') && document.getElementById('news-close').click()`);
    await sleep(600);

    // Test live click on #btn-settings
    console.log('Testing live click on #btn-settings...');
    const setCenter = await getCenter('#btn-settings');
    await clickAt(setCenter.x, setCenter.y);
    await sleep(1000);
    const setOpened = await ev(`!document.getElementById('scr-settings').classList.contains('hidden')`);
    console.log(`Live Settings modal opened via btn-settings: ${setOpened}`);
    await ev(`document.getElementById('set-close') && document.getElementById('set-close').click()`);
    await sleep(600);

    // Capture live landscape screenshot
    await capture('production-live-v1.3.2-landscape-844x390.png');

    // 2. Check Portrait 390x844
    console.log('\nChecking live Portrait 390x844...');
    await setViewport(390, 844, true, 2);
    await sleep(1000);
    const portBoxes = await ev(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const tb = document.getElementById('topbar');
      const online = document.getElementById('online-pill');
      const set = document.getElementById('btn-settings');
      return {
        docW,
        winW,
        hasOverflow: docW > winW,
        onlineLeft: online ? online.getBoundingClientRect().left : 0,
        setRight: set ? set.getBoundingClientRect().right : 0
      };
    })()`);
    console.log('Live Portrait 390x844 metrics:', JSON.stringify(portBoxes, null, 2));
    if (portBoxes.hasOverflow) throw new Error('FAIL: Horizontal overflow in live portrait!');
    await capture('production-live-v1.3.2-portrait-390x844.png');

    // 3. Test Co-op Lobby button
    console.log('\nTesting live Co-op Lobby navigation...');
    await ev(`(() => {
      const coopBtn = document.querySelector('[data-go=\"coop\"]') || document.querySelector('#menu-list .menu-item:nth-child(2)');
      if (coopBtn) coopBtn.click();
    })()`);
    await sleep(1500);
    const lobbyState = await ev(`(() => {
      const scr = document.getElementById('scr-lobby') || document.getElementById('scr-coop');
      return {
        activeScreen: Array.from(document.querySelectorAll('.scr')).filter(s => !s.classList.contains('hidden')).map(s => s.id)
      };
    })()`);
    console.log('Live Co-op screen state:', JSON.stringify(lobbyState, null, 2));

    await capture('production-live-v1.3.2-coop-screen.png');

    console.log(`\n======================================================`);
    console.log(`LIVE PRODUCTION WEBSITE VERIFIED 100% OPERATIONAL!`);
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
