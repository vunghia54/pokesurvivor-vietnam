import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9572;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-topbar-test-'));

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

    // Ensure menu is visible and show all topbar buttons for inspection
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
        
        // Show save button and full button so we inspect the complete set
        document.getElementById('btn-save')?.classList.remove('hidden');
        document.getElementById('btn-full')?.classList.remove('hidden');
        document.getElementById('btn-support')?.classList.remove('hidden');
      })()
    `);
    await sleep(250);

    // Viewport tests
    const VIEWPORTS = [
      { w: 844, h: 390, name: 'landscape-844x390', isMobile: true, expectSingleRow: true },
      { w: 915, h: 412, name: 'landscape-915x412', isMobile: true, expectSingleRow: true },
      { w: 740, h: 360, name: 'landscape-740x360', isMobile: true, expectSingleRow: true },
      { w: 390, h: 844, name: 'portrait-390x844', isMobile: true, expectSingleRow: false },
      { w: 360, h: 800, name: 'portrait-360x800', isMobile: true, expectSingleRow: false },
      { w: 1920, h: 1080, name: 'desktop-1920x1080', isMobile: false, expectSingleRow: true }
    ];

    const results = {};

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
          // Collision occurs only if both elements intersect vertically AND horizontally
          const vOverlap = !(actR.bottom <= infoR.top || actR.top >= infoR.bottom);
          const hOverlap = !(actR.right <= infoR.left || actR.left >= infoR.right);
          const hasCollision = vOverlap && hOverlap;

          // Check visible buttons in actions
          const actionButtons = Array.from(act.querySelectorAll('button:not(.hidden)')).map(b => {
            const r = b.getBoundingClientRect();
            return {
              id: b.id,
              text: b.innerText?.trim(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              top: Math.round(r.top),
              left: Math.round(r.left)
            };
          });

          // Check info pills
          const infoPills = Array.from(info.querySelectorAll('.pill:not(.hidden)')).map(p => {
            const r = p.getBoundingClientRect();
            return {
              id: p.id,
              text: p.innerText?.trim(),
              w: Math.round(r.width),
              h: Math.round(r.height),
              top: Math.round(r.top),
              left: Math.round(r.left)
            };
          });

          return {
            windowW: window.innerWidth,
            windowH: window.innerHeight,
            topbar: {
              top: Math.round(tbR.top),
              bottom: Math.round(tbR.bottom),
              height: Math.round(tbR.height),
              left: Math.round(tbR.left),
              right: Math.round(tbR.right)
            },
            info: {
              top: Math.round(infoR.top),
              bottom: Math.round(infoR.bottom),
              height: Math.round(infoR.height),
              left: Math.round(infoR.left),
              right: Math.round(infoR.right)
            },
            actions: {
              top: Math.round(actR.top),
              bottom: Math.round(actR.bottom),
              height: Math.round(actR.height),
              left: Math.round(actR.left),
              right: Math.round(actR.right)
            },
            isSameRow,
            gapBetween,
            hasCollision,
            menuRight: menuRight ? {
              top: Math.round(menuRight.top),
              left: Math.round(menuRight.left),
              width: Math.round(menuRight.width),
              height: Math.round(menuRight.height)
            } : null,
            playBtn: playBtn ? {
              top: Math.round(playBtn.top),
              height: Math.round(playBtn.height)
            } : null,
            actionButtons,
            infoPills
          };
        })()
      `);

      console.log(`\nViewport [${vp.name}]:`);
      console.log(`  Single Row: ${data.isSameRow} (expected: ${vp.expectSingleRow})`);
      console.log(`  Info Rect: top=${data.info.top}, bottom=${data.info.bottom}, right=${data.info.right}, h=${data.info.height}`);
      console.log(`  Actions Rect: top=${data.actions.top}, bottom=${data.actions.bottom}, left=${data.actions.left}, h=${data.actions.height}`);
      console.log(`  Gap between Left and Right groups: ${data.gapBetween}px (collision: ${data.hasCollision})`);
      if (data.menuRight) {
        console.log(`  MenuRight pos: top=${data.menuRight.top}, left=${data.menuRight.left}, w=${data.menuRight.width}, h=${data.menuRight.height}`);
        console.log(`  Play button pos: top=${data.playBtn?.top}, h=${data.playBtn?.height}`);
      }
      results[vp.name] = data;

      if (vp.expectSingleRow && !data.isSameRow) {
        throw new Error(`FAIL: Topbar should be single row in ${vp.name}!`);
      }
      if (data.hasCollision) {
        throw new Error(`FAIL: Collision between info and actions in ${vp.name}!`);
      }

      if (vp.name === 'landscape-844x390') {
        await screenshot('topbar-after-844x390.png');
        await screenshot('topbar-after-closeup.png', {
          x: 0, y: 0, width: 844, height: 50, scale: 2
        });
      }
    }

    // Test button interactivity
    console.log('\n--- TESTING BUTTON CLICKS ON TOPBAR ---');
    const clickCheck = await evalExpr(`
      (() => {
        const tests = {};
        const soundBtn = document.getElementById('btn-sound');
        if (soundBtn) {
          soundBtn.click();
          tests.soundClicked = true;
          tests.soundPanelVisible = !document.getElementById('sound-panel')?.classList.contains('hidden');
          soundBtn.click(); // toggle off
        }

        const newsBtn = document.getElementById('btn-news');
        if (newsBtn) {
          newsBtn.click();
          tests.newsClicked = true;
          tests.newsModalOpen = !document.getElementById('scr-news')?.classList.contains('hidden');
          document.getElementById('news-close')?.click();
        }

        const settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) {
          settingsBtn.click();
          tests.settingsClicked = true;
          tests.settingsModalOpen = !document.getElementById('scr-settings')?.classList.contains('hidden');
          document.getElementById('set-close')?.click();
        }

        const userPill = document.getElementById('user-pill');
        if (userPill) {
          userPill.click();
          tests.userPillClicked = true;
          tests.accountModalOpen = !document.getElementById('scr-settings')?.classList.contains('hidden');
          document.getElementById('set-close')?.click();
        }

        return tests;
      })()
    `);
    console.log('Click Test Results:', JSON.stringify(clickCheck, null, 2));

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'topbar-test-report.json'), JSON.stringify(results, null, 2));
    console.log('\nALL TOPBAR SINGLE-ROW TESTS PASSED 100%!');

  } finally {
    try { chrome.kill(); } catch {}
  }
}

run();
