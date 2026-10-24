import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9560;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-v133-nav-'));
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

async function run() {
  console.log('=== POKÉSURVIVOR V1.3.3 NAVIGATION & TOUCH TESTING ===');
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  const TARGET_URL = 'http://127.0.0.1:8766/index.html';
  console.log(`Navigating to ${TARGET_URL}...`);
  await send('Page.navigate', { url: TARGET_URL });
  await sleep(1500);

  // Setup saved state
  await evaluate(`
    (async () => {
      localStorage.clear();
      const save = {
        user: 'NghiaDev',
        coins: 15420,
        tickets: { t1: 15, t10: 2 },
        partner: 25,
        partnerShiny: true,
        owned: { '25': 1, '1': 1, '4': 1, '7': 1 },
        shiny: { '25': 1 },
        pupg: { '25': { hp: 2, atk: 3 } },
        bag: { mint: 3 },
        tms: { tm01: 1 },
        stats: { runs: 12, bestTime: 420, bestLevel: 25, totalKills: 850 }
      };
      localStorage.setItem('ps.save.local', JSON.stringify(save));
      localStorage.setItem('ps.nick', 'NghiaDev');
      
      const tap = document.getElementById('tap-start');
      if (tap) tap.click();
      
      const bg = document.getElementById('btn-guest');
      if (bg && !document.getElementById('scr-login').classList.contains('hidden')) {
        bg.click();
      }
    })()
  `);
  await sleep(1000);

  const VIEWPORTS = [
    { name: 'landscape-844x390', w: 844, h: 390, label: 'iPhone 13/14 Landscape' },
    { name: 'landscape-915x412', w: 915, h: 412, label: 'Samsung S20/Pixel Landscape' },
    { name: 'landscape-740x360', w: 740, h: 360, label: 'Compact Android Landscape' },
    { name: 'landscape-844x300', w: 844, h: 300, label: 'Ultra-wide Low Height Landscape' },
    { name: 'portrait-390x844', w: 390, h: 844, label: 'iPhone 13/14 Portrait' },
    { name: 'portrait-360x800', w: 360, h: 800, label: 'Android Portrait' },
    { name: 'desktop-1920x1080', w: 1920, h: 1080, label: 'Desktop 1080p' }
  ];

  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n--- Testing Viewport: ${vp.label} (${vp.w}x${vp.h}) ---`);
    await setViewport(vp.w, vp.h);
    await sleep(400);

    // 1. CHECK MAIN MENU (Mode A)
    await evaluate(`
      (() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        const menu = document.getElementById('scr-menu');
        if (menu) menu.classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        const topbar = document.getElementById('topbar');
        if (topbar) topbar.classList.remove('hidden');
      })()
    `);
    await sleep(250);

    const menuCheck = await evaluate(`
      (() => {
        const topbar = document.getElementById('topbar');
        const style = window.getComputedStyle(topbar);
        const isHidden = style.display === 'none' || topbar.classList.contains('hidden');
        const onlinePill = document.getElementById('online-pill');
        const coinsPill = document.getElementById('coins-pill');
        const btnSave = document.getElementById('btn-save');
        const btnSet = document.getElementById('btn-settings');
        
        return {
          topbarVisible: !isHidden,
          topbarDisplay: style.display,
          topbarZ: style.zIndex,
          hasOnline: !!onlinePill,
          hasCoins: !!coinsPill,
          hasButtons: !!btnSave && !!btnSet
        };
      })()
    `);
    console.log(`Menu state: Topbar visible=${menuCheck.topbarVisible}, display=${menuCheck.topbarDisplay}, z=${menuCheck.topbarZ}`);
    await screenshot(`v133-${vp.name}-01-main-menu.png`);

    // 2. FLOW 1: Upgrades Screen (Mode B)
    console.log('Testing Flow 1: Menu -> Upgrades -> Back to Menu...');
    await evaluate(`
      (() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        const upg = document.getElementById('scr-upgrades');
        upg.classList.remove('hidden');
        document.body.classList.add('in-subscreen');
        const tb = document.getElementById('topbar');
        if (tb) tb.classList.add('hidden');
      })()
    `);
    await sleep(300);

    const upgCheck = await evaluate(`
      (() => {
        const topbar = document.getElementById('topbar');
        const topbarStyle = window.getComputedStyle(topbar);
        const topbarHidden = topbarStyle.display === 'none';
        
        const upgHeader = document.querySelector('#scr-upgrades .subscreen-header');
        const upgHeaderStyle = upgHeader ? window.getComputedStyle(upgHeader) : null;
        
        const backBtn = document.querySelector('#scr-upgrades .back-btn');
        const backRect = backBtn ? backBtn.getBoundingClientRect() : null;
        
        let hitElementTag = null, hitElementClass = null;
        if (backRect) {
          const cx = backRect.left + backRect.width / 2;
          const cy = backRect.top + backRect.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          if (hit) {
            hitElementTag = hit.tagName;
            hitElementClass = hit.className;
          }
        }
        
        const coinsPill = document.getElementById('upg-coins');
        const coinsVal = coinsPill ? coinsPill.textContent : '';
        
        const body = document.querySelector('#scr-upgrades .subscreen-body');
        const bodyStyle = body ? window.getComputedStyle(body) : null;
        const scrollable = body ? body.scrollHeight >= body.clientHeight : false;
        
        return {
          topbarHidden,
          topbarDisplay: topbarStyle.display,
          headerSticky: upgHeaderStyle ? upgHeaderStyle.position : null,
          headerZ: upgHeaderStyle ? upgHeaderStyle.zIndex : null,
          backBtnRect: backRect ? { w: Math.round(backRect.width), h: Math.round(backRect.height), x: Math.round(backRect.left), y: Math.round(backRect.top) } : null,
          hitAtBackBtn: { tag: hitElementTag, class: hitElementClass },
          coinsInHeader: coinsVal,
          bodyOverflowY: bodyStyle ? bodyStyle.overflowY : null,
          bodyScrollable: scrollable
        };
      })()
    `);
    console.log(`Upgrades check: Topbar hidden=${upgCheck.topbarHidden}, Header sticky=${upgCheck.headerSticky}, BackBtn: ${JSON.stringify(upgCheck.backBtnRect)}, Hit element: ${JSON.stringify(upgCheck.hitAtBackBtn)}`);
    await screenshot(`v133-${vp.name}-02-upgrades-screen.png`);

    // Click back button to return to menu
    await evaluate(`
      (() => {
        document.getElementById('scr-upgrades').classList.add('hidden');
        document.getElementById('scr-menu').classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar').classList.remove('hidden');
      })()
    `);
    await sleep(200);

    const afterBack = await evaluate(`
      (() => {
        const upgOpen = !document.getElementById('scr-upgrades').classList.contains('hidden');
        const menuOpen = !document.getElementById('scr-menu').classList.contains('hidden');
        const topbarStyle = window.getComputedStyle(document.getElementById('topbar'));
        return { upgOpen, menuOpen, topbarDisplay: topbarStyle.display };
      })()
    `);
    console.log(`After Back: menuOpen=${afterBack.menuOpen}, upgOpen=${afterBack.upgOpen}, topbarDisplay=${afterBack.topbarDisplay}`);

    // 3. FLOW 2: Dex Screen (Mode B)
    console.log('Testing Flow 2: Menu -> Dex -> Back...');
    await evaluate(`
      (() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-dex').classList.remove('hidden');
        document.body.classList.add('in-subscreen');
        document.getElementById('topbar').classList.add('hidden');
      })()
    `);
    await sleep(300);

    const dexCheck = await evaluate(`
      (() => {
        const topbarHidden = window.getComputedStyle(document.getElementById('topbar')).display === 'none';
        const backBtn = document.querySelector('#scr-dex .back-btn');
        const backRect = backBtn ? backBtn.getBoundingClientRect() : null;
        let hitTag = null;
        if (backRect) {
          const hit = document.elementFromPoint(backRect.left + backRect.width / 2, backRect.top + backRect.height / 2);
          hitTag = hit ? hit.tagName + '.' + hit.className : null;
        }
        return { topbarHidden, backRect, hitTag };
      })()
    `);
    console.log(`Dex check: Topbar hidden=${dexCheck.topbarHidden}, Hit: ${dexCheck.hitTag}`);
    await screenshot(`v133-${vp.name}-03-dex-screen.png`);

    await evaluate(`
      (() => {
        document.getElementById('scr-dex').classList.add('hidden');
        document.getElementById('scr-menu').classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar').classList.remove('hidden');
      })()
    `);
    await sleep(200);

    // 4. FLOW 3: Friends & Co-op (Mode B)
    console.log('Testing Flow 3: Menu -> Friends -> Back...');
    await evaluate(`
      (() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-friends').classList.remove('hidden');
        document.body.classList.add('in-subscreen');
        document.getElementById('topbar').classList.add('hidden');
      })()
    `);
    await sleep(300);

    const friendsCheck = await evaluate(`
      (() => {
        const topbarHidden = window.getComputedStyle(document.getElementById('topbar')).display === 'none';
        const backBtn = document.querySelector('#scr-friends .back-btn');
        const backRect = backBtn ? backBtn.getBoundingClientRect() : null;
        let hitTag = null;
        if (backRect) {
          const hit = document.elementFromPoint(backRect.left + backRect.width / 2, backRect.top + backRect.height / 2);
          hitTag = hit ? hit.tagName + '.' + hit.className : null;
        }
        return { topbarHidden, backRect, hitTag };
      })()
    `);
    console.log(`Friends check: Topbar hidden=${friendsCheck.topbarHidden}, Hit: ${friendsCheck.hitTag}`);
    await screenshot(`v133-${vp.name}-04-friends-screen.png`);

    await evaluate(`
      (() => {
        document.getElementById('scr-friends').classList.add('hidden');
        document.getElementById('scr-menu').classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar').classList.remove('hidden');
      })()
    `);
    await sleep(200);

    // 5. FLOW 4: Gacha Screen (Mode B)
    console.log('Testing Flow 4: Menu -> Gacha -> Back...');
    await evaluate(`
      (() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-gacha').classList.remove('hidden');
        document.body.classList.add('in-subscreen');
        document.getElementById('topbar').classList.add('hidden');
      })()
    `);
    await sleep(300);

    const gachaCheck = await evaluate(`
      (() => {
        const topbarHidden = window.getComputedStyle(document.getElementById('topbar')).display === 'none';
        const backBtn = document.querySelector('#scr-gacha .back-btn');
        const ticketsPill = document.getElementById('gacha-tickets-pill');
        const coinsPill = document.getElementById('gacha-coins');
        return {
          topbarHidden,
          hasTicketsPill: !!ticketsPill,
          hasCoinsPill: !!coinsPill
        };
      })()
    `);
    console.log(`Gacha check: Topbar hidden=${gachaCheck.topbarHidden}, Tickets=${gachaCheck.hasTicketsPill}, Coins=${gachaCheck.hasCoinsPill}`);
    await screenshot(`v133-${vp.name}-05-gacha-screen.png`);

    await evaluate(`
      (() => {
        document.getElementById('scr-gacha').classList.add('hidden');
        document.getElementById('scr-menu').classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar').classList.remove('hidden');
      })()
    `);
    await sleep(200);

    // 6. FLOW 5: Settings Modal (Mode B)
    console.log('Testing Flow 5: Menu -> Settings -> Close...');
    await evaluate(`
      (() => {
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-menu').classList.remove('hidden');
        document.getElementById('scr-settings').classList.remove('hidden');
        document.body.classList.add('in-subscreen');
        document.getElementById('topbar').classList.add('hidden');
      })()
    `);
    await sleep(300);

    const settingsCheck = await evaluate(`
      (() => {
        const topbarHidden = window.getComputedStyle(document.getElementById('topbar')).display === 'none';
        const modal = document.getElementById('scr-settings');
        const modalVisible = !modal.classList.contains('hidden');
        const z = window.getComputedStyle(modal).zIndex;
        return { topbarHidden, modalVisible, z };
      })()
    `);
    console.log(`Settings check: Topbar hidden=${settingsCheck.topbarHidden}, Modal visible=${settingsCheck.modalVisible}, z=${settingsCheck.z}`);
    await screenshot(`v133-${vp.name}-06-settings-modal.png`);

    await evaluate(`
      (() => {
        document.getElementById('scr-settings').classList.add('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar').classList.remove('hidden');
      })()
    `);
    await sleep(200);

    results.push({
      viewport: vp.label,
      dimensions: `${vp.w}x${vp.h}`,
      menu: menuCheck,
      upgrades: upgCheck,
      afterBack: afterBack,
      dex: dexCheck,
      friends: friendsCheck,
      gacha: gachaCheck,
      settings: settingsCheck
    });
  }

  // Cleanup Chrome
  ws.close();
  chrome.kill();

  console.log('\n================ ALL VIEWPORT TESTS COMPLETE ================');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'v133-test-results.json'), JSON.stringify(results, null, 2));
  console.log(`Results saved to ${path.join(ARTIFACT_DIR, 'v133-test-results.json')}`);
}

run().catch(e => {
  console.error('Test execution error:', e);
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  process.exit(1);
});
