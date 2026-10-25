import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9597;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runCanvasDiagnosis() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-canvas-diag-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let ws, seq = 0;
  const waiting = new Map();

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
              if (msg.id && waiting.has(msg.id)) {
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

    console.log('--- KIỂM TRA HÀNH VI CANVAS API: ELLIPSE BATCHING ---');
    const diag = await evalExpr(`
      (() => {
        // Tạo 3 canvas để so sánh
        const w = 600, h = 400;
        const pts = [
          { x: 100, y: 100, r: 20 },
          { x: 500, y: 100, r: 20 },
          { x: 300, y: 300, r: 20 }
        ];
        // Điểm ở giữa tam giác: (300, 160)
        const testX = 300, testY = 160;

        // 1. Buggy v1.3.6: beginPath một lần, không có moveTo
        const c1 = document.createElement('canvas');
        c1.width = w; c1.height = h;
        const ctx1 = c1.getContext('2d');
        ctx1.fillStyle = 'rgba(0,0,0,0.25)';
        ctx1.beginPath();
        for (const p of pts) {
          ctx1.ellipse(p.x, p.y, p.r * 0.9, p.r * 0.38, 0, 0, Math.PI * 2);
        }
        ctx1.fill();
        const pixel1 = ctx1.getImageData(testX, testY, 1, 1).data;

        // 2. Fixed với moveTo(x + rx, y)
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const ctx2 = c2.getContext('2d');
        ctx2.fillStyle = 'rgba(0,0,0,0.25)';
        ctx2.beginPath();
        for (const p of pts) {
          const rx = p.r * 0.9, ry = p.r * 0.38;
          ctx2.moveTo(p.x + rx, p.y);
          ctx2.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
        }
        ctx2.fill();
        const pixel2 = ctx2.getImageData(testX, testY, 1, 1).data;

        // 3. v1.3.5: beginPath/fill riêng cho từng ellipse
        const c3 = document.createElement('canvas');
        c3.width = w; c3.height = h;
        const ctx3 = c3.getContext('2d');
        ctx3.fillStyle = 'rgba(0,0,0,0.25)';
        for (const p of pts) {
          ctx3.beginPath();
          ctx3.ellipse(p.x, p.y, p.r * 0.9, p.r * 0.38, 0, 0, Math.PI * 2);
          ctx3.fill();
        }
        const pixel3 = ctx3.getImageData(testX, testY, 1, 1).data;

        return {
          buggyCenterAlpha: pixel1[3],      // Nếu > 0: bị lỗi tam giác khổng lồ!
          fixedMoveToCenterAlpha: pixel2[3],// Cần bằng 0 (trong suốt)
          v135CenterAlpha: pixel3[3],       // Cần bằng 0 (trong suốt)
          isBuggyReproduced: pixel1[3] > 0,
          isFixedWithMoveTo: pixel2[3] === 0,
          isFixedSameAsV135: pixel2[3] === pixel3[3]
        };
      })()
    `);

    console.log('Kết quả chẩn đoán Canvas:', diag);
    return diag;
  } finally {
    try { chrome.kill(); } catch {}
  }
}

runCanvasDiagnosis().catch(console.error);
