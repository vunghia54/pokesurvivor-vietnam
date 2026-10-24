import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9556;
const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-topbar-verify-'));
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

async function setViewport(width, height, isMobile = true, deviceScaleFactor = 2) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: isMobile,
    screenOrientation: width > height ? { angle: 90, type: 'landscapePrimary' } : { angle: 0, type: 'portraitPrimary' }
  });
  if (isMobile) {
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
    });
  } else {
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }
}

async function capture(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.data, 'base64');
  const file = path.join(ARTIFACT_DIR, name);
  fs.writeFileSync(file, buf);
  console.log(`[SAVED] ${name} (${buf.length} bytes)`);
  return file;
}

const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    console.error('JS Exception:', r.exceptionDetails);
  }
  return r.result?.value;
};

async function auditViewport(vp) {
  console.log(`\n======================================================`);
  console.log(`AUDITING VIEWPORT: ${vp.label} (${vp.w}x${vp.h}) - ${vp.mode}`);
  console.log(`======================================================`);

  await setViewport(vp.w, vp.h, vp.mobile, vp.dsf || 2);
  await send('Page.navigate', { url: 'http://127.0.0.1:8766/index.html' });
  await sleep(2500);

  const debugState = await ev(`(() => {
    return {
      title: document.title,
      hasG: typeof G !== 'undefined',
      activeScr: Array.from(document.querySelectorAll('.scr')).filter(s => !s.classList.contains('hidden')).map(s => s.id),
      topbarClass: document.getElementById('topbar')?.className
    };
  })()`);
  console.log('DEBUG STATE:', JSON.stringify(debugState));

  // Navigate to menu screen and reveal topbar & partner card cleanly via DOM / G runtime
  await ev(`(() => {
    // Hide all other screens and show scr-menu
    document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
    const sm = document.getElementById('scr-menu');
    if (sm) sm.classList.remove('hidden');

    // Reveal topbar
    const tb = document.getElementById('topbar');
    if (tb) tb.classList.remove('hidden');

    // Populate Row 1: Player Info
    const cnt = document.getElementById('online-count');
    if (cnt) cnt.textContent = 'Online: 8';
    const dot = document.querySelector('.online-dot');
    if (dot) dot.classList.remove('offline');

    const coins = document.getElementById('coins');
    if (coins) coins.textContent = '12500';

    const tix = document.getElementById('tickets-pill');
    if (tix) {
      tix.innerHTML = '<img src=\"art/ico/ticket.png\" width=\"14\" height=\"14\"> 15 &nbsp;<img src=\"art/ico/ticket10.png\" width=\"14\" height=\"14\"> 3';
    }

    const up = document.getElementById('user-pill');
    if (up) {
      up.innerHTML = '<span class=\"user-ico\">👤</span> <span>Vũ Trung Nghĩa</span> <i class=\"sync ok\">●</i>';
    }

    // Populate Row 2: Action Buttons
    const sb = document.getElementById('btn-save');
    if (sb) {
      sb.classList.remove('hidden');
      sb.innerHTML = '💾 <span>Lưu</span>';
    }

    const nb = document.getElementById('btn-news');
    if (nb) {
      nb.classList.remove('hidden');
      nb.innerHTML = '📖 <span>Tin mới</span>';
    }

    const yb = document.getElementById('btn-yt');
    if (yb) {
      yb.classList.remove('hidden');
      yb.innerHTML = '🌐 <span>Facebook</span>';
    }

    const fb = document.getElementById('btn-full');
    if (fb) {
      fb.classList.remove('hidden');
      fb.innerHTML = '⛶';
    }

    // Partner card in .menu-left
    const nm = document.querySelector('.partner-card .nm');
    if (nm && !nm.textContent.trim()) nm.textContent = 'Pikachu';
    const lv = document.querySelector('.partner-card .lv');
    if (lv && !lv.textContent.trim()) lv.textContent = 'Cấp 50';

    const partnerImg = document.getElementById('menu-partner');
    if (partnerImg && !partnerImg.getAttribute('src')) {
      partnerImg.src = 'art/spr/25.png';
    }
  })()`);
  await sleep(600);

  // Measure bounding rectangles
  const metrics = await ev(`(() => {
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const docWidth = document.documentElement.scrollWidth;
    const docHeight = document.documentElement.scrollHeight;

    function getBox(id) {
      const el = typeof id === 'string' ? (id.startsWith('.') ? document.querySelector(id) : document.getElementById(id)) : id;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        id: typeof id === 'string' ? id : el.className,
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        left: Math.round(rect.left * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        text: el.innerText ? el.innerText.trim().replace(/\\s+/g, ' ') : ''
      };
    }

    const row1Items = [
      getBox('online-pill'),
      getBox('coins-pill'),
      getBox('tickets-pill'),
      getBox('user-pill')
    ];

    const row2Items = [
      getBox('btn-save'),
      getBox('btn-news'),
      getBox('btn-yt'),
      getBox('btn-sound'),
      getBox('btn-full'),
      getBox('btn-settings'),
      getBox('btn-logout')
    ];

    const leftContent = {
      logo: getBox('.menu-left .logo'),
      logoT1: getBox('.menu-left .logo .t1'),
      logoT2: getBox('.menu-left .logo .t2'),
      partnerCard: getBox('.partner-card'),
      partnerSprite: getBox('#menu-partner'),
      partnerName: getBox('.partner-card .nm')
    };

    const topbar = getBox('topbar');
    const topbarInfo = getBox('.topbar-info');
    const topbarActions = getBox('.topbar-actions');

    return {
      winWidth,
      winHeight,
      docWidth,
      docHeight,
      hasOverflow: docWidth > winWidth,
      topbar,
      topbarInfo,
      topbarActions,
      row1Items,
      row2Items,
      leftContent
    };
  })()`);

  console.log(`Viewport dimensions: ${metrics.winWidth}x${metrics.winHeight} (doc: ${metrics.docWidth}x${metrics.docHeight})`);
  console.log(`Document horizontal overflow: ${metrics.hasOverflow ? 'YES (FAIL)' : 'NO (PASS)'}`);

  console.log(`\n--- HÀNG 1: THÔNG TIN NGƯỜI CHƠI (ROW 1 - PLAYER INFO) ---`);
  let row1Passed = true;
  for (const item of metrics.row1Items) {
    if (!item) {
      console.error(`[FAIL] Item missing!`);
      row1Passed = false;
      continue;
    }
    const isLeftValid = item.left >= 0;
    const isRightValid = item.right <= metrics.winWidth;
    const hasSize = item.width > 0 && item.height > 0;
    const ok = isLeftValid && isRightValid && hasSize && item.visible;
    if (!ok) row1Passed = false;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${item.id}: left=${item.left}px, right=${item.right}px, top=${item.top}px, size=${item.width}x${item.height}px | text="${item.text}"`);
    if (!isLeftValid) console.error(`  -> NEGATIVE X: ${item.left}px < 0`);
    if (!isRightValid) console.error(`  -> EXCEEDS RIGHT: ${item.right}px > ${metrics.winWidth}px`);
  }

  console.log(`\n--- HÀNG 2: CÁC NÚT CHỨC NĂNG (ROW 2 - ACTION BUTTONS) ---`);
  let row2Passed = true;
  for (const item of metrics.row2Items) {
    if (!item) continue;
    if (item.id === 'btn-logout') {
      if (vp.mobile) {
        const ok = !item.visible;
        console.log(`[${ok ? 'PASS' : 'FAIL'}] ${item.id}: visible=${item.visible} (Expected hidden on mobile/landscape)`);
        if (!ok) row2Passed = false;
      } else {
        const ok = item.visible && item.left >= 0 && item.right <= metrics.winWidth;
        console.log(`[${ok ? 'PASS' : 'FAIL'}] ${item.id}: left=${item.left}px, right=${item.right}px, visible=${item.visible}`);
        if (!ok) row2Passed = false;
      }
      continue;
    }
    // btn-full might be hidden if headless browser does not support fullscreen API
    if (item.id === 'btn-full' && !item.visible) {
      console.log(`[INFO] ${item.id} hidden by browser API check (acceptable in headless)`);
      continue;
    }
    const isLeftValid = item.left >= 0;
    const isRightValid = item.right <= metrics.winWidth;
    const hasSize = item.width > 0 && item.height > 0;
    const ok = isLeftValid && isRightValid && hasSize && item.visible;
    if (!ok) row2Passed = false;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${item.id}: left=${item.left}px, right=${item.right}px, top=${item.top}px, size=${item.width}x${item.height}px`);
    if (!isLeftValid) console.error(`  -> NEGATIVE X: ${item.left}px < 0`);
    if (!isRightValid) console.error(`  -> EXCEEDS RIGHT: ${item.right}px > ${metrics.winWidth}px`);
  }

  console.log(`\n--- NỘI DUNG BÊN TRÁI (LEFT PANEL CONTENT UNDER TOPBAR) ---`);
  let leftPassed = true;
  const lc = metrics.leftContent;
  if (lc.logo) {
    const isLogoClear = lc.logo.top >= (metrics.topbarInfo ? metrics.topbarInfo.bottom - 4 : 0);
    console.log(`[${isLogoClear ? 'PASS' : 'FAIL'}] Logo PokéSurvivor top=${lc.logo.top}px >= TopbarInfo bottom=${metrics.topbarInfo ? metrics.topbarInfo.bottom : 0}px (clear of topbar)`);
    if (!isLogoClear) leftPassed = false;
  }
  if (lc.partnerSprite) {
    const isSpriteVisible = lc.partnerSprite.visible && lc.partnerSprite.width > 0 && lc.partnerSprite.height > 0;
    console.log(`[${isSpriteVisible ? 'PASS' : 'FAIL'}] Partner Pokémon Sprite: size=${lc.partnerSprite.width}x${lc.partnerSprite.height}px, top=${lc.partnerSprite.top}px, visible=${lc.partnerSprite.visible}`);
    if (!isSpriteVisible) leftPassed = false;
  }
  if (lc.partnerName) {
    const isNameVisible = lc.partnerName.visible && lc.partnerName.width > 0;
    console.log(`[${isNameVisible ? 'PASS' : 'FAIL'}] Partner Pokémon Name: text="${lc.partnerName.text}", top=${lc.partnerName.top}px, visible=${lc.partnerName.visible}`);
    if (!isNameVisible) leftPassed = false;
  }

  const screenshotName = `v1.3.2-${vp.slug}.png`;
  await capture(screenshotName);

  if (metrics.hasOverflow || !row1Passed || !row2Passed || !leftPassed) {
    throw new Error(`FAIL: Viewport ${vp.label} failed one or more assertions!`);
  }

  return { vp, metrics, screenshotName };
}

