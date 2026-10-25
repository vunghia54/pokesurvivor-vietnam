import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TARGET_VERSION = '12819ab884';
const BASE_URL = 'https://vunghia54.github.io/pokesurvivor-vietnam/';
const PORT = 9599;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/d9d8ca79-347d-4dd3-821a-6cabc143c71b/screenshots';
const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function verifyHttpAssets() {
  console.log('=== 1. KIỂM THỬ ENDPOINT & ASSETS TRÊN GITHUB PAGES ===');
  
  // 1. version.json
  const vRes = await fetch(`${BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
  const vJson = await vRes.json();
  console.log('Live version.json:', vJson);
  if (vJson.v !== TARGET_VERSION) {
    throw new Error(`Version mismatch: expected ${TARGET_VERSION}, got ${vJson.v}`);
  }
  console.log(`✓ version.json chính xác bundle: ${TARGET_VERSION}`);

  // 2. index.html
  const idxRes = await fetch(`${BASE_URL}index.html?t=${Date.now()}`, { cache: 'no-store' });
  const idxHtml = await idxRes.text();
  if (!idxHtml.includes(`app.min.js?v=${TARGET_VERSION}`)) {
    throw new Error(`index.html chưa nạp bundle ${TARGET_VERSION}`);
  }
  console.log(`✓ index.html tham chiếu app.min.js?v=${TARGET_VERSION}`);

  // 3. app.min.js
  const jsRes = await fetch(`${BASE_URL}js/app.min.js?v=${TARGET_VERSION}`, { method: 'HEAD', cache: 'no-store' });
  console.log(`✓ app.min.js?v=${TARGET_VERSION} HTTP status: ${jsRes.status}`);
  if (jsRes.status !== 200) throw new Error(`app.min.js HTTP error: ${jsRes.status}`);

  // 4. Sample mega sprites
  const sampleSprites = [
    'assets/pokemon/mega_6_x/Idle.png',
    'assets/pokemon/mega_65/Idle.png',
    'assets/pokemon/mega_94/Idle.png',
    'assets/pokemon/mega_115/Idle.png',
    'assets/pokemon/mega_142/Idle.png',
    'assets/pokemon/mega_150_y/Idle.png',
    'assets/pokemon/mega_208/Idle.png',
    'assets/pokemon/mega_227/Idle.png',
    'assets/pokemon/mega_384/Idle.png',
    'assets/pokemon/mega_448/Idle.png',
    'assets/pokemon/mega_670/Idle.png',
    'assets/pokemon/mega_718/Idle.png',
    'assets/pokemon/mega_807/Idle.png',
    'assets/pokemon/mega_978/Idle.png'
  ];

  for (const s of sampleSprites) {
    const sRes = await fetch(`${BASE_URL}${s}?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    if (sRes.status === 200) {
      console.log(`✓ Sprite live: ${s} (HTTP 200)`);
    } else {
      throw new Error(`Thiếu sprite live: ${s} (HTTP ${sRes.status})`);
    }
  }
}

async function verifyLiveChrome() {
  console.log('\n=== 2. KHỞI CHẠY CHROME KIỂM ĐỊNH PRODUCTION WEBSITE THẬT ===');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-live-v141-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
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

  async function evalExpr(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result?.value;
  }

  try {
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
                  const text = msg.params.args?.map(a => a.value || a.description || JSON.stringify(a)).join(' ') || 'error';
                  consoleErrors.push(text);
                }
              } else if (msg.id && waiting.has(msg.id)) {
                const { res, rej } = waiting.get(msg.id);
                waiting.delete(msg.id);
                if (msg.error) rej(msg.error);
                else res(msg.result);
              }
            };
          });
          break;
        }
      } catch {}
      await sleep(200);
    }

    if (!ws) throw new Error('Không thể kết nối Chrome CDP');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, fitWindow: false
    });

    console.log(`Đang điều hướng đến: ${BASE_URL} ...`);
    await send('Page.navigate', { url: BASE_URL });

    let domState = null;
    for (let k = 0; k < 20; k++) {
      await sleep(1000);
      try {
        domState = await evalExpr(`
          (() => {
            const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src);
            const target = scripts.find(s => s.includes('app.min.js?v=${TARGET_VERSION}'));
            const canvas = document.getElementById('game');
            const scrLogin = document.getElementById('scr-login');
            const btnGuest = document.getElementById('btn-guest');
            return {
              hasTarget: !!target,
              scriptSrc: target || 'none',
              hasCanvas: !!canvas,
              hasLogin: !!scrLogin,
              hasBtnGuest: !!btnGuest
            };
          })()
        `);
        if (domState && domState.hasTarget && domState.hasCanvas) {
          break;
        }
      } catch {}
    }

    console.log('Thông tin DOM website thật:', domState);

    if (!domState || !domState.hasTarget) {
      throw new Error('Website thật chưa tải xong bundle: ' + TARGET_VERSION);
    }
    if (!domState.hasCanvas) {
      throw new Error('Không tìm thấy Canvas phần tử #game');
    }

    // Tương tác vào màn hình Guest / Starter
    console.log('Nhấn nút Jugar como invitado (Play as guest)...');
    await evalExpr(`
      (() => {
        const bg = document.getElementById('btn-guest');
        if (bg) bg.click();
      })()
    `);
    await sleep(2000);

    // Chụp ảnh màn hình live production
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');

    const artifactPath = path.join(ARTIFACT_DIR, 'live_production_v141.png');
    const localPath = path.join(LOCAL_DIR, 'live_production_v141.png');
    fs.writeFileSync(artifactPath, buf);
    fs.writeFileSync(localPath, buf);
    console.log(`✓ Đã lưu ảnh chụp website thật: ${artifactPath}`);

    console.log('✓ Xác minh nạp bundle sản xuất v=' + TARGET_VERSION + ': ĐẠT');
    console.log('✓ Xác minh Canvas #game: ĐẠT');
    console.log('✓ Console errors: ' + consoleErrors.length);

    ws.close();
  } finally {
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  await verifyHttpAssets();
  await verifyLiveChrome();
  console.log('\n================================================================');
  console.log('>>> TOÀN BỘ KIỂM ĐỊNH LIVE PRODUCTION V1.4.1 THÀNH CÔNG RỰC RỠ! <<<');
  console.log('================================================================');
}

main().catch(err => {
  console.error('LỖI KIỂM ĐỊNH LIVE:', err);
  process.exit(1);
});
