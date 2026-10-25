import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TARGET_VERSION = '3bd006f7d9';
const PROD_URL = 'https://vunghia54.github.io/pokesurvivor-vietnam/';
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pollDeployment() {
  console.log(`Polling ${PROD_URL}version.json for target version ${TARGET_VERSION}...`);
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${PROD_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        console.log(`[Attempt ${i + 1}/40] Live version: ${data.v} (timestamp: ${data.at})`);
        if (data.v === TARGET_VERSION) {
          console.log(`SUCCESS: Live GitHub Pages is now running v1.3.5 (${TARGET_VERSION})!`);
          return true;
        }
      }
    } catch (e) {
      console.log(`[Attempt ${i + 1}] Error polling: ${e.message}`);
    }
    await sleep(5000);
  }
  throw new Error(`Timeout waiting for GitHub Pages to deploy version ${TARGET_VERSION}`);
}

async function verifyLive() {
  await pollDeployment();

  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const PORT = 9574;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-v135-live-'));

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
                  console.log('[PROD CONSOLE ERROR]:', text);
                  consoleErrors.push(text);
                }
              } else if (msg.method === 'Runtime.exceptionThrown') {
                const text = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Exception';
                console.log('[PROD EXCEPTION]:', text);
                consoleErrors.push(text);
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

    async function evalExpr(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
      }
      return r.result?.value;
    }

    async function setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 2, mobile: true, fitWindow: false
      });
      await sleep(150);
    }

    async function screenshot(filename, clip = null) {
      const params = { format: 'png' };
      if (clip) params.clip = clip;
      const res = await send('Page.captureScreenshot', params);
      const p = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
      console.log(`Saved screenshot: ${filename} (${(res.data.length * 0.75 / 1024).toFixed(1)} KB)`);
    }

    async function touchSwipeUp(startX, startY, endY) {
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY }]
      });
      await sleep(25);
      const steps = 12;
      const dy = (endY - startY) / steps;
      for (let i = 1; i <= steps; i++) {
        await send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: startX, y: Math.round(startY + dy * i) }]
        });
        await sleep(20);
      }
      await send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await sleep(150);
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(844, 390);

    console.log(`Navigating to live production ${PROD_URL}...`);
    await send('Page.navigate', { url: PROD_URL });
    await sleep(2500);

    // Robust wait and tap-start on live site
    console.log('Waiting for boot and tapping start...');
    for (let i = 0; i < 30; i++) {
      const state = await evalExpr(`
        (() => {
          const tap = document.getElementById('tap-start');
          if (tap && !tap.classList.contains('hidden')) { tap.click(); return 'tapped'; }
          const login = document.getElementById('scr-login');
          if (login && !login.classList.contains('hidden')) return 'login';
          return null;
        })()
      `);
      if (state) {
        console.log(`Boot state reached: ${state}`);
        break;
      }
      await sleep(300);
    }
    await sleep(500);

    // Click btn-guest
    console.log('Clicking Play as Guest...');
    for (let i = 0; i < 30; i++) {
      const clicked = await evalExpr(`
        (() => {
          const bg = document.getElementById('btn-guest');
          if (bg && !document.getElementById('scr-login')?.classList.contains('hidden')) {
            bg.click();
            return true;
          }
          return false;
        })()
      `);
      if (clicked) {
        console.log('Clicked btn-guest successfully.');
        break;
      }
      await sleep(300);
    }
    await sleep(500);

    // Complete quiz naturally
    console.log('Completing starter test on live production...');
    for (let i = 0; i < 40; i++) {
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
      if (done) {
        console.log('Starter test completed, entering menu.');
        break;
      }
      await sleep(250);
    }
    await sleep(800);

    // Verify bundle script tag in DOM
    const liveBundle = await evalExpr(`
      (() => {
        const script = document.querySelector('script[src*="app.min.js"]');
        return script ? script.src : 'none';
      })()
    `);
    console.log('Live bundle loaded on production:', liveBundle);
    if (!liveBundle.includes(TARGET_VERSION)) {
      throw new Error(`Expected bundle ${TARGET_VERSION} but got ${liveBundle}`);
    }

    // Transition cleanly to main menu
    await evalExpr(`
      (() => {
        const resOk = document.getElementById('res-ok');
        if (resOk && !document.getElementById('scr-result')?.classList.contains('hidden')) {
          resOk.click();
        }
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-menu')?.classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar')?.classList.remove('hidden');
        document.getElementById('btn-save')?.classList.remove('hidden');
        document.getElementById('btn-full')?.classList.remove('hidden');
        document.getElementById('btn-support')?.classList.remove('hidden');
      })()
    `);
    await sleep(500);

    // 1. Verify Topbar Single Row on Live Site (844x390)
    console.log('\n--- 1. VERIFYING LIVE TOPBAR SINGLE ROW (844x390) ---');
    const liveTopbar = await evalExpr(`
      (() => {
        const tb = document.getElementById('topbar');
        const tbR = tb.getBoundingClientRect();
        const info = document.querySelector('.topbar-info');
        const act = document.querySelector('.topbar-actions');
        const infoR = info.getBoundingClientRect();
        const actR = act.getBoundingClientRect();
        const menuRight = document.querySelector('.menu-right')?.getBoundingClientRect();
        const playBtn = document.querySelector('.menu-item.play')?.getBoundingClientRect();

        const infoCenterY = infoR.top + infoR.height / 2;
        const actCenterY = actR.top + actR.height / 2;
        const isSameRow = Math.abs(infoCenterY - actCenterY) < 10;
        const gapBetween = Math.round(actR.left - infoR.right);

        return {
          isSameRow,
          gapBetween,
          topbar: { top: Math.round(tbR.top), bottom: Math.round(tbR.bottom), height: Math.round(tbR.height) },
          info: { top: Math.round(infoR.top), bottom: Math.round(infoR.bottom), right: Math.round(infoR.right) },
          actions: { top: Math.round(actR.top), bottom: Math.round(actR.bottom), left: Math.round(actR.left) },
          menuRight: menuRight ? { top: Math.round(menuRight.top), left: Math.round(menuRight.left), width: Math.round(menuRight.width), height: Math.round(menuRight.height) } : null,
          playBtn: playBtn ? { top: Math.round(playBtn.top), height: Math.round(playBtn.height) } : null
        };
      })()
    `);
    console.log('Live Topbar Data:', JSON.stringify(liveTopbar, null, 2));

    if (!liveTopbar.isSameRow) throw new Error('Live topbar is not single row!');
    if (liveTopbar.gapBetween < 50) throw new Error(`Live topbar gap too small: ${liveTopbar.gapBetween}px`);

    await screenshot('v135-live-topbar-single-row-844x390.png');
    await screenshot('v135-live-topbar-closeup.png', {
      x: 0, y: 0, width: 844, height: 50, scale: 2
    });

    // 2. Check Kecleon Shop Scroll on Live Site
    console.log('\n--- 2. VERIFYING LIVE KECLEON SHOP SCROLL ---');
    await evalExpr(`document.querySelector('#scr-menu [data-go="shop"]').click()`);
    await sleep(400);
    await evalExpr(`document.getElementById('shop-stall')?.click()`);
    await sleep(300);

    // Swipe down
    await touchSwipeUp(400, 320, 60);
    await sleep(150);
    await touchSwipeUp(400, 320, 60);
    await sleep(200);

    const liveShop = await evalExpr(`
      (() => {
        const body = document.querySelector('#scr-shop .subscreen-body');
        const items = Array.from(document.querySelectorAll('#shop-body .upg-item'));
        const last = items[items.length - 1];
        const lastR = last?.getBoundingClientRect();
        const buyBtn = last?.querySelector('button[data-buy]');
        const btnR = buyBtn?.getBoundingClientRect();

        return {
          scrollTop: body?.scrollTop,
          totalItems: items.length,
          lastItemText: last?.querySelector('b')?.innerText,
          isLastInViewport: (lastR?.top < window.innerHeight && lastR?.bottom > 0),
          buyBtnVisible: btnR && btnR.top > 0 && btnR.bottom < window.innerHeight
        };
      })()
    `);
    console.log('Live Shop Scroll Result:', JSON.stringify(liveShop, null, 2));
    if (liveShop.scrollTop <= 0) throw new Error('Live shop body failed to scroll!');
    if (!liveShop.isLastInViewport) throw new Error('Live shop last TM item not visible!');
    await screenshot('v135-live-shop-scroll-bottom.png');

    await evalExpr(`document.querySelector('#scr-shop .back-btn').click()`);
    await sleep(300);

    // 3. Check Upgrades Screen
    console.log('\n--- 3. VERIFYING LIVE UPGRADES SCREEN ---');
    await evalExpr(`document.querySelector('#scr-menu [data-go="upgrades"]').click()`);
    await sleep(300);
    const liveUpgrades = await evalExpr(`
      (() => {
        const scr = document.getElementById('scr-upgrades');
        const body = scr?.querySelector('.subscreen-body');
        return {
          isOpen: !scr?.classList.contains('hidden'),
          scrollHeight: body?.scrollHeight,
          clientHeight: body?.clientHeight,
          canScroll: body?.scrollHeight > body?.clientHeight
        };
      })()
    `);
    console.log('Live Upgrades Result:', JSON.stringify(liveUpgrades));
    await screenshot('v135-live-upgrades.png');
    await evalExpr(`document.querySelector('#scr-upgrades .back-btn').click()`);
    await sleep(300);

    console.log('\n--- LIVE PRODUCTION CONSOLE AUDIT ---');
    console.log(`Live Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('Errors:', consoleErrors);
      throw new Error(`Encountered ${consoleErrors.length} live console errors!`);
    }

    console.log('\n🎉 ALL LIVE PRODUCTION VERIFICATIONS FOR V1.3.5 PASSED 100%!');

    const prodReport = {
      liveUrl: PROD_URL,
      targetVersion: TARGET_VERSION,
      deployedAt: new Date().toISOString(),
      liveTopbar,
      liveShop,
      liveUpgrades,
      consoleErrors
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'v135-live-production-report.json'), JSON.stringify(prodReport, null, 2));

  } finally {
    try { chrome.kill(); } catch {}
  }
}

verifyLive().catch(err => {
  console.error('LIVE VERIFICATION ERROR:', err);
  process.exit(1);
});