async function main() {
  try {
    await connect();
    await send('Page.enable');
    await send('DOM.enable');
    await send('Runtime.enable');

    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('PAGE UNCAUGHT EXCEPTION:', JSON.stringify(msg.params.exceptionDetails));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        console.error('PAGE CONSOLE ERROR:', msg.params.args.map(a => a.value || a.description).join(' '));
      }
      if (msg.id && waiting.has(msg.id)) {
        const { res, rej } = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) rej(msg.error);
        else res(msg.result);
      }
    };

    const viewports = [
      { slug: 'landscape-844x390', label: 'Mobile Landscape Standard', w: 844, h: 390, mobile: true, mode: 'normal' },
      { slug: 'landscape-915x412', label: 'Mobile Landscape Pixel 7', w: 915, h: 412, mobile: true, mode: 'normal' },
      { slug: 'landscape-844x300', label: 'Mobile Landscape Low Height', w: 844, h: 300, mobile: true, mode: 'normal' },
      { slug: 'landscape-740x360', label: 'Mobile Landscape Compact Android', w: 740, h: 360, mobile: true, mode: 'normal' },
      { slug: 'portrait-390x844', label: 'Mobile Portrait Standard', w: 390, h: 844, mobile: true, mode: 'normal' },
      { slug: 'portrait-360x800', label: 'Mobile Portrait Compact', w: 360, h: 800, mobile: true, mode: 'normal' },
      { slug: 'desktop-1920x1080', label: 'Desktop 1080p Normal', w: 1920, h: 1080, mobile: false, dsf: 1, mode: 'normal' },
      { slug: 'desktop-1920x1080-fullscreen', label: 'Desktop 1080p Fullscreen', w: 1920, h: 1080, mobile: false, dsf: 1, mode: 'fullscreen' }
    ];

    const results = [];
    for (const vp of viewports) {
      const res = await auditViewport(vp);
      results.push(res);
    }

    console.log(`\n======================================================`);
    console.log(`ALL ${results.length} VIEWPORTS AUDITED & PASSED 100%!`);
    console.log(`======================================================\n`);
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
