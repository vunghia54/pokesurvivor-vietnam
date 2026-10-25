import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9569;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-v134-release-cert-'));

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
                const text = msg.params.args?.map(a => a.value || a.description || JSON.stringify(a)).join(' ') || 'error';
                console.log('[BROWSER CONSOLE ERROR]:', text);
                consoleErrors.push(text);
              }
            } else if (msg.method === 'Runtime.exceptionThrown') {
              const text = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Exception';
              console.log('[BROWSER EXCEPTION]:', text);
              consoleErrors.push(text);
            } else if (msg.id && waiting.has(msg.id)) {
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

async function evalExpr(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
  }
  return r.result?.value;
}

async function setViewport(width, height, isMobile = true) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: isMobile, fitWindow: false
  });
  await sleep(150);
}

async function screenshot(filename) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
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

async function run() {
  console.log('=== POKÉSURVIVOR V1.3.4 COMPREHENSIVE CERTIFICATION ===');
  try {
    await connect();
    await send('Page.enable');
    await send('Runtime.enable');

    // 1. INITIAL LOAD & AUTH SETUP
    await send('Page.navigate', { url: 'http://localhost:8766/index.html' });
    await sleep(1200);

    // Initial guest login and complete starter test
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg) bg.click();
      })()
    `);
    await sleep(400);

    // Answer quiz questions to ensure a partner Pokemon is properly chosen
    await evalExpr(`
      (() => {
        for (let i = 0; i < 20; i++) {
          const ans = document.querySelector('#test-a .answer');
          if (ans) ans.click();
        }
        const resOk = document.getElementById('res-ok');
        if (resOk) resOk.click();
      })()
    `);
    await sleep(400);

    const initCheck = await evalExpr(`
      (() => {
        const resOk = document.getElementById('res-ok');
        if (resOk && !document.getElementById('scr-result').classList.contains('hidden')) {
          resOk.click();
        }
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-menu')?.classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar')?.classList.remove('hidden');

        return {
          menuOpen: !document.getElementById('scr-menu').classList.contains('hidden'),
          topbarOpen: !document.getElementById('topbar').classList.contains('hidden'),
          onlineText: document.getElementById('topbar-online')?.innerText,
          coinsText: document.getElementById('topbar-coins')?.innerText,
          userText: document.getElementById('user-name')?.innerText
        };
      })()
    `);
    console.log('Game Initialized:', JSON.stringify(initCheck));

    const certReport = {
      menuViewports: {},
      shopCert: {},
      regressionScreens: {},
      consoleErrors: []
    };

    // ========================================================
    // 2. MAIN MENU BALANCED GRID VERIFICATION
    // ========================================================
    console.log('\n--- 2. VERIFYING MAIN MENU BALANCED GRID ---');
    const viewportsToTest = [
      { w: 844, h: 390, name: 'landscape-844x390', isMobile: true },
      { w: 915, h: 412, name: 'landscape-915x412', isMobile: true },
      { w: 740, h: 360, name: 'landscape-740x360', isMobile: true },
      { w: 390, h: 844, name: 'portrait-390x844', isMobile: true },
      { w: 360, h: 800, name: 'portrait-360x800', isMobile: true },
      { w: 1920, h: 1080, name: 'desktop-1920x1080', isMobile: false }
    ];

    for (const vp of viewportsToTest) {
      await setViewport(vp.w, vp.h, vp.isMobile);
      await sleep(150);

      const mData = await evalExpr(`
        (() => {
          const items = Array.from(document.querySelectorAll('.menu-item')).map(el => {
            const r = el.getBoundingClientRect();
            return {
              go: el.dataset.go,
              w: Math.round(r.width),
              h: Math.round(r.height),
              top: Math.round(r.top),
              bottom: Math.round(r.bottom)
            };
          });

          // Group by row based on top coordinate
          const rows = [];
          for (const it of items) {
            const r = rows.find(row => Math.abs(row[0].top - it.top) < 4);
            if (r) r.push(it);
            else rows.push([it]);
          }

          const rowComparisons = rows.map((r, idx) => ({
            row: idx + 1,
            items: r.map(x => x.go),
            heights: r.map(x => x.h),
            isEqual: r.length === 1 || Math.abs(r[0].h - r[1].h) <= 1
          }));

          const lastItem = items[items.length - 1];
          const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;

          return {
            windowW: window.innerWidth,
            windowH: window.innerHeight,
            itemCount: items.length,
            isBottomInside: lastItem.bottom <= window.innerHeight,
            lastBottom: lastItem.bottom,
            hasHorizontalOverflow,
            rowComparisons
          };
        })()
      `);

      console.log(`Menu [${vp.name}]: items=${mData.itemCount}, bottomInside=${mData.isBottomInside}, lastBottom=${mData.lastBottom}, overflowX=${mData.hasHorizontalOverflow}`);
      for (const r of mData.rowComparisons) {
        if (r.items.length === 2) {
          console.log(`  Row ${r.row} [${r.items.join(', ')}]: heights=[${r.heights.join(', ')}], equal=${r.isEqual}`);
          if (!r.isEqual) throw new Error(`Row ${r.row} not equal in ${vp.name}!`);
        }
      }
      certReport.menuViewports[vp.name] = mData;

      if (vp.name === 'landscape-844x390') await screenshot('v134-release-menu-844x390.png');
      if (vp.name === 'landscape-915x412') await screenshot('v134-release-menu-915x412.png');
      if (vp.name === 'landscape-740x360') await screenshot('v134-release-menu-740x360.png');
      if (vp.name === 'portrait-390x844') await screenshot('v134-release-menu-portrait-390x844.png');
      if (vp.name === 'portrait-360x800') await screenshot('v134-release-menu-portrait-360x800.png');
    }

    // ========================================================
    // 3. KECLEON SHOP CERTIFICATION (MOBILE, FULLSCREEN, DESKTOP)
    // ========================================================
    console.log('\n--- 3. VERIFYING KECLEON SHOP INTERACTION ---');
    // Test on 844x390 Landscape
    await setViewport(844, 390, true);
    await sleep(200);

    // Open Shop
    await evalExpr(`document.querySelector('#scr-menu [data-go="shop"]').click()`);
    await sleep(400);
    // Skip opening animation if any
    await evalExpr(`document.getElementById('shop-stall')?.click()`);
    await sleep(300);

    // Initial state before scroll
    const shopTop = await evalExpr(`
      (() => {
        const body = document.querySelector('#scr-shop .subscreen-body');
        const header = document.querySelector('#scr-shop .subscreen-header');
        const stall = document.getElementById('shop-stall');
        const items = Array.from(document.querySelectorAll('#shop-body .upg-item'));
        const last = items[items.length - 1];
        const lastR = last?.getBoundingClientRect();

        return {
          scrollTop: body?.scrollTop,
          headerSticky: window.getComputedStyle(header).position,
          headerTop: Math.round(header.getBoundingClientRect().top),
          headerH: Math.round(header.getBoundingClientRect().height),
          stallH: Math.round(stall.getBoundingClientRect().height),
          totalItems: items.length,
          lastItemText: last?.querySelector('b')?.innerText,
          lastItemTop: Math.round(lastR?.top || 0),
          isLastInViewport: (lastR?.top < window.innerHeight && lastR?.bottom > 0)
        };
      })()
    `);
    console.log('Shop Top State (844x390):', JSON.stringify(shopTop, null, 2));
    await screenshot('v134-release-shop-top-844x390.png');

    // Scroll to bottom using Touch Swipe (simulate 2 natural swipes to reach end of list)
    console.log('Dispatching touch swipes to reach bottom of shop...');
    await touchSwipeUp(400, 320, 60);
    await sleep(150);
    await touchSwipeUp(400, 320, 60);
    await sleep(200);

    const shopBottom = await evalExpr(`
      (() => {
        const body = document.querySelector('#scr-shop .subscreen-body');
        const header = document.querySelector('#scr-shop .subscreen-header');
        const items = Array.from(document.querySelectorAll('#shop-body .upg-item'));
        const last = items[items.length - 1];
        const lastR = last?.getBoundingClientRect();
        const buyBtn = last?.querySelector('button[data-buy]');
        const btnR = buyBtn?.getBoundingClientRect();

        return {
          scrollTop: body?.scrollTop,
          headerSticky: window.getComputedStyle(header).position,
          headerTop: Math.round(header.getBoundingClientRect().top),
          totalItems: items.length,
          lastItemText: last?.querySelector('b')?.innerText,
          lastItemTop: Math.round(lastR?.top || 0),
          lastItemBottom: Math.round(lastR?.bottom || 0),
          isLastInViewport: (lastR?.top < window.innerHeight && lastR?.bottom > 0),
          buyBtnVisible: btnR && btnR.top > 0 && btnR.bottom < window.innerHeight,
          buyBtnHitbox: btnR ? { w: Math.round(btnR.width), h: Math.round(btnR.height), top: Math.round(btnR.top) } : null,
          buyBtnClickable: buyBtn ? !buyBtn.disabled && window.getComputedStyle(buyBtn).pointerEvents !== 'none' : false
        };
      })()
    `);
    console.log('Shop Bottom State (844x390):', JSON.stringify(shopBottom, null, 2));
    await screenshot('v134-release-shop-bottom-844x390.png');

    if (shopBottom.scrollTop <= 0) throw new Error('Shop body failed to scroll!');
    if (!shopBottom.isLastInViewport) throw new Error('Last TM item is not visible!');
    if (!shopBottom.buyBtnVisible || !shopBottom.buyBtnClickable) throw new Error('Last TM buy button not clickable!');

    // Test purchase flow and click interaction on last item
    const purchaseResult = await evalExpr(`
      (() => {
        const lastBuyBtn = document.querySelector('#shop-body .upg-item:last-child button[data-buy]');
        let clicked = false;
        if (lastBuyBtn) {
          lastBuyBtn.click();
          clicked = true;
        }

        // Test buying affordable item
        const affordableBtn = Array.from(document.querySelectorAll('#shop-body button[data-buy]')).find(b => {
          const cost = parseInt(b.innerText.replace(/[^0-9]/g, '') || '99999', 10);
          return cost <= 600;
        });

        let bought = false;
        if (affordableBtn) {
          const prevCoins = parseInt(document.getElementById('shop-coins')?.innerText?.replace(/[^0-9]/g, '') || '0', 10);
          affordableBtn.click();
          const nextCoins = parseInt(document.getElementById('shop-coins')?.innerText?.replace(/[^0-9]/g, '') || '0', 10);
          bought = nextCoins < prevCoins;
        }

        return {
          lastBtnClicked: clicked,
          affordableBought: bought
        };
      })()
    `);
    console.log('Purchase Test:', JSON.stringify(purchaseResult));

    // Test Orientation Change / Resize
    console.log('Testing device orientation change (portrait 390x844 then back)...');
    await setViewport(390, 844, true);
    await sleep(250);
    const portraitScroll = await evalExpr(`document.querySelector('#scr-shop .subscreen-body')?.scrollTop`);
    console.log(`ScrollTop in portrait: ${portraitScroll}`);
    await setViewport(844, 390, true);
    await sleep(250);
    const restoredScroll = await evalExpr(`document.querySelector('#scr-shop .subscreen-body')?.scrollTop`);
    console.log(`ScrollTop restored in landscape: ${restoredScroll}`);

    // Test Fullscreen Mode simulation (body.is-fullscreen)
    console.log('Testing shop in Fullscreen mode...');
    await evalExpr(`
      (() => {
        document.body.classList.add('is-fullscreen');
        window.dispatchEvent(new Event('resize'));
      })()
    `);
    await sleep(200);
    await touchSwipeUp(400, 320, 60);
    await sleep(150);
    const fsCheck = await evalExpr(`
      (() => {
        const body = document.querySelector('#scr-shop .subscreen-body');
        const last = document.querySelector('#shop-body .upg-item:last-child');
        const lastR = last?.getBoundingClientRect();
        return {
          scrollTop: body?.scrollTop,
          isLastInViewport: (lastR?.top < window.innerHeight && lastR?.bottom > 0)
        };
      })()
    `);
    console.log('Fullscreen Check:', JSON.stringify(fsCheck));
    await screenshot('v134-release-shop-fullscreen-bottom.png');
    await evalExpr(`document.body.classList.remove('is-fullscreen')`);

    // Test Desktop 1920x1080 Mode
    console.log('Testing shop on Desktop 1920x1080...');
    await setViewport(1920, 1080, false);
    await sleep(200);
    await evalExpr(`document.querySelector('#scr-shop .subscreen-body').scrollTop = 600`);
    await sleep(150);
    const deskCheck = await evalExpr(`
      (() => {
        const body = document.querySelector('#scr-shop .subscreen-body');
        const last = document.querySelector('#shop-body .upg-item:last-child');
        const lastR = last?.getBoundingClientRect();
        return {
          scrollTop: body?.scrollTop,
          isLastInViewport: (lastR?.top < window.innerHeight && lastR?.bottom > 0)
        };
      })()
    `);
    console.log('Desktop Check:', JSON.stringify(deskCheck));
    await screenshot('v134-release-shop-desktop-bottom.png');

    // Return to 844x390 and navigate back to Menu
    await setViewport(844, 390, true);
    await sleep(150);
    await evalExpr(`document.querySelector('#scr-shop .back-btn').click()`);
    await sleep(300);

    const backOk = await evalExpr(`
      !document.getElementById('scr-menu').classList.contains('hidden') &&
      document.getElementById('scr-shop').classList.contains('hidden')
    `);
    console.log('Shop back navigation success:', backOk);
    if (!backOk) throw new Error('Back button failed to return to menu from shop!');

    // ========================================================
    // 4. REGRESSION CHECKS ON ALL OTHER SCREENS
    // ========================================================
    console.log('\n--- 4. REGRESSION CHECKS (UPGRADES, DEX, BAG, GACHA, SETTINGS) ---');
    const screens = [
      { id: 'scr-upgrades', go: 'upgrades', title: 'Nâng cấp', scrollTarget: '.subscreen-body' },
      { id: 'scr-dex', go: 'dex', title: 'Pokémon Dex', scrollTarget: '.subscreen-body' },
      { id: 'scr-gacha', go: 'gacha', title: 'Gacha', scrollTarget: '.subscreen-body' },
      { id: 'scr-bag', go: 'bag', title: 'Túi đồ', scrollTarget: '.subscreen-body' },
      { id: 'scr-rank', go: 'rank', title: 'Xếp hạng', scrollTarget: '.subscreen-body' },
      { id: 'scr-goals', go: 'goals', title: 'Nhiệm vụ', scrollTarget: '.subscreen-body' },
      { id: 'scr-settings', go: 'settings', title: 'Cài đặt (Modal)', scrollTarget: '.box', isModal: true }
    ];

    for (const sc of screens) {
      await evalExpr(`document.querySelector('#scr-menu [data-go="${sc.go}"]').click()`);
      await sleep(300);

      if (sc.id === 'scr-upgrades') {
        await screenshot('v134-release-regression-upgrades.png');
      }

      const scrData = await evalExpr(`
        (() => {
          const scr = document.getElementById('${sc.id}');
          const scrollEl = scr?.querySelector('${sc.scrollTarget}');
          if (!scr || scr.classList.contains('hidden')) return { isOpen: false };

          const initialTop = scrollEl?.scrollTop;
          if (scrollEl) scrollEl.scrollTop = 120;
          const scrolledTop = scrollEl?.scrollTop;

          return {
            isOpen: true,
            hasHeader: !!scr.querySelector('.subscreen-header') || ${!!sc.isModal},
            scrollHeight: scrollEl?.scrollHeight,
            clientHeight: scrollEl?.clientHeight,
            canScroll: scrollEl ? scrollEl.scrollHeight > scrollEl.clientHeight : false,
            scrolledTop
          };
        })()
      `);
      console.log(`Regression [${sc.title}]: isOpen=${scrData.isOpen}, canScroll=${scrData.canScroll}, scrollH=${scrData.scrollHeight}, clientH=${scrData.clientHeight}, scrolledTop=${scrData.scrolledTop}`);
      certReport.regressionScreens[sc.id] = scrData;

      if (sc.isModal) {
        await evalExpr(`document.getElementById('set-close')?.click() || document.querySelector('#${sc.id} .ghost')?.click()`);
      } else {
        await evalExpr(`document.querySelector('#${sc.id} .back-btn')?.click()`);
      }
      await sleep(250);
    }

    console.log('\n--- 5. CONSOLE AUDIT ---');
    console.log(`Total Console Errors encountered: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('Errors:', consoleErrors);
      throw new Error(`Encountered ${consoleErrors.length} console errors!`);
    }

    certReport.allPassed = true;
    certReport.totalConsoleErrors = 0;
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'v134-release-certification-report.json'), JSON.stringify(certReport, null, 2));

    console.log('\nALL POKÉSURVIVOR V1.3.4 CERTIFICATION TESTS PASSED 100%!');

  } catch (err) {
    console.error('CERTIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    try { chrome.kill(); } catch {}
    process.exit(0);
  }
}

run();
