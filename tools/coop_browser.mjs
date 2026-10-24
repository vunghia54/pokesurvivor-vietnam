import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTS = [9341, 9342, 9343, 9344];
const SERVER_URL = 'http://127.0.0.1:8766/dev.html';
const SCREENSHOT_DIR = path.resolve('tools/cache/v13-audit/screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class BrowserClient {
  constructor(name, port) {
    this.name = name;
    this.port = port;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-coop-4p-${name}-`));
    this.chrome = null;
    this.ws = null;
    this.seq = 0;
    this.waiting = new Map();
  }

  async launch() {
    this.chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profile}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720',
      'about:blank'
    ], { stdio: 'ignore', windowsHide: true });
    this.chrome.on('error', e => { this.launchError = e; });

    let target;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        target = list.find(t => t.type === 'page');
      } catch (e) {}
    }
    if (this.launchError) throw this.launchError;
    if (!target) throw new Error(`Chrome [${this.name}] remote debugging did not respond`);

    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res);
      this.ws.addEventListener('error', rej);
    });

    this.ws.addEventListener('message', m => {
      const d = JSON.parse(m.data);
      if (d.id && this.waiting.has(d.id)) {
        const w = this.waiting.get(d.id);
        this.waiting.delete(d.id);
        if (d.error) w.rej(new Error(`${w.method}: ${d.error.message}`));
        else w.res(d.result);
      }
    });

    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej, method }));
  }

  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`[${this.name}] ${expr.slice(0, 100)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result.value;
  }

  async screenshot(filename) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`[OK] Screenshot [${this.name}]: ${filename} (${buf.length} bytes)`);
    return outPath;
  }

  async close() {
    try { if (this.ws) this.ws.close(); } catch (e) {}
    try { if (this.chrome) this.chrome.kill(); } catch (e) {}
    await sleep(250);
    // Retain isolated profiles as evidence; no recursive deletion of user paths.
  }
}

export async function waitForGameBoot(client, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await client.ev(`(() => {
        if (typeof G === 'undefined' || !G.DB || !G.Flow || G.DB.mode !== 'cloud') return null;
        return {
          booted: true,
          mode: G.DB.mode,
          hasFb: !!G.DB.fb,
          emulator: !!(G.DB.fb && G.DB.fb.emulator)
        };
      })()`);
      if (res && res.booted && res.hasFb && res.emulator) {
        return res;
      }
    } catch (e) {}
    await sleep(250);
  }
  throw new Error(`[${client.name}] Timeout chờ game boot và Firebase Emulator kết nối`);
}

