/**
 * tools/test_all_36_browser.mjs
 * Real Chrome browser testing of all 36 playable Mega Evolution forms:
 * - Form activation & evolution in live Canvas
 * - 0 Console errors
 * - 0 HTTP 404s (Network monitoring via CDP)
 * - Canvas render verification
 * - Reversion after duration
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 8790;
const CDP_PORT = 9640;
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

class BrowserSession {
  constructor(name, cdpPort) {
    this.name = name;
    this.cdpPort = cdpPort;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-all36-${name}-`));
    this.ws = null;
    this.seq = 0;
    this.waiting = new Map();
    this.consoleErrors = [];
    this.network404s = [];
    this.chrome = null;
  }

  async launch() {
    this.chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${this.cdpPort}`,
      `--user-data-dir=${this.profile}`,
      '--autoplay-policy=no-user-gesture-required',
      'about:blank'
    ], { stdio: 'ignore' });

    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.cdpPort}/json`);
        const list = await res.json();
        const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://')) || list.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          this.ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
            this.ws.onmessage = e => {
              const msg = JSON.parse(e.data);
              if (msg.method === 'Runtime.consoleAPICalled') {
                if (msg.params.type === 'error') {
                  const text = msg.params.args?.map(a => a.value || a.description || JSON.stringify(a)).join(' ') || 'error';
                  this.consoleErrors.push(text);
                }
              } else if (msg.method === 'Network.responseReceived') {
                if (msg.params.response.status === 404) {
                  this.network404s.push(msg.params.response.url);
                }
              } else if (msg.id && this.waiting.has(msg.id)) {
                const { res, rej } = this.waiting.get(msg.id);
                this.waiting.delete(msg.id);
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
    if (!this.ws) throw new Error(`Could not connect Chrome via CDP`);

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 1080, height: 600, deviceScaleFactor: 1.5, mobile: false, fitWindow: false
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }

  async evalExpr(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(`Eval failed: ` + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result?.value;
  }

  async captureScreenshot(filename) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(path.join(LOCAL_DIR, filename), buf);
    fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
  }

  async close() {
    try { if (this.ws) this.ws.close(); } catch {}
    try { if (this.chrome) this.chrome.kill(); } catch {}
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  const server = await createLocalServer();
  console.log(`Server running at http://127.0.0.1:${PORT}`);

  const session = new BrowserSession('all36_browser', CDP_PORT);
  await session.launch();

  console.log('Navigating to http://127.0.0.1:' + PORT + '/dev.html ...');
  await session.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` });

  // Wait for game initialization
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      ready = await session.evalExpr(`typeof window.G === 'object' && !!window.G.Mega && !!window.G.Game && !!window.G.Sprites`);
      if (ready) break;
    } catch {}
    await sleep(250);
  }
  if (!ready) throw new Error('Game failed to initialize window.G');

  // Start solo run to create canvas and player context
  await session.evalExpr(`
    G.DB.playAsGuest();
    G.DB.save.partner = 6;
    G.Flow.goMenu();
    G.Flow.play();
  `);
  await sleep(1000);

  // Retrieve all 36 ready forms
  const readyForms = await session.evalExpr(`
    Object.entries(G.Mega.FORMS)
      .filter(([k, v]) => v.spriteAvailable)
      .map(([k, v]) => ({
        id: k,
        baseDex: v.baseDex,
        name: v.name,
        stone: v.stone,
        spriteId: v.spriteId
      }))
  `);

  console.log(`Testing all ${readyForms.length} forms in real browser Canvas...\n`);

  const results = [];

  for (let i = 0; i < readyForms.length; i++) {
    const form = readyForms[i];
    const initialErrors = session.consoleErrors.length;
    const initial404s = session.network404s.length;

    console.log(`[${i + 1}/${readyForms.length}] Testing ${form.name} (${form.id}, Base Dex #${form.baseDex})...`);

    const formReport = await session.evalExpr(`
      (async () => {
        try {
          const baseMon = G.DEX_BY[${form.baseDex}];
          if (!baseMon) return { success: false, error: 'Base Pokemon not found' };

          // Set preference
          G.Mega.setPreference(baseMon.dex, '${form.id}');

          // Morph player into this base mon
          const pl = G.Game.player;
          pl.mon = baseMon;
          pl.dex = baseMon.dex;
          pl.types = [...baseMon.types];
          pl.baseMaxHp = baseMon.hp;
          pl.anim = new G.Sprites.Animator(baseMon.dex, pl.scale, pl.shiny);

          // Start Mega run cycle
          G.Mega.onRunStart(pl);

          if (pl.megaState !== 'MEGA_READY') {
            return { success: false, error: 'megaState not ready: ' + pl.megaState };
          }

          // Trigger
          const ok = G.Mega.trigger(pl);
          if (!ok) return { success: false, error: 'G.Mega.trigger returned false' };

          // Complete evolution
          G.Mega.update(pl, 1.3);
          if (pl.megaState !== 'MEGA_ACTIVE') {
            return { success: false, error: 'Evolution failed: ' + pl.megaState };
          }

          // Render 3 frames through actual Canvas 2D
          for (let f = 0; f < 3; f++) {
            pl.update(0.016, 0);
            G.Mega.update(pl, 0.016);
            if (G.Game.ctx) {
              G.Game.ctx.save();
              G.Mega.drawAura(G.Game.ctx, pl);
              if (pl.anim) pl.anim.draw(G.Game.ctx, pl.x, pl.y, pl.facing, 0.016);
              G.Game.ctx.restore();
            }
          }

          // Check double trigger rejection
          const doubleTrigger = G.Mega.trigger(pl);
          if (doubleTrigger) {
            return { success: false, error: 'Allowed double trigger' };
          }

          // Advance 25 seconds for reversion
          G.Mega.update(pl, 25.5);
          if (pl.megaState !== 'MEGA_USED' || pl.megaForm !== null) {
            return { success: false, error: 'Reversion failed: ' + pl.megaState };
          }

          return {
            success: true,
            activeSpriteId: pl.anim ? pl.anim.dex : null,
            themeColor: G.Mega.FORMS['${form.id}'].themeColor,
          };
        } catch (e) {
          return { success: false, error: e.message || String(e) };
        }
      })()
    `);

    // Wait slightly for any lazy network responses
    await sleep(80);

    const newErrors = session.consoleErrors.slice(initialErrors);
    const new404s = session.network404s.slice(initial404s);

    const pass = formReport.success && newErrors.length === 0 && new404s.length === 0;

    results.push({
      index: i + 1,
      formId: form.id,
      name: form.name,
      baseDex: form.baseDex,
      canvasPass: formReport.success,
      errors: newErrors,
      http404s: new404s,
      pass,
      errorMsg: formReport.error || (newErrors.length ? newErrors.join('; ') : (new404s.length ? 'HTTP 404: ' + new404s.join(', ') : null))
    });

    if (!pass) {
      console.log(`  --> FAILED: ${results[results.length - 1].errorMsg}`);
    } else {
      console.log(`  --> PASS (Canvas OK, 0 errors, 0 404s)`);
    }
  }

  // Capture final verification screenshot
  await session.captureScreenshot('browser_36_megas_validation.png');

  await session.close();
  server.close();

  // Print Summary Table
  console.log(`\n\n==================== BẢNG KẾT QUẢ KIỂM ĐỊNH TRÌNH DUYỆT THẬT (36 DẠNG) ====================`);
  console.log(`| STT | Form ID | Tên Mega | Base Dex | Canvas Draw | Console Errors | HTTP 404 | Trạng thái |`);
  console.log(`|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|`);

  let passCount = 0;
  for (const r of results) {
    if (r.pass) passCount++;
    console.log(`| ${r.index} | \`${r.formId}\` | **${r.name}** | #${r.baseDex} | ${r.canvasPass ? '✓ OK' : '❌ Lỗi'} | ${r.errors.length === 0 ? '✓ 0' : '❌ ' + r.errors.length} | ${r.http404s.length === 0 ? '✓ 0' : '❌ ' + r.http404s.length} | ${r.pass ? '✅ PASS' : '❌ FAIL'} |`);
  }

  console.log(`\n========================================================================================`);
  console.log(`TỔNG KẾT TRÌNH DUYỆT THẬT: ${passCount}/${results.length} PASS`);
  console.log(`========================================================================================`);

  if (passCount !== results.length) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
