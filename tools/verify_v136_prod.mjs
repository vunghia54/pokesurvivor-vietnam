import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9591;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function verifyProd() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-prod-v136-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
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
    return new Promise((res, rej) => waiting.set(id, { res, rej, method }));
  }

  async function evalExpr(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error('Eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result?.value;
  }

  try {
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

    if (!ws) throw new Error('Could not connect to Chrome CDP');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 844, height: 390, deviceScaleFactor: 2, mobile: true, fitWindow: false
    });

    console.log('Navigating to http://localhost:8766/index.html (Production bundle)...');
    await send('Page.navigate', { url: 'http://localhost:8766/index.html' });
    await sleep(2000);

    // Click tap-start
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
      })()
    `);
    await sleep(600);

    // Click guest button
    await evalExpr(`
      (() => {
        const bg = document.getElementById('btn-guest');
        if (bg) bg.click();
      })()
    `);
    await sleep(600);

    const docState = await evalExpr(`
      (() => {
        return {
          title: document.title,
          hasCanvas: !!document.getElementById('canvas'),
          topbarVisible: !document.getElementById('topbar')?.classList.contains('hidden'),
          menuVisible: !document.getElementById('scr-menu')?.classList.contains('hidden')
        };
      })()
    `);

    console.log('Production DOM state:', docState);
    console.log('Production Console errors:', consoleErrors);

    if (consoleErrors.length > 0) {
      throw new Error('Production bundle had console errors: ' + JSON.stringify(consoleErrors));
    }
    console.log('PROD VERIFICATION SUCCESS: 0 console errors!');
  } finally {
    try { chrome.kill(); } catch {}
  }
}

verifyProd().catch(e => {
  console.error(e);
  process.exit(1);
});
