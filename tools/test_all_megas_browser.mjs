import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 8788;
const CDP_PORT = 9630;
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
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-all-megas-${name}-`));
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

  const session = new BrowserSession('mega_test', CDP_PORT);
  await session.launch();

  console.log('Navigating to game...');
  await session.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` });

  // Wait for G to initialize
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      ready = await session.evalExpr(`typeof window.G === 'object' && !!window.G.Mega && !!window.G.Game`);
      if (ready) break;
    } catch {}
    await sleep(250);
  }
  console.log(`Game engine ready: ${ready}`);

  // Test across multiple Mega forms
  const samples = [
    { dex: 150, name: 'Mega Mewtwo Y' },
    { dex: 384, name: 'Mega Rayquaza' },
    { dex: 208, name: 'Mega Steelix' },
    { dex: 65, name: 'Mega Alakazam' },
    { dex: 807, name: 'Mega Zeraora' }
  ];

  for (const s of samples) {
    console.log(`Testing in-engine: ${s.name} (#${s.dex})...`);
    const res = await session.evalExpr(`(() => {
      G.DB.playAsGuest();
      const mon = G.DEX.find(x => x.dex === ${s.dex});
      const pl = new G.Player(mon, {}, false);
      G.Mega.onRunStart(pl);
      const can = G.Mega.canTrigger(pl);
      G.Mega.trigger(pl);
      G.Mega.update(pl, 1.3);
      return {
        can,
        state: pl.megaState,
        form: pl.megaForm ? pl.megaForm.name : null,
        types: pl.types,
        animDex: pl.anim ? pl.anim.dex : null
      };
    })()`);
    console.log(`  Result for #${s.dex}:`, res);
  }

  // Play as Mega Mewtwo Y and capture screenshot
  console.log('Starting live run with Mega Mewtwo Y...');
  await session.evalExpr(`(() => {
    G.DB.playAsGuest();
    G.DB.save.partner = 150;
    G.Flow.goMenu();
    G.Flow.play();
    const pl = G.Game.player;
    if (pl) {
      G.Mega.trigger(pl);
      G.Mega.update(pl, 1.3);
    }
  })()`);
  await sleep(1500);
  await session.captureScreenshot('browser_in_game_mega_mewtwo_y.png');

  // Play as Mega Rayquaza and capture screenshot
  console.log('Starting live run with Mega Rayquaza...');
  await session.evalExpr(`(() => {
    if (G.Game.state !== 'ui') G.Game.toUI();
    G.DB.save.partner = 384;
    G.Flow.goMenu();
    G.Flow.play();
    const pl = G.Game.player;
    if (pl) {
      G.Mega.trigger(pl);
      G.Mega.update(pl, 1.3);
    }
  })()`);
  await sleep(1500);
  await session.captureScreenshot('browser_in_game_mega_rayquaza.png');

  console.log(`Browser tests finished. Console errors: ${session.consoleErrors.length}`);
  if (session.consoleErrors.length > 0) {
    console.warn('Errors:', session.consoleErrors);
  }

  await session.close();
  server.close();
  process.exit(session.consoleErrors.length === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
