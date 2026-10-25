import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9569;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-prod-v133-'));
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
const consoleErrors = [];

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
            if (msg.method === 'Runtime.consoleAPICalled') {
              if (msg.params.type === 'error') {
                consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
              }
            } else if (msg.method === 'Runtime.exceptionThrown') {
              consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
            }
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

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
  }
  return r.result?.value;
}

async function setViewport(w, h, dpr = 2) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: dpr,
    mobile: w < 1000,
    fitWindow: false
  });
}

async function screenshot(filename) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const p = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
  console.log(`Saved screenshot: ${filename} (${(res.data.length * 0.75 / 1024).toFixed(1)} KB)`);
}

async function waitFor(fnExpr, maxMs = 20000, stepMs = 300) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const ok = await evaluate(fnExpr);
      if (ok) return true;
    } catch {}
    await sleep(stepMs);
  }
  return false;
}

async function run() {
  console.log('=== RUNNING LIVE PRODUCTION VERIFICATION FOR POKÉSURVIVOR V1.3.3 ===');
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  const LIVE_URL = `https://vunghia54.github.io/pokesurvivor-vietnam/?v=${Date.now()}`;
  console.log(`Navigating to Live Production: ${LIVE_URL}...`);
  await send('Page.navigate', { url: LIVE_URL });

  // 1. Wait for boot screen to finish loading
  console.log('Waiting for boot screen to finish loading assets...');
  const bootOk = await waitFor(`document.getElementById('boot').classList.contains('hidden')`, 30000, 500);
  if (!bootOk) throw new Error('Timeout waiting for boot screen');
  console.log('Boot completed.');

  // Set Mobile Landscape (844x390)
  await setViewport(844, 390);
  await sleep(300);

  // 2. Handle Tap to Start if visible
  const hasTap = await evaluate(`!document.getElementById('tap-start').classList.contains('hidden')`);
  if (hasTap) {
    console.log('Clicking tap to start...');
    await evaluate(`document.getElementById('tap-start').click()`);
    await sleep(800);
  }

  // 3. Handle Login screen (click Play as Guest)
  console.log('Waiting for login screen...');
  await waitFor(`!document.getElementById('scr-login').classList.contains('hidden') || !document.getElementById('scr-menu').classList.contains('hidden')`, 10000);
  const isLogin = await evaluate(`!document.getElementById('scr-login').classList.contains('hidden')`);
  if (isLogin) {
    console.log('Clicking Play as Guest (#btn-guest)...');
    await evaluate(`document.getElementById('btn-guest').click()`);
    await sleep(600);

    // Wait for personality test
    console.log('Waiting for personality test (#scr-test)...');
    await waitFor(`!document.getElementById('scr-test').classList.contains('hidden')`, 10000);

    // Answer 8 questions
    console.log('Answering personality questions...');
    for (let i = 0; i < 8; i++) {
      await waitFor(`document.querySelectorAll('#test-a .answer').length > 0`, 5000);
      await evaluate(`document.querySelector('#test-a .answer')?.click()`);
      await sleep(200);
    }

    // Wait for result screen
    console.log('Waiting for result screen (#scr-result)...');
    await waitFor(`!document.getElementById('scr-result').classList.contains('hidden')`, 10000);

    // Click confirm partner
    console.log('Confirming starter partner (#res-ok)...');
    await evaluate(`document.getElementById('res-ok').click()`);
    await sleep(1000);
  }

  // Wait for Main Menu to be open
  console.log('Waiting for Main Menu (#scr-menu)...');
  const menuReady = await waitFor(`!document.getElementById('scr-menu').classList.contains('hidden')`, 15000);
  if (!menuReady) throw new Error('Timeout waiting for Main Menu');
  console.log('Main Menu is READY!');
  await sleep(500);

  // 1. LIVE SCREENSHOT: Main Menu Landscape 844x390
  console.log('\n--- 1. Live Main Menu Verification ---');
  await screenshot('v133-live-prod-01-main-menu-844x390.png');

  const menuLiveCheck = await evaluate(`({
    menuVisible: !document.getElementById('scr-menu').classList.contains('hidden'),
    inSubscreen: document.body.classList.contains('in-subscreen'),
    topbarDisplay: window.getComputedStyle(document.getElementById('topbar')).display,
    partnerName: document.getElementById('menu-partner-name')?.textContent,
    hasOnline: !!document.getElementById('online-pill'),
    hasCoins: !!document.getElementById('coins-pill'),
    hasT1: !!document.getElementById('t1-pill'),
    hasT10: !!document.getElementById('t10-pill'),
    hasUser: !!document.getElementById('user-pill'),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  })`);
  console.log('Live Main Menu Check:', menuLiveCheck);

  // 2. LIVE SCREENSHOT: Upgrades Screen Landscape 844x390
  console.log('\n--- 2. Live Upgrades Screen Verification ---');
  await evaluate(`document.querySelector('#scr-menu [data-go="upgrades"]').click()`);
  await sleep(600);
  await screenshot('v133-live-prod-02-upgrades-844x390.png');

  const upgLiveCheck = await evaluate(`(() => {
    const tb = document.getElementById('topbar');
    const tbHidden = window.getComputedStyle(tb).display === 'none';
    const backBtn = document.querySelector('#scr-upgrades .back-btn');
    const bRect = backBtn.getBoundingClientRect();
    const backHit = document.elementFromPoint(bRect.left + bRect.width / 2, bRect.top + bRect.height / 2);
    const headerPos = window.getComputedStyle(document.querySelector('#scr-upgrades .subscreen-header')).position;
    const coinsText = document.getElementById('upg-coins')?.textContent;
    const body = document.querySelector('#scr-upgrades .subscreen-body');
    const canScroll = (body.scrollHeight > body.clientHeight);
    const overflow = document.documentElement.scrollWidth > window.innerWidth;

    return {
      tbHidden,
      backBtnOk: (backHit === backBtn || backBtn.contains(backHit)),
      backRect: { w: Math.round(bRect.width), h: Math.round(bRect.height) },
      headerPos,
      coinsText,
      canScroll,
      overflow
    };
  })()`);
  console.log('Live Upgrades Check:', upgLiveCheck);

  // 3. LIVE SCREENSHOT: Upgrades Portrait (390x844)
  console.log('\n--- 3. Live Upgrades Portrait Verification ---');
  await setViewport(390, 844);
  await sleep(400);
  await screenshot('v133-live-prod-03-upgrades-portrait-390x844.png');

  // Back to Menu
  await evaluate(`document.querySelector('#scr-upgrades .back-btn').click()`);
  await sleep(400);

  // Set back to Landscape
  await setViewport(844, 390);
  await sleep(300);

  // 4. LIVE SCREENSHOT: Dex Screen
  console.log('\n--- 4. Live Dex (Pokémon) Verification ---');
  await evaluate(`document.querySelector('#scr-menu [data-go="dex"]').click()`);
  await sleep(600);
  await screenshot('v133-live-prod-04-dex-844x390.png');
  await evaluate(`document.querySelector('#scr-dex .back-btn').click()`);
  await sleep(300);

  // 5. LIVE SCREENSHOT: Shop Screen (Kecleon Scene Canvas)
  console.log('\n--- 5. Live Shop Screen Verification ---');
  await evaluate(`document.querySelector('#scr-menu [data-go="shop"]').click()`);
  await sleep(300);
  // Skip stall intro if playing
  await evaluate(`document.getElementById('shop-stall')?.click()`);
  await sleep(1200);
  await screenshot('v133-live-prod-05-shop-844x390.png');
  await evaluate(`document.querySelector('#scr-shop .back-btn').click()`);
  await sleep(300);

  // 6. LIVE SCREENSHOT: Gacha Screen
  console.log('\n--- 6. Live Gacha Screen Verification ---');
  await evaluate(`document.querySelector('#scr-menu [data-go="gacha"]').click()`);
  await sleep(600);
  await screenshot('v133-live-prod-06-gacha-844x390.png');
  await evaluate(`document.querySelector('#scr-gacha .back-btn').click()`);
  await sleep(300);

  // 7. LIVE SCREENSHOT: Friends Screen & Co-op Lobby
  console.log('\n--- 7. Live Friends Screen Verification ---');
  await evaluate(`
    (() => {
      document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
      document.getElementById('scr-friends').classList.remove('hidden');
      document.body.classList.add('in-subscreen');
      document.getElementById('topbar').classList.add('hidden');
    })()
  `);
  await sleep(400);
  await screenshot('v133-live-prod-07-friends-844x390.png');
  await evaluate(`document.querySelector('#scr-friends .back-btn').click()`);
  await sleep(300);

  // 8. LIVE SCREENSHOT: Settings Modal
  console.log('\n--- 8. Live Settings Modal Verification ---');
  await evaluate(`
    (() => {
      document.getElementById('scr-settings').classList.remove('hidden');
      document.body.classList.add('in-subscreen');
      document.getElementById('topbar').classList.add('hidden');
    })()
  `);
  await sleep(400);
  await screenshot('v133-live-prod-08-settings-modal.png');
  await evaluate(`document.getElementById('set-close').click()`);
  await sleep(300);

  // Final Console check
  console.log('\nTotal Console Errors Logged during Live Production Testing:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error('Errors:', consoleErrors);
  }

  const liveReport = {
    url: LIVE_URL,
    version: 'e5bd636a6b',
    menuLiveCheck,
    upgLiveCheck,
    consoleErrorsCount: consoleErrors.length,
    success: menuLiveCheck.menuVisible && !menuLiveCheck.overflow &&
             upgLiveCheck.tbHidden && upgLiveCheck.backBtnOk && !upgLiveCheck.overflow &&
             consoleErrors.length === 0
  };

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'v133-live-prod-report.json'),
    JSON.stringify(liveReport, null, 2)
  );

  ws.close();
  chrome.kill();

  console.log('\n======================================================');
  console.log(`LIVE PRODUCTION VERIFICATION: ${liveReport.success ? '100% PASS (GO)' : 'FAIL (NO-GO)'}`);
  console.log('======================================================');

  if (!liveReport.success) process.exit(1);
}

run().catch(e => {
  console.error('Live production verification failed:', e);
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
});
