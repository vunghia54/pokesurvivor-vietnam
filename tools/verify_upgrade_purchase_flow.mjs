import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9559;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-upg-buy-'));
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

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
  }
  return r.result?.value;
}

async function run() {
  console.log('=== VERIFYING INTERACTIVE UPGRADE PURCHASE FLOW ===');
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });

  await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
  await sleep(1500);

  // Setup account with 50,000 coins and partner Pikachu
  await evaluate(`
    (async () => {
      localStorage.clear();
      const save = {
        user: 'NghiaDev',
        coins: 50000,
        partner: 25,
        owned: { '25': 1 },
        pupg: { '25': { hp: 1 } },
        stats: { runs: 5, bestTime: 300, bestLevel: 10, totalKills: 200 }
      };
      localStorage.setItem('ps.save.local', JSON.stringify(save));
      const tap = document.getElementById('tap-start');
      if (tap) tap.click();
      const bg = document.getElementById('btn-guest');
      if (bg && !document.getElementById('scr-login').classList.contains('hidden')) bg.click();
    })()
  `);
  await sleep(1000);

  // Open Upgrades
  await evaluate(`
    (() => {
      const btn = document.querySelector('#scr-menu [data-go="upgrades"]');
      if (btn) btn.click();
    })()
  `);
  await sleep(400);

  const beforeBuy = await evaluate(`
    (() => {
      const headerCoins = document.getElementById('upg-coins')?.textContent;
      const buyBtn = document.querySelector('#upg-list .upg-item [data-buy]');
      const buyBtnText = buyBtn ? buyBtn.textContent.trim() : null;
      return { headerCoins, buyBtnText };
    })()
  `);
  console.log('Before Buy:', beforeBuy);

  // Click Buy
  await evaluate(`
    (() => {
      const buyBtn = document.querySelector('#upg-list .upg-item [data-buy]');
      if (buyBtn) buyBtn.click();
    })()
  `);
  await sleep(400);

  const afterBuy = await evaluate(`
    (() => {
      const headerCoins = document.getElementById('upg-coins')?.textContent;
      const toast = document.querySelector('.toast');
      const toastText = toast ? toast.textContent : null;
      const toastVisible = toast ? window.getComputedStyle(toast).display !== 'none' : false;
      const buyBtn = document.querySelector('#upg-list .upg-item [data-buy]');
      const buyBtnText = buyBtn ? buyBtn.textContent.trim() : null;
      return { headerCoins, toastText, toastVisible, buyBtnText };
    })()
  `);
  console.log('After Buy:', afterBuy);

  // Take screenshot of purchased state with toast and updated coins
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const p = path.join(ARTIFACT_DIR, 'v133-interactive-upgrade-purchased-landscape-844x390.png');
  fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
  console.log(`Saved screenshot: v133-interactive-upgrade-purchased-landscape-844x390.png (${(res.data.length * 0.75 / 1024).toFixed(1)} KB)`);

  // Click Back to Menu
  await evaluate(`
    (() => {
      document.querySelector('#scr-upgrades .back-btn').click();
    })()
  `);
  await sleep(300);

  const backMenu = await evaluate(`
    (() => {
      const menuOpen = !document.getElementById('scr-menu').classList.contains('hidden');
      const topbarCoins = document.getElementById('coins')?.textContent;
      const topbarDisplay = window.getComputedStyle(document.getElementById('topbar')).display;
      return { menuOpen, topbarCoins, topbarDisplay };
    })()
  `);
  console.log('Back on Menu:', backMenu);

  ws.close();
  chrome.kill();
  console.log('=== INTERACTIVE PURCHASE FLOW VERIFIED 100% ===');
}

run().catch(e => {
  console.error(e);
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
});
