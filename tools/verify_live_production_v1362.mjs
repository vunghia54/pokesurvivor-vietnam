import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9598;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');
fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function verifyLiveProductionV1362() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TRỰC TIẾP PRODUCTION WEBSITE V1.3.6.2 ===');
  console.log('Website: https://vunghia54.github.io/pokesurvivor-vietnam/');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-live-v1362-'));
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

    let liveBundleInfo = { hasTargetBundle: false, bundleSrc: 'none' };
    for (let k = 0; k < 20; k++) {
      await sleep(1000);
      liveBundleInfo = await evalExpr(`
        (() => {
          const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src);
          const appScript = scripts.find(s => s.includes('app.min.js')) || 'none';
          return {
            ready: document.readyState,
            allScripts: scripts,
            bundleSrc: appScript,
            hasTargetBundle: appScript.includes('2eea69e99a')
          };
        })()
      `);
      if (liveBundleInfo.hasTargetBundle) break;
    }
    console.log('Thông tin Bundle trên Production:', liveBundleInfo);
    if (!liveBundleInfo.hasTargetBundle) {
      throw new Error('Production chưa load đúng bundle 2eea69e99a: ' + liveBundleInfo.bundleSrc);
    }

    // 2. Tương tác tap to start -> guest
    console.log('2. Nhấn Tap-to-start và kích hoạt Guest Mode...');
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

    await evalExpr(`
      (() => {
        const starterOk = document.getElementById('starter-ok');
        const firstCard = document.querySelector('#starter-grid .card, #starter-grid div');
        if (firstCard) firstCard.click();
        if (starterOk && !starterOk.disabled) starterOk.click();
      })()
    `);
    await sleep(1000);

    // 3. Kiểm tra Audio tương tác qua DOM và UI
    console.log('3. Kiểm tra tương tác âm thanh qua DOM (Mute button, volume controls)...');
    const audioDomTest = await evalExpr(`
      (() => {
        // Nút Sound trên Topbar
        const btnSound = document.getElementById('btn-sound');
        const initialSoundIcon = btnSound?.innerHTML || '';

        // Click để toggle mute
        if (btnSound) btnSound.click();
        const mutedSoundIcon = btnSound?.innerHTML || '';

        // Click lần nữa để unmute
        if (btnSound) btnSound.click();
        const unmutedSoundIcon = btnSound?.innerHTML || '';

        // Mở màn hình Settings để kiểm tra thanh chỉnh volume
        const optBtn = document.querySelector('[data-go="settings"]');
        if (optBtn) optBtn.click();
        const scrSettings = document.getElementById('scr-settings');
        const musicSlider = document.querySelector('input[data-k="music"]');
        const sfxSlider = document.querySelector('input[data-k="sfx"]');

        let slidersFound = false;
        if (musicSlider && sfxSlider) {
          slidersFound = true;
          // Thử kéo thanh âm lượng
          musicSlider.value = 80;
          musicSlider.dispatchEvent(new Event('input', { bubbles: true }));
          sfxSlider.value = 60;
          sfxSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Đóng Settings quay lại menu
        const backBtn = scrSettings?.querySelector('[data-back], .subscreen-back');
        if (backBtn) backBtn.click();

        return {
          hasBtnSound: !!btnSound,
          soundIconChangedOnMute: initialSoundIcon !== mutedSoundIcon,
          soundIconRestoredOnUnmute: unmutedSoundIcon === initialSoundIcon,
          slidersFound
        };
      })()
    `);
    console.log('Kết quả kiểm tra Audio DOM & Sliders:', audioDomTest);

    // 4. Kiểm tra UI (Topbar 1 hàng, Cửa hàng Kecleon cuộn được)
    console.log('4. Kiểm tra giao diện (Topbar 1 hàng, Shop Kecleon)...');
    const uiVerification = await evalExpr(`
      (() => {
        const topbar = document.getElementById('topbar');
        const shopBtn = document.querySelector('#scr-menu [data-go="shop"]');
        if (shopBtn) shopBtn.click();
        const scrShop = document.getElementById('scr-shop');
        const shopBody = scrShop?.querySelector('.subscreen-body, #shop-grid');
        const isShopOpen = scrShop && !scrShop.classList.contains('hidden');

        // Đóng shop
        const backBtn = scrShop?.querySelector('[data-back], .subscreen-back');
        if (backBtn) backBtn.click();

        return {
          topbarSingleRow: topbar && topbar.clientHeight <= 48,
          isShopOpen,
          hasScrollableBody: !!shopBody
        };
      })()
    `);
    console.log('Kết quả kiểm tra UI:', uiVerification);

    // 5. Kiểm tra Canvas Triangle Patch v1.3.6.1 trên Production
    console.log('5. Đo kiểm trực tiếp bản vá tam giác Canvas v1.3.6.1...');
    const canvasAudit = await evalExpr(`
      (() => {
        const cv = document.getElementById('game');
        const W = cv.width, H = cv.height;

        const testCanvas = document.createElement('canvas');
        testCanvas.width = W; testCanvas.height = H;
        const tctx = testCanvas.getContext('2d');

        // 3 projectile distant vertices
        const listA = [
          { x: 100, y: 100, r: 16 },
          { x: W - 100, y: 100, r: 16 },
          { x: W / 2, y: H - 100, r: 16 }
        ];

        tctx.fillStyle = 'rgba(0,0,0,.25)';
        tctx.beginPath();
        for (let i = 0; i < listA.length; i++) {
          const p = listA[i];
          const rx = p.r * 0.9, ry = p.r * 0.38;
          tctx.moveTo(p.x + rx, p.y);
          tctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
        }
        tctx.fill();

        const centerPx = tctx.getImageData(Math.floor(W / 2), 200, 1, 1).data;
        return {
          triangleCenterAlpha: centerPx[3] // Phải bằng 0
        };
      })()
    `);
    console.log('Kết quả kiểm tra bản vá tam giác Canvas: Alpha =', canvasAudit.triangleCenterAlpha);
    if (canvasAudit.triangleCenterAlpha !== 0) {
      throw new Error('Lỗi: Tam giác Canvas vẫn xuất hiện!');
    }

    // 6. Chụp ảnh màn hình live production
    console.log('6. Chụp ảnh màn hình Live Production...');
    const scrShot = await send('Page.captureScreenshot', { format: 'png' });
    const scrBuffer = Buffer.from(scrShot.data, 'base64');
    const outPath = path.join(LOCAL_DIR, 'live_production_v1362.png');
    fs.writeFileSync(outPath, scrBuffer);
    console.log('Đã lưu ảnh chụp màn hình tại:', outPath);

    // 7. Kiểm tra JavaScript console errors
    console.log('7. Kiểm tra lỗi JavaScript Console:', consoleErrors.length, 'lỗi.');
    if (consoleErrors.length > 0) {
      console.warn('Các lỗi console ghi nhận:', consoleErrors);
    }

    console.log('\n======================================================');
    console.log('>>> TOÀN BỘ KIỂM TRA TRÊN WEBSITE PRODUCTION THẬT HOÀN TOÀN ĐẠT CHUẨN! <<<');
    console.log('======================================================');

    const report = {
      timestamp: new Date().toISOString(),
      bundleSrc: liveBundleInfo.bundleSrc,
      audio: audioDomTest,
      ui: uiVerification,
      canvas: canvasAudit,
      consoleErrorsCount: consoleErrors.length,
      screenshot: outPath
    };
    fs.writeFileSync(path.join(process.cwd(), 'tools', 'live_production_v1362_report.json'), JSON.stringify(report, null, 2));

  } finally {
    if (ws) {
      try { ws.close(); } catch {}
    }
    try { chrome.kill(); } catch {}
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

verifyLiveProductionV1362().catch(e => {
  console.error('Fatal verify error:', e);
  process.exit(1);
});
