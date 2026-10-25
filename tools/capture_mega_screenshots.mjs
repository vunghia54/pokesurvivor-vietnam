import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 8769;
const CDP_PORT = 9597;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/d9d8ca79-347d-4dd3-821a-6cabc143c71b/screenshots';
const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(LOCAL_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json'
};

function createLocalServer() {
  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/dev.html';
    const filePath = path.join(process.cwd(), urlPath);

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found');
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return new Promise(res => server.listen(PORT, '127.0.0.1', () => res(server)));
}

async function run() {
  console.log('1. Khởi động server HTTP thử nghiệm local trên port', PORT);
  const server = await createLocalServer();

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-mega-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
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
    return new Promise((res, rej) => waiting.set(id, { res, rej }));
  }

  async function evalExpr(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result?.value;
  }

  async function saveScreenshot(filename) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    const p1 = path.join(LOCAL_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(p1, buf);
    fs.writeFileSync(p2, buf);
    console.log(`  -> Đã chụp ảnh: ${filename} (${buf.length} bytes)`);
  }

  try {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
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

    console.log('2. Điều hướng đến dev.html...');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` });
    await sleep(3000);

    // Tap to start
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg && !bg.classList.contains('hidden')) bg.click();
      })()
    `);
    await sleep(1500);

    // Chụp BEFORE và AFTER cho 4 Pokémon Mega thử nghiệm
    const mons = [
      { dex: 6, name: 'Charizard', prefix: 'mega_charizard' },
      { dex: 94, name: 'Gengar', prefix: 'mega_gengar' },
      { dex: 448, name: 'Lucario', prefix: 'mega_lucario' },
      { dex: 282, name: 'Gardevoir', prefix: 'mega_gardevoir' }
    ];

    await send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 500, deviceScaleFactor: 2, mobile: false, fitWindow: false
    });

    for (const m of mons) {
      console.log(`\n=== Kiểm thử dạng: ${m.name} (Dex ${m.dex}) ===`);
      // 1. Vào trận với Pokémon này
      await evalExpr(`
        (() => {
          G.DB.save.partner = ${m.dex};
          G.Game.startRun();
        })()
      `);
      await sleep(1200);

      // Chụp BEFORE
      await saveScreenshot(`${m.prefix}_before.png`);

      // 2. Kích hoạt Mega
      await evalExpr(`
        (() => {
          const pl = G.Game.player;
          G.Mega.trigger(pl);
        })()
      `);
      // Đợi hoàn thành hiệu ứng tiến hóa Mega (1.2s) + hào quang xoay
      await sleep(1500);

      // Chụp AFTER
      await saveScreenshot(`${m.prefix}_after.png`);

      // Thoát trận quay về Menu
      await evalExpr(`
        (() => {
          G.Game.quit();
          G.Game.toUI();
          G.MenuUI.open();
        })()
      `);
      await sleep(600);
    }

    // Kiểm tra 4 Viewports theo yêu cầu
    console.log('\n=== Kiểm tra 4 Viewports: 844x390, 915x412, 390x844, 1920x1080 ===');
    const viewports = [
      { w: 844, h: 390, mobile: true, name: 'viewport_844x390.png' },
      { w: 915, h: 412, mobile: true, name: 'viewport_915x412.png' },
      { w: 390, h: 844, mobile: true, name: 'viewport_390x844.png' },
      { w: 1920, h: 1080, mobile: false, name: 'viewport_1920x1080.png' }
    ];

    for (const vp of viewports) {
      console.log(`Chụp Viewport ${vp.w}x${vp.h} (${vp.name})...`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile, fitWindow: false
      });

      // Bắt đầu trận với Lucario Mega
      await evalExpr(`
        (() => {
          G.DB.save.partner = 448;
          G.Game.startRun();
          const pl = G.Game.player;
          G.Mega.trigger(pl);
        })()
      `);
      await sleep(1500);

      await saveScreenshot(vp.name);

      await evalExpr(`
        (() => {
          G.Game.quit();
          G.Game.toUI();
          G.MenuUI.open();
        })()
      `);
      await sleep(400);
    }

    console.log('\nSố lỗi console JavaScript ghi nhận:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.warn('Lỗi console:', consoleErrors);
    }

    console.log('>>> TOÀN BỘ CHỤP ẢNH VÀ ĐO KIỂM VIEWPORT ĐÃ HOÀN TẤT THÀNH CÔNG! <<<');

  } finally {
    if (ws) try { ws.close(); } catch {}
    try { chrome.kill(); } catch {}
    server.close();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch(e => {
  console.error('Lỗi chụp ảnh:', e);
  process.exit(1);
});
