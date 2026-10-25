import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 8789;
const CDP_PORT = 9635;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/d9d8ca79-347d-4dd3-821a-6cabc143c71b/screenshots';
const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');

const VIEWPORTS = [
  { name: 'desktop_1920x1080', w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: 'mobile_landscape_844x390', w: 844, h: 390, dpr: 2, mobile: true },
  { name: 'mobile_portrait_390x844', w: 390, h: 844, dpr: 2, mobile: true },
  { name: 'tablet_landscape_1024x768', w: 1024, h: 768, dpr: 2, mobile: false }
];

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
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-vp-${name}-`));
    this.ws = null;
    this.seq = 0;
    this.waiting = new Map();
    this.consoleErrors = [];
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
    if (!this.ws) throw new Error(`Không thể kết nối Chrome qua CDP`);

    await this.send('Page.enable');
    await this.send('Runtime.enable');
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

  async setViewport(vp) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile, fitWindow: false
    });
  }

  async captureScreenshot(filename) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(path.join(LOCAL_DIR, filename), buf);
    fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
    console.log(`Saved screenshot: ${filename}`);
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

  const session = new BrowserSession('mega_viewports', CDP_PORT);
  await session.launch();

  await session.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` });

  // Wait for G
  for (let i = 0; i < 40; i++) {
    try {
      const ready = await session.evalExpr(`typeof window.G === 'object' && !!window.G.Mega && !!window.G.Game`);
      if (ready) break;
    } catch {}
    await sleep(250);
  }

  // Set partner to Mega Lucario and start run
  await session.evalExpr(`(() => {
    G.DB.playAsGuest();
    G.DB.save.partner = 448;
    G.Flow.goMenu();
    G.Flow.play();
    const pl = G.Game.player;
    if (pl) {
      G.Mega.trigger(pl);
      G.Mega.update(pl, 1.3);
    }
  })()`);

  await sleep(1000);

  for (const vp of VIEWPORTS) {
    console.log(`Testing viewport: ${vp.name}...`);
    await session.setViewport(vp);
    await sleep(800);
    await session.captureScreenshot(`viewport_mega_${vp.name}.png`);
  }

  console.log(`Viewport tests finished. Console errors: ${session.consoleErrors.length}`);
  await session.close();
  server.close();
  process.exit(session.consoleErrors.length === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
