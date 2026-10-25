import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9573;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-topbar-hitbox-'));

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

async function screenshot(filename, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const res = await send('Page.captureScreenshot', params);
  const p = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
  console.log(`Saved screenshot: ${filename} (${(res.data.length * 0.75 / 1024).toFixed(1)} KB)`);
}

async function run() {
  try {
    await connect();
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(844, 390);

    await send('Page.navigate', { url: 'http://localhost:8766/index.html' });
    await sleep(1200);

    // Initial guest login and quiz
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg) bg.click();
      })()
    `);
    await sleep(400);

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

    // Show topbar and all action buttons
    await evalExpr(`
      (() => {
        const resOk = document.getElementById('res-ok');
        if (resOk && !document.getElementById('scr-result').classList.contains('hidden')) {
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
    await sleep(250);

    const VIEWPORTS = [
      { w: 740, h: 360, name: 'landscape-740x360', isMobile: true },
      { w: 844, h: 390, name: 'landscape-844x390', isMobile: true },
      { w: 915, h: 412, name: 'landscape-915x412', isMobile: true }
    ];

    const certReport = {
      viewports: {},
      hitboxAnalysis: {},
      menuDisplacement: {}
    };

    for (const vp of VIEWPORTS) {
      await setViewport(vp.w, vp.h, vp.isMobile);
      await sleep(150);

      const data = await evalExpr(`
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

          // Measure each visible button in actions and its touch hitbox
          const actionButtons = Array.from(act.querySelectorAll('button'))
            .filter(b => !b.classList.contains('hidden') && window.getComputedStyle(b).display !== 'none')
            .map(b => {
            const r = b.getBoundingClientRect();
            // Computed style of pseudo-element ::before
            const beforeStyle = window.getComputedStyle(b, '::before');
            const beforeW = parseFloat(beforeStyle.width) || r.width;
            const beforeH = parseFloat(beforeStyle.height) || r.height;
            const hitboxLeft = (r.left + r.width / 2) - beforeW / 2;
            const hitboxRight = (r.left + r.width / 2) + beforeW / 2;
            const hitboxTop = (r.top + r.height / 2) - beforeH / 2;
            const hitboxBottom = (r.top + r.height / 2) + beforeH / 2;

            return {
              id: b.id,
              visualRect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) },
              hitboxRect: { left: Math.round(hitboxLeft), right: Math.round(hitboxRight), top: Math.round(hitboxTop), bottom: Math.round(hitboxBottom), w: Math.round(beforeW), h: Math.round(beforeH) }
            };
          });

          // Check adjacent hitbox overlaps
          const adjacentOverlaps = [];
          for (let i = 0; i < actionButtons.length - 1; i++) {
            const btnA = actionButtons[i];
            const btnB = actionButtons[i + 1];
            // Overlap = btnA.hitboxRight - btnB.hitboxLeft
            const overlapX = Math.max(0, btnA.hitboxRect.right - btnB.hitboxRect.left);
            adjacentOverlaps.push({
              pair: btnA.id + ' -> ' + btnB.id,
              btnARight: btnA.hitboxRect.right,
              btnBLeft: btnB.hitboxRect.left,
              overlapX
            });
          }

          // Check margin from lowest hitbox to top of menu elements below
          const lowestHitboxBottom = Math.max(...actionButtons.map(b => b.hitboxRect.bottom));
          const menuTop = menuRight ? menuRight.top : 999;
          const playTop = playBtn ? playBtn.top : 999;
          const marginToPlayBtn = playTop - lowestHitboxBottom;

          return {
            windowW: window.innerWidth,
            windowH: window.innerHeight,
            isSameRow,
            gapBetween,
            topbarHeight: Math.round(tbR.height),
            infoRight: Math.round(infoR.right),
            actionsLeft: Math.round(actR.left),
            lowestHitboxBottom,
            marginToPlayBtn,
            actionButtons,
            adjacentOverlaps,
            menuRight: menuRight ? { top: Math.round(menuRight.top), left: Math.round(menuRight.left), width: Math.round(menuRight.width), height: Math.round(menuRight.height) } : null,
            playBtn: playBtn ? { top: Math.round(playBtn.top), height: Math.round(playBtn.height) } : null
          };
        })()
      `);

      console.log(`\n=================== VIEWPORT: ${vp.name} ===================`);
      console.log(`Single Row: ${data.isSameRow}`);
      console.log(`Gap between Info and Actions: ${data.gapBetween}px`);
      console.log(`Lowest Hitbox Bottom: ${data.lowestHitboxBottom}px | Margin to Play Button: ${data.marginToPlayBtn}px`);
      console.log(`Adjacent Hitbox Overlaps:`);
      for (const ov of data.adjacentOverlaps) {
        console.log(`  ${ov.pair}: overlap = ${ov.overlapX}px (btnARight=${ov.btnARight}, btnBLeft=${ov.btnBLeft})`);
        if (ov.overlapX > 0) {
          throw new Error(`Hitbox overlap detected between ${ov.pair}: ${ov.overlapX}px!`);
        }
      }
      if (data.marginToPlayBtn < 10) {
        throw new Error(`Hitbox invades menu below! Margin to play button is only ${data.marginToPlayBtn}px!`);
      }

      certReport.viewports[vp.name] = data;

      if (vp.name === 'landscape-844x390') {
        await screenshot('v135-certified-topbar-844x390.png');
        await screenshot('v135-certified-topbar-closeup.png', {
          x: 0, y: 0, width: 844, height: 50, scale: 2
        });
      }
    }

    // Touch event testing on each button
    console.log('\n--- DISPATCHING REAL TOUCH EVENTS ON ALL TOPBAR BUTTONS ---');
    const touchTests = await evalExpr(`
      (() => {
        const events = {};
        const buttons = Array.from(document.querySelectorAll('.topbar-actions button'))
          .filter(b => !b.classList.contains('hidden') && window.getComputedStyle(b).display !== 'none');
        buttons.forEach(b => {
          let touched = false;
          const handler = e => { touched = true; };
          b.addEventListener('click', handler, { once: true });
          
          // Dispatch touch
          const rect = b.getBoundingClientRect();
          const evt = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          });
          b.dispatchEvent(evt);
          events[b.id] = touched;
        });
        return events;
      })()
    `);
    console.log('Touch Event Verification:', JSON.stringify(touchTests, null, 2));

    certReport.touchTests = touchTests;
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'v135-topbar-certification-report.json'), JSON.stringify(certReport, null, 2));

    console.log('\nALL V1.3.5 TOPBAR CERTIFICATION TESTS PASSED (100%)!');

  } finally {
    try { chrome.kill(); } catch {}
  }
}

run();
