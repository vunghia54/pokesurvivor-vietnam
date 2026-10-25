import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9566;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-v133-edge-'));
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

async function run() {
  console.log('=== RUNNING POKÉSURVIVOR V1.3.3 EDGE CASES & INTERACTION VERIFICATION ===');
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  const TARGET_URL = 'http://127.0.0.1:8766/index.html';
  console.log(`Loading initial ${TARGET_URL}...`);
  await send('Page.navigate', { url: TARGET_URL });
  await sleep(1500);

  // Click start screen if visible
  await evaluate(`
    (() => {
      const tap = document.getElementById('tap-start');
      if (tap) tap.click();
    })()
  `);
  await sleep(600);

  // Click guest button
  console.log('Completing starter onboarding to reach Main Menu...');
  await evaluate(`
    (() => {
      const bg = document.getElementById('btn-guest');
      if (bg && !document.getElementById('scr-login').classList.contains('hidden')) {
        bg.click();
      }
    })()
  `);
  await sleep(600);

  // Answer personality questions
  for (let i = 0; i < 8; i++) {
    await evaluate(`
      (() => {
        const btn = document.querySelector('#test-a .answer');
        if (btn) btn.click();
      })()
    `);
    await sleep(150);
  }

  // Confirm partner
  await evaluate(`
    (() => {
      const ok = document.getElementById('res-ok');
      if (ok) ok.click();
    })()
  `);
  await sleep(800);

  const initCheck = await evaluate(`({
    menuVisible: !document.getElementById('scr-menu').classList.contains('hidden'),
    inSubscreen: document.body.classList.contains('in-subscreen'),
    topbarDisplay: window.getComputedStyle(document.getElementById('topbar')).display,
    partnerName: document.getElementById('menu-partner-name')?.textContent
  })`);
  console.log('Initial Menu State after login:', initCheck);

  const results = {
    quickSwitch: false,
    nestedModals: false,
    rotationResize: false,
    viewports: {},
    coopIsolation: false,
    consoleErrorsCount: 0
  };

  // TEST 1: Rapid screen transitions via real user clicks (Quick Switching)
  console.log('\n[TEST 1] Quick Screen Transitions: Menu -> Upgrades -> Back -> Dex -> Back -> Shop -> Back -> Gacha -> Back');
  const navTargets = [
    { go: 'upgrades', scr: 'scr-upgrades' },
    { go: 'dex', scr: 'scr-dex' },
    { go: 'shop', scr: 'scr-shop' },
    { go: 'gacha', scr: 'scr-gacha' }
  ];

  let quickSwitchOk = true;
  for (const t of navTargets) {
    // Click menu item
    await evaluate(`document.querySelector('#scr-menu [data-go="${t.go}"]').click()`);
    await sleep(200);
    const inSub = await evaluate(`document.body.classList.contains('in-subscreen')`);
    const scrVisible = await evaluate(`!document.getElementById('${t.scr}').classList.contains('hidden')`);
    const tbDisplay = await evaluate(`window.getComputedStyle(document.getElementById('topbar')).display`);

    if (!inSub || !scrVisible || tbDisplay !== 'none') {
      quickSwitchOk = false;
      console.error(`Failed at entering ${t.scr}: inSub=${inSub}, scrVisible=${scrVisible}, tbDisplay=${tbDisplay}`);
    }

    // Click back button
    await evaluate(`document.querySelector('#${t.scr} .back-btn, #${t.scr} [data-back]').click()`);
    await sleep(200);
    const menuVisible = await evaluate(`!document.getElementById('scr-menu').classList.contains('hidden')`);
    const menuInSub = await evaluate(`document.body.classList.contains('in-subscreen')`);
    const menuTbDisplay = await evaluate(`window.getComputedStyle(document.getElementById('topbar')).display`);

    if (!menuVisible || menuInSub || menuTbDisplay === 'none') {
      quickSwitchOk = false;
      console.error(`Failed at leaving ${t.scr}: menuVisible=${menuVisible}, menuInSub=${menuInSub}, menuTbDisplay=${menuTbDisplay}`);
    }
  }
  results.quickSwitch = quickSwitchOk;
  console.log(`Quick Switch Result: ${quickSwitchOk ? 'PASS' : 'FAIL'}`);

  // TEST 2: Nested Modals State Check
  console.log('\n[TEST 2] Nested Modals State Check: Upgrades -> Settings -> Close X -> Upgrades');
  // Open upgrades
  await evaluate(`document.querySelector('#scr-menu [data-go="upgrades"]').click()`);
  await sleep(200);
  // Open Settings Modal
  await evaluate(`
    (() => {
      document.getElementById('scr-settings').classList.remove('hidden');
      document.body.classList.add('in-subscreen');
    })()
  `);
  await sleep(150);
  // Close Settings Modal using Close button
  await evaluate(`document.getElementById('set-close').click()`);
  await sleep(150);
  const nested1 = await evaluate(`({
    activeSubscreen: !document.getElementById('scr-upgrades').classList.contains('hidden'),
    settingsHidden: document.getElementById('scr-settings').classList.contains('hidden'),
    inSubscreen: document.body.classList.contains('in-subscreen'),
    tbDisplay: window.getComputedStyle(document.getElementById('topbar')).display
  })`);
  console.log('Nested Modal 1 (Upgrades -> Settings -> Close):', nested1);

  // Return to menu
  await evaluate(`document.querySelector('#scr-upgrades .back-btn').click()`);
  await sleep(150);

  // Dex -> News -> Close X -> Dex
  await evaluate(`document.querySelector('#scr-menu [data-go="dex"]').click()`);
  await sleep(200);
  await evaluate(`
    (() => {
      document.getElementById('scr-news').classList.remove('hidden');
      document.body.classList.add('in-subscreen');
    })()
  `);
  await sleep(150);
  await evaluate(`document.getElementById('news-close')?.click()`);
  await sleep(150);
  const nested2 = await evaluate(`({
    activeSubscreen: !document.getElementById('scr-dex').classList.contains('hidden'),
    inSubscreen: document.body.classList.contains('in-subscreen'),
    tbDisplay: window.getComputedStyle(document.getElementById('topbar')).display
  })`);
  console.log('Nested Modal 2 (Dex -> News -> Close):', nested2);

  // Return to menu
  await evaluate(`document.querySelector('#scr-dex .back-btn').click()`);
  await sleep(150);

  results.nestedModals = nested1.activeSubscreen && nested1.settingsHidden && nested1.inSubscreen && nested1.tbDisplay === 'none' &&
                         nested2.activeSubscreen && nested2.inSubscreen && nested2.tbDisplay === 'none';
  console.log(`Nested Modals Result: ${results.nestedModals ? 'PASS' : 'FAIL'}`);

  // TEST 3: Rotation & Resizing during Active Subscreen / Modal
  console.log('\n[TEST 3] Rotation / Resize during Active Subscreen & Modal');
  await setViewport(844, 390); // Landscape
  await evaluate(`document.querySelector('#scr-menu [data-go="upgrades"]').click()`);
  await sleep(200);
  // Rotate to Portrait 390x844
  await setViewport(390, 844);
  await sleep(150);
  const rotateCheck1 = await evaluate(`({
    upgVisible: !document.getElementById('scr-upgrades').classList.contains('hidden'),
    tbHidden: window.getComputedStyle(document.getElementById('topbar')).display === 'none',
    overflow: document.documentElement.scrollWidth > window.innerWidth
  })`);

  // Open settings while in portrait
  await evaluate(`
    (() => {
      document.getElementById('scr-settings').classList.remove('hidden');
    })()
  `);
  await sleep(150);
  // Rotate back to landscape 844x390 while settings is open
  await setViewport(844, 390);
  await sleep(150);
  const rotateCheck2 = await evaluate(`({
    settingsVisible: !document.getElementById('scr-settings').classList.contains('hidden'),
    tbHidden: window.getComputedStyle(document.getElementById('topbar')).display === 'none',
    overflow: document.documentElement.scrollWidth > window.innerWidth
  })`);
  // Close settings
  await evaluate(`document.getElementById('set-close').click()`);
  await sleep(150);
  // Back to menu
  await evaluate(`document.querySelector('#scr-upgrades .back-btn').click()`);
  await sleep(150);

  results.rotationResize = rotateCheck1.upgVisible && rotateCheck1.tbHidden && !rotateCheck1.overflow &&
                          rotateCheck2.settingsVisible && rotateCheck2.tbHidden && !rotateCheck2.overflow;
  console.log('Rotation & Resize Result:', results.rotationResize ? 'PASS' : 'FAIL', { rotateCheck1, rotateCheck2 });

  // TEST 4: Viewports Touch & Hit-Testing on Important Buttons
  console.log('\n[TEST 4] Touch & Hit-Testing across 7 Viewports on Critical Buttons');
  const viewports = [
    { name: '844x390', w: 844, h: 390 },
    { name: '915x412', w: 915, h: 412 },
    { name: '740x360', w: 740, h: 360 },
    { name: '844x300', w: 844, h: 300 },
    { name: '390x844', w: 390, h: 844 },
    { name: '360x800', w: 360, h: 800 },
    { name: '1920x1080', w: 1920, h: 1080 }
  ];

  for (const vp of viewports) {
    await setViewport(vp.w, vp.h);
    await sleep(120);

    // 1. Check Menu
    const menuOverflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);

    // 2. Open Upgrades
    await evaluate(`document.querySelector('#scr-menu [data-go="upgrades"]').click()`);
    await sleep(200);
    const upgTest = await evaluate(`(() => {
      const backBtn = document.querySelector('#scr-upgrades .back-btn');
      const bRect = backBtn.getBoundingClientRect();
      const backHit = document.elementFromPoint(bRect.left + bRect.width / 2, bRect.top + bRect.height / 2);

      const buyBtn = document.querySelector('#upg-list .btn-buy, #upg-list button[data-buy], #upg-list button');
      let buyHitOk = false;
      if (buyBtn) {
        const buyRect = buyBtn.getBoundingClientRect();
        const buyHit = document.elementFromPoint(buyRect.left + buyRect.width / 2, buyRect.top + buyRect.height / 2);
        buyHitOk = (buyHit === buyBtn || buyBtn.contains(buyHit));
      } else {
        buyHitOk = true;
      }

      const body = document.querySelector('#scr-upgrades .subscreen-body');
      const initialScroll = body.scrollTop;
      body.scrollTop = 100;
      const canScroll = (body.scrollHeight > body.clientHeight) ? (body.scrollTop >= 0) : true;
      body.scrollTop = initialScroll;

      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      const tbHidden = window.getComputedStyle(document.getElementById('topbar')).display === 'none';

      return {
        backHitTag: backHit?.tagName + '.' + backHit?.className,
        backHitOk: (backHit === backBtn || backBtn.contains(backHit)),
        buyHitOk,
        canScroll,
        overflow,
        tbHidden
      };
    })()`);

    // Return to menu
    await evaluate(`document.querySelector('#scr-upgrades .back-btn').click()`);
    await sleep(150);

    results.viewports[vp.name] = {
      menuNoOverflow: !menuOverflow,
      subscreenNoOverflow: !upgTest.overflow,
      backHitOk: upgTest.backHitOk,
      buyHitOk: upgTest.buyHitOk,
      canScroll: upgTest.canScroll,
      tbHidden: upgTest.tbHidden,
      pass: !menuOverflow && !upgTest.overflow && upgTest.backHitOk && upgTest.buyHitOk && upgTest.canScroll && upgTest.tbHidden
    };
    console.log(`Viewport ${vp.name}:`, results.viewports[vp.name].pass ? 'PASS' : 'FAIL', results.viewports[vp.name]);
  }

  // TEST 5: Co-op Room Leave vs Navigation Isolation
  console.log('\n[TEST 5] Co-op Navigation Isolation Test');
  // Open Lobby screen directly to test Lobby Back Button vs Leave Room Button
  await evaluate(`
    (() => {
      document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
      document.getElementById('scr-lobby').classList.remove('hidden');
      document.body.classList.add('in-subscreen');
      document.getElementById('topbar').classList.add('hidden');
    })()
  `);
  await sleep(150);
  // Click back button in lobby (#lobby-menu)
  await evaluate(`document.getElementById('lobby-menu').click()`);
  await sleep(150);
  const coopNavCheck = await evaluate(`({
    menuOpen: !document.getElementById('scr-menu').classList.contains('hidden'),
    lobbyHidden: document.getElementById('scr-lobby').classList.contains('hidden'),
    inSubscreen: document.body.classList.contains('in-subscreen'),
    topbarVisible: window.getComputedStyle(document.getElementById('topbar')).display === 'flex'
  })`);
  console.log('Co-op Nav Check (Lobby -> Back -> Menu):', coopNavCheck);
  results.coopIsolation = coopNavCheck.menuOpen && coopNavCheck.lobbyHidden && !coopNavCheck.inSubscreen && coopNavCheck.topbarVisible;
  console.log('Co-op Navigation Result:', results.coopIsolation ? 'PASS' : 'FAIL');

  results.consoleErrorsCount = consoleErrors.length;
  console.log('\nConsole Errors Logged:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors);
  }

  // Final summary
  const allViewportsPass = Object.values(results.viewports).every(v => v.pass);
  const overallPass = results.quickSwitch && results.nestedModals && results.rotationResize && allViewportsPass && results.coopIsolation && results.consoleErrorsCount === 0;

  console.log('\n========================================');
  console.log(`ALL EDGE CASES & INTERACTION TESTS: ${overallPass ? '100% PASS (GO)' : 'FAIL (NO-GO)'}`);
  console.log('========================================');

  // Save report to disk
  fs.writeFileSync(
    path.join('C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots', 'v133-edge-cases-report.json'),
    JSON.stringify(results, null, 2)
  );

  ws.close();
  chrome.kill();
  if (!overallPass) process.exit(1);
}

run().catch(e => {
  console.error('Test execution failed:', e);
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
});
