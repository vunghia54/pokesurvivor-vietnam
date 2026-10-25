import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TARGET_VERSION = 'f3ef37e126';
const PROD_URL = 'https://vunghia54.github.io/pokesurvivor-vietnam/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function verifyLive() {
  console.log(`\n=================== BẮT ĐẦU KIỂM ĐỊNH WEBSITE PRODUCTION V1.3.6 ===================`);
  console.log(`URL: ${PROD_URL}`);
  console.log(`Target Version: ${TARGET_VERSION}`);

  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const PORT = 9596;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-v136-prod-'));

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
      width: 844, height: 390, deviceScaleFactor: 2, mobile: true, fitWindow: false
    });

    console.log('1. Tải website live production...');
    await send('Page.navigate', { url: PROD_URL });
    await sleep(3500);

    // Kiểm tra bundle version thực tế trong DOM
    const liveBundle = await evalExpr(`
      (() => {
        const script = document.querySelector('script[src*="app.min.js"]');
        return script ? script.src : 'none';
      })()
    `);
    console.log('   Live Bundle Script URL:', liveBundle);
    if (!liveBundle.includes(TARGET_VERSION)) {
      throw new Error(`Phiên bản bundle không khớp! Cần: ${TARGET_VERSION}, Nhận được: ${liveBundle}`);
    }

    // Kích hoạt tap-start và vào chế độ khách
    console.log('2. Nhấn Bắt đầu & Chơi với tư cách khách...');
    for (let i = 0; i < 20; i++) {
      const tapped = await evalExpr(`
        (() => {
          const tap = document.getElementById('tap-start');
          if (tap && !tap.classList.contains('hidden')) { tap.click(); return 'tapped'; }
          const bg = document.getElementById('btn-guest');
          if (bg && !document.getElementById('scr-login')?.classList.contains('hidden')) { bg.click(); return 'guest'; }
          return null;
        })()
      `);
      if (tapped === 'guest') break;
      await sleep(300);
    }
    await sleep(600);

    // Hoàn thành trắc nghiệm để vào menu chính
    console.log('3. Trả lời trắc nghiệm & mở Menu chính...');
    for (let i = 0; i < 30; i++) {
      const done = await evalExpr(`
        (() => {
          const ans = document.querySelector('#test-a .answer');
          if (ans) { ans.click(); return false; }
          const resOk = document.getElementById('res-ok');
          if (resOk && !document.getElementById('scr-result')?.classList.contains('hidden')) {
            resOk.click();
            return true;
          }
          const menu = document.getElementById('scr-menu');
          if (menu && !menu.classList.contains('hidden')) return true;
          return false;
        })()
      `);
      if (done) break;
      await sleep(250);
    }
    await sleep(800);

    // Chuyển về Menu nếu còn modal kết quả
    await evalExpr(`
      (() => {
        const resOk = document.getElementById('res-ok');
        if (resOk && !document.getElementById('scr-result')?.classList.contains('hidden')) resOk.click();
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-menu')?.classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar')?.classList.remove('hidden');
      })()
    `);
    await sleep(500);

    // 4. Kiểm tra Topbar Mobile Landscape (844x390)
    console.log('4. Kiểm tra Topbar Mobile Landscape (844x390)...');
    const topbarCheck = await evalExpr(`
      (() => {
        const tb = document.getElementById('topbar');
        const tbR = tb.getBoundingClientRect();
        const info = document.querySelector('.topbar-info');
        const act = document.querySelector('.topbar-actions');
        const infoR = info.getBoundingClientRect();
        const actR = act.getBoundingClientRect();
        const isSameRow = Math.abs((infoR.top + infoR.height/2) - (actR.top + actR.height/2)) < 10;
        const gap = Math.round(actR.left - infoR.right);
        const onlinePill = document.getElementById('online-pill');

        return {
          topbarVisible: !tb.classList.contains('hidden'),
          topbarHeight: Math.round(tbR.height),
          isSameRow,
          gapBetween: gap,
          onlinePillText: onlinePill ? onlinePill.textContent.trim() : 'none',
          bodyNoOverflow: document.body.scrollWidth <= document.body.clientWidth + 1
        };
      })()
    `);
    console.log('   Topbar Check:', topbarCheck);

    // 5. Kiểm tra Cửa hàng Kecleon
    console.log('5. Kiểm tra Cửa hàng Kecleon cuộn...');
    await evalExpr(`document.querySelector('#scr-menu [data-go="shop"]')?.click()`);
    await sleep(400);
    await evalExpr(`document.getElementById('shop-stall')?.click()`);
    await sleep(400);

    const shopCheck = await evalExpr(`
      (() => {
        const body = document.querySelector('#scr-shop .subscreen-body');
        const items = Array.from(document.querySelectorAll('#shop-body .upg-item'));
        return {
          shopVisible: !document.getElementById('scr-shop')?.classList.contains('hidden'),
          bodyExists: !!body,
          bodyScrollHeight: body ? body.scrollHeight : 0,
          bodyClientHeight: body ? body.clientHeight : 0,
          isScrollable: body ? body.scrollHeight > body.clientHeight : false,
          itemsCount: items.length
        };
      })()
    `);
    console.log('   Shop Kecleon Check:', shopCheck);

    // Nhấn nút quay lại
    await evalExpr(`document.querySelector('#scr-shop .back-btn')?.click()`);
    await sleep(400);

    // 6. Kiểm tra Nâng cấp và Gacha
    console.log('6. Kiểm tra Màn hình Nâng cấp & Gacha...');
    await evalExpr(`document.querySelector('#scr-menu [data-go="upgrades"]')?.click()`);
    await sleep(400);
    const upgCheck = await evalExpr(`!document.getElementById('scr-upgrades')?.classList.contains('hidden')`);
    await evalExpr(`document.querySelector('#scr-upgrades .back-btn')?.click()`);
    await sleep(300);

    await evalExpr(`document.querySelector('#scr-menu [data-go="gacha"]')?.click()`);
    await sleep(400);
    const gachaCheck = await evalExpr(`!document.getElementById('scr-gacha')?.classList.contains('hidden')`);
    await evalExpr(`document.querySelector('#scr-gacha .back-btn')?.click()`);
    await sleep(300);
    console.log(`   Nâng cấp mở được: ${upgCheck}, Gacha mở được: ${gachaCheck}`);

    // 7. Kiểm tra Audio Controls & Sound Panel (Bật mở bảng điều khiển âm thanh trên Topbar)
    console.log('7. Kiểm tra Sound Panel qua nút #btn-sound trên Topbar...');
    await evalExpr(`document.getElementById('btn-sound')?.click()`);
    await sleep(400);

    const soundPanelCheck = await evalExpr(`
      (() => {
        const p = document.getElementById('sound-panel');
        const isOpen = p && !p.classList.contains('hidden');
        const sliders = p ? p.querySelectorAll('input[type="range"]') : [];
        const muteBtn = p ? p.querySelector('button') : null;
        return {
          soundPanelOpen: isOpen,
          slidersCount: sliders.length,
          hasMuteButton: !!muteBtn,
          panelHtml: p ? p.innerHTML.length : 0
        };
      })()
    `);
    console.log('   Sound Panel Check:', soundPanelCheck);

    // Đóng sound panel
    await evalExpr(`document.getElementById('btn-sound')?.click()`);
    await sleep(300);

    // 8. Kiểm tra Console Errors trên Live Production
    console.log('8. Kiểm tra Lỗi Console trên Live Production...');
    console.log('   Console Errors:', consoleErrors);

    const passed = (
      liveBundle.includes(TARGET_VERSION) &&
      topbarCheck.isSameRow &&
      shopCheck.isScrollable &&
      upgCheck &&
      gachaCheck &&
      soundPanelCheck.soundPanelOpen &&
      consoleErrors.length === 0
    );

    const finalReport = {
      timestamp: new Date().toISOString(),
      url: PROD_URL,
      targetVersion: TARGET_VERSION,
      liveBundle,
      topbarCheck,
      shopCheck,
      upgCheck,
      gachaCheck,
      soundPanelCheck,
      consoleErrors,
      status: passed ? 'PASSED_ALL' : 'FAILED'
    };

    fs.writeFileSync('tools/live_production_v136_report.json', JSON.stringify(finalReport, null, 2));
    console.log('\n=================== KẾT QUẢ KIỂM ĐỊNH LIVE: ' + finalReport.status + ' ===================');
    return finalReport;
  } finally {
    try { chrome.kill(); } catch {}
  }
}

verifyLive().catch(e => {
  console.error('Lỗi kiểm định live production:', e);
  process.exit(1);
});
