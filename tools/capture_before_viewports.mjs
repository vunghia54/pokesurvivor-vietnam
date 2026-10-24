import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9444;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-before-'));
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

async function main() {
  try {
    await connect();
    await send('Page.enable');
    await send('DOM.enable');

    const viewports = [
      { name: 'before-mobile-390x844.png', w: 390, h: 844, mobile: true },
      { name: 'before-mobile-412x915.png', w: 412, h: 915, mobile: true },
      { name: 'before-mobile-360x800.png', w: 360, h: 800, mobile: true },
      { name: 'before-landscape-844x390.png', w: 844, h: 390, mobile: true },
      { name: 'before-desktop-1920x1080.png', w: 1920, h: 1080, mobile: false, dsf: 1 }
    ];

    for (const vp of viewports) {
      console.log(`Setting viewport: ${vp.w}x${vp.h} (mobile: ${vp.mobile})`);
      await setViewport(vp.w, vp.h, vp.mobile, vp.dsf || 2);
      await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
      await sleep(2500);

      // If login screen is showing, capture login first
      const hasLogin = await send('Runtime.evaluate', {
        expression: 'Boolean(document.getElementById("scr-login") && document.getElementById("scr-login").classList.contains("active"))',
        returnByValue: true
      });
      if (hasLogin.result?.value) {
        await capture(vp.name.replace('.png', '-login.png'));
        // Click guest button to enter menu
        await send('Runtime.evaluate', {
          expression: 'document.getElementById("btn-guest") && document.getElementById("btn-guest").click()',
          returnByValue: true
        });
        await sleep(1500);
      }

      await capture(vp.name);
    }

    console.log('ALL BEFORE SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
