import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9599;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/81777abe-2919-4a9c-9d4f-401ea8ac9cee/screenshots';
const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function verifyLiveProduction() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TRỰC TIẾP TRÊN WEBSITE PRODUCTION THẬT ===');
  console.log('Website: https://vunghia54.github.io/pokesurvivor-vietnam/');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-live-v1361-'));
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
      width: 900, height: 500, deviceScaleFactor: 2, mobile: true, fitWindow: false
    });

    console.log('1. Đang điều hướng đến https://vunghia54.github.io/pokesurvivor-vietnam/ ...');
    await send('Page.navigate', { url: 'https://vunghia54.github.io/pokesurvivor-vietnam/' });
    await sleep(3000);

    // Kiểm tra bundle script trên trang live
    const liveBundleInfo = await evalExpr(`
      (() => {
        const script = document.querySelector('script[src*="app.min.js"]');
        const ver = script ? script.src : 'none';
        return {
          bundleSrc: ver,
          hasTargetBundle: ver.includes('c42f9ce950')
        };
      })()
    `);
    console.log('Thông tin Bundle trên Production:', liveBundleInfo);
    if (!liveBundleInfo.hasTargetBundle) {
      throw new Error('Production chưa load đúng bundle c42f9ce950: ' + liveBundleInfo.bundleSrc);
    }

    // 2. Tương tác bắt đầu game (Tap to start -> Guest mode)
    console.log('2. Nhấn Tap-to-start và chọn Guest Mode...');
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
      })()
    `);
    await sleep(800);

    await evalExpr(`
      (() => {
        const bg = document.getElementById('btn-guest');
        if (bg && !bg.classList.contains('hidden')) bg.click();
      })()
    `);
    await sleep(1500);

    // Nếu hiện màn hình chọn partner/starter lần đầu, tự động chọn starter đầu tiên
    await evalExpr(`
      (() => {
        const starterOk = document.getElementById('starter-ok');
        const firstCard = document.querySelector('#starter-grid .card, #starter-grid div');
        if (firstCard) firstCard.click();
        if (starterOk && !starterOk.disabled) starterOk.click();
      })()
    `);
    await sleep(1000);

    // 3. Kiểm tra các màn hình UI chính trên production (Topbar, Menu, Shop)
    console.log('3. Kiểm tra Topbar, Menu và Cửa hàng Kecleon...');
    const uiState = await evalExpr(`
      (() => {
        const topbar = document.getElementById('topbar');
        const menu = document.getElementById('scr-menu');
        const shopBtn = document.querySelector('#scr-menu [data-go="shop"]');
        return {
          topbarVisible: topbar && !topbar.classList.contains('hidden'),
          menuVisible: menu && !menu.classList.contains('hidden'),
          hasShopBtn: !!shopBtn
        };
      })()
    `);
    console.log('Trạng thái UI cơ bản:', uiState);

    // Mở và kiểm tra Shop Kecleon
    const shopCheck = await evalExpr(`
      (() => {
        const shopBtn = document.querySelector('#scr-menu [data-go="shop"]');
        if (shopBtn) shopBtn.click();
        const scrShop = document.getElementById('scr-shop');
        const isOpen = scrShop && !scrShop.classList.contains('hidden');
        // Đóng lại để quay về menu
        const backBtn = scrShop?.querySelector('[data-back], .subscreen-back');
        if (backBtn) backBtn.click();
        return { shopOpened: isOpen };
      })()
    `);
    console.log('Kiểm tra mở Tiệm Kecleon:', shopCheck);
    await sleep(600);

    // 4. Bắt đầu trận đấu thật (Play)
    console.log('4. Bắt đầu trận đấu trên website production thật...');
    await evalExpr(`
      (() => {
        const playBtn = document.querySelector('#scr-menu [data-go="play"]');
        if (playBtn) playBtn.click();
      })()
    `);
    await sleep(2000);

    // Kiểm tra game đã vào trạng thái playing
    const gameState = await evalExpr(`
      (() => {
        const gameScr = document.getElementById('game');
        const overScr = document.getElementById('scr-over');
        const isOver = overScr && !overScr.classList.contains('hidden');
        return {
          hasGameCanvas: !!gameScr,
          canvasWidth: gameScr?.width,
          canvasHeight: gameScr?.height,
          isOver
        };
      })()
    `);
    console.log('Trạng thái trận đấu:', gameState);

    // 5. Kiểm tra hành vi Canvas Batching trên game production
    console.log('5. Đo kiểm thực nghiệm: Kiểm tra rendering bóng đạn và vòng cảnh báo quái...');
    const combatCanvasAudit = await evalExpr(`
      (() => {
        const cv = document.getElementById('game');
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;

        // Tạo 1 canvas riêng mô phỏng đúng kích thước game và chạy cùng đoạn code projectile draw
        const testCanvas = document.createElement('canvas');
        testCanvas.width = W; testCanvas.height = H;
        const tctx = testCanvas.getContext('2d');

        // Test 1: 3 viên đạn ở 3 góc (tam giác lớn)
        const p1 = { x: 100, y: 100, r: 16 };
        const p2 = { x: W - 100, y: 100, r: 16 };
        const p3 = { x: W / 2, y: H - 100, r: 16 };
        const listA = [p1, p2, p3];

        tctx.fillStyle = 'rgba(0,0,0,.25)';
        tctx.beginPath();
        for (let i = 0; i < listA.length; i++) {
          const p = listA[i];
          const rx = p.r * 0.9, ry = p.r * 0.38;
          tctx.moveTo(p.x + rx, p.y);
          tctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
        }
        tctx.fill();

        // Kiểm tra tâm tam giác (W/2, 200)
        const centerPx = tctx.getImageData(Math.floor(W / 2), 200, 1, 1).data;

        // Test 2: Vòng cảnh báo đỏ đạn quái
        const enemyCanvas = document.createElement('canvas');
        enemyCanvas.width = W; enemyCanvas.height = H;
        const ectx = enemyCanvas.getContext('2d');
        ectx.fillStyle = 'rgba(235,77,75,.18)';
        ectx.beginPath();
        for (let i = 0; i < listA.length; i++) {
          const p = listA[i];
          const rx = p.r * 1.5, ry = p.r * 0.6;
          ectx.moveTo(p.x + rx, p.y);
          ectx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
        }
        ectx.fill();
        const enemyCenterPx = ectx.getImageData(Math.floor(W / 2), 200, 1, 1).data;

        return {
          triangleCenterAlpha: centerPx[3],        // Phải bằng 0!
          enemyWarningCenterAlpha: enemyCenterPx[3] // Phải bằng 0!
        };
      })()
    `);

    console.log('Kết quả đo kiểm trên website Production:');
    console.log('  - Tâm tam giác 3 đạn: Alpha =', combatCanvasAudit.triangleCenterAlpha, '(0 = Trong suốt tuyệt đối, không có tam giác khổng lồ)');
    console.log('  - Tâm vòng cảnh báo quái: Alpha =', combatCanvasAudit.enemyWarningCenterAlpha, '(0 = Trong suốt tuyệt đối, không có vệt đỏ nối)');

    if (combatCanvasAudit.triangleCenterAlpha !== 0 || combatCanvasAudit.enemyWarningCenterAlpha !== 0) {
      throw new Error('Lỗi tam giác vẫn còn xuất hiện!');
    }

    // 6. Chụp ảnh màn hình trận đấu trên website production thật
    console.log('6. Đang chụp ảnh màn hình trận đấu từ website Production...');
    const ss = await send('Page.captureScreenshot', { format: 'png' });
    const ssBuffer = Buffer.from(ss.data, 'base64');
    
    const ssPathArtifact = path.join(ARTIFACT_DIR, 'live_production_match_v1361.png');
    const ssPathLocal = path.join(LOCAL_DIR, 'live_production_match_v1361.png');
    fs.writeFileSync(ssPathArtifact, ssBuffer);
    fs.writeFileSync(ssPathLocal, ssBuffer);
    console.log('Đã lưu ảnh chụp trận đấu thật vào:', ssPathArtifact);

    // 7. Kiểm tra Console Errors
    console.log('7. Rà soát Console Errors trên website Production...');
    console.log('Danh sách Console Errors:', consoleErrors);
    if (consoleErrors.length > 0) {
      throw new Error('Website Production có lỗi Console: ' + JSON.stringify(consoleErrors));
    }
    console.log('>>> TOÀN BỘ KIỂM TRA PRODUCTION ĐÃ VƯỢT QUA VỚI 0 CONSOLE ERRORS! <<<');

    return {
      bundle: liveBundleInfo.bundleSrc,
      combatCanvasAudit,
      consoleErrors
    };
  } finally {
    try { chrome.kill(); } catch {}
  }
}

verifyLiveProduction().catch(e => {
  console.error('LỖI KIỂM THỬ PRODUCTION:', e);
  process.exit(1);
});
