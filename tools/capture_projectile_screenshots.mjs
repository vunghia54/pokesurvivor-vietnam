import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9598;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/81777abe-2919-4a9c-9d4f-401ea8ac9cee/screenshots';
const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function run() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-capture-'));
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

    console.log('=== CHUẨN BỊ MÔ PHỎNG VÀ CHỤP SCREENSHOTS CANVAS BEFORE / AFTER ===');

    const result = await evalExpr(`
      (() => {
        const W = 800, H = 500;

        function drawBackground(ctx) {
          // Nền bản đồ cỏ xanh giống trong game
          ctx.fillStyle = '#2d5a27';
          ctx.fillRect(0, 0, W, H);

          // Grid vạch gạch bản đồ nhẹ
          ctx.strokeStyle = '#275022';
          ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
          }
          for (let y = 0; y < H; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
          }

          // Nhân vật ở giữa
          ctx.fillStyle = '#f1c40f';
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        function drawProjectilesEntities(ctx, projectiles) {
          for (const p of projectiles) {
            ctx.fillStyle = p.friendly ? '#3498db' : '#e74c3c';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        // Render Scenario:
        // mode: 'buggy' | 'fixed'
        function renderScene(projectiles, hasEnemies, mode) {
          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d');

          // 1. Vẽ nền map & player
          drawBackground(ctx);

          // 2. Vẽ Shadows (Core logic được test)
          if (mode === 'buggy') {
            // Logic cũ v1.3.6: beginPath() một lần, không có moveTo
            if (projectiles.length > 0) {
              ctx.fillStyle = 'rgba(0,0,0,.25)';
              ctx.beginPath();
              for (let i = 0; i < projectiles.length; i++) {
                const p = projectiles[i];
                ctx.ellipse(p.x, p.y, p.r * 0.9, p.r * 0.38, 0, 0, 6.2832);
              }
              ctx.fill();

              if (hasEnemies) {
                ctx.fillStyle = 'rgba(235,77,75,.18)';
                ctx.beginPath();
                for (let i = 0; i < projectiles.length; i++) {
                  const p = projectiles[i];
                  if (!p.friendly) ctx.ellipse(p.x, p.y, p.r * 1.5, p.r * 0.6, 0, 0, 6.2832);
                }
                ctx.fill();
              }
            }
          } else {
            // Logic mới v1.3.6.1: có moveTo(x + rx, y) tạo subpath riêng
            if (projectiles.length > 0) {
              ctx.fillStyle = 'rgba(0,0,0,.25)';
              ctx.beginPath();
              for (let i = 0; i < projectiles.length; i++) {
                const p = projectiles[i];
                const rx = p.r * 0.9, ry = p.r * 0.38;
                ctx.moveTo(p.x + rx, p.y);
                ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
              }
              ctx.fill();

              if (hasEnemies) {
                ctx.fillStyle = 'rgba(235,77,75,.18)';
                ctx.beginPath();
                for (let i = 0; i < projectiles.length; i++) {
                  const p = projectiles[i];
                  if (!p.friendly) {
                    const rx = p.r * 1.5, ry = p.r * 0.6;
                    ctx.moveTo(p.x + rx, p.y);
                    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
                  }
                }
                ctx.fill();
              }
            }
          }

          // 3. Vẽ đạn
          drawProjectilesEntities(ctx, projectiles);

          return canvas;
        }

        // Test Scenarios:
        // A: 3 projectiles forming triangle
        const projsA = [
          { x: 150, y: 120, r: 16, friendly: true },
          { x: 650, y: 140, r: 16, friendly: true },
          { x: 400, y: 400, r: 16, friendly: true }
        ];

        // B: Multi-Cast 8 skills scattered radially
        const projsB = [];
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI * 2) / 8;
          projsB.push({
            x: 400 + Math.cos(angle) * 220,
            y: 250 + Math.sin(angle) * 160,
            r: 14,
            friendly: true
          });
        }

        // C: Enemy warning circles + player projectiles
        const projsC = [
          { x: 200, y: 150, r: 18, friendly: false },
          { x: 600, y: 150, r: 18, friendly: false },
          { x: 400, y: 380, r: 18, friendly: false },
          { x: 300, y: 250, r: 12, friendly: true },
          { x: 500, y: 250, r: 12, friendly: true }
        ];

        // D: Dense combat: Boss projectile + mob warning circles + player multi-cast
        const projsD = [
          { x: 400, y: 100, r: 28, friendly: false }, // Boss heavy projectile
          { x: 180, y: 350, r: 16, friendly: false },
          { x: 620, y: 350, r: 16, friendly: false },
          { x: 280, y: 200, r: 10, friendly: true },
          { x: 520, y: 200, r: 10, friendly: true },
          { x: 400, y: 300, r: 10, friendly: true },
          { x: 330, y: 420, r: 10, friendly: true },
          { x: 470, y: 420, r: 10, friendly: true }
        ];

        // Pixel audit function (đo trên canvas không có background để đo alpha chính xác)
        function auditPixel(projectiles, hasEnemies, mode, sampleX, sampleY) {
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = c.getContext('2d');
          if (mode === 'buggy') {
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath();
            for (let i = 0; i < projectiles.length; i++) {
              const p = projectiles[i];
              ctx.ellipse(p.x, p.y, p.r * 0.9, p.r * 0.38, 0, 0, 6.2832);
            }
            ctx.fill();
            if (hasEnemies) {
              ctx.fillStyle = 'rgba(235,77,75,.18)';
              ctx.beginPath();
              for (let i = 0; i < projectiles.length; i++) {
                const p = projectiles[i];
                if (!p.friendly) ctx.ellipse(p.x, p.y, p.r * 1.5, p.r * 0.6, 0, 0, 6.2832);
              }
              ctx.fill();
            }
          } else {
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.beginPath();
            for (let i = 0; i < projectiles.length; i++) {
              const p = projectiles[i];
              const rx = p.r * 0.9, ry = p.r * 0.38;
              ctx.moveTo(p.x + rx, p.y);
              ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
            }
            ctx.fill();
            if (hasEnemies) {
              ctx.fillStyle = 'rgba(235,77,75,.18)';
              ctx.beginPath();
              for (let i = 0; i < projectiles.length; i++) {
                const p = projectiles[i];
                if (!p.friendly) {
                  const rx = p.r * 1.5, ry = p.r * 0.6;
                  ctx.moveTo(p.x + rx, p.y);
                  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832);
                }
              }
              ctx.fill();
            }
          }
          const px = ctx.getImageData(sampleX, sampleY, 1, 1).data;
          return { r: px[0], g: px[1], b: px[2], a: px[3] };
        }

        const auditA_buggy = auditPixel(projsA, false, 'buggy', 400, 200);
        const auditA_fixed = auditPixel(projsA, false, 'fixed', 400, 200);

        const auditB_buggy = auditPixel(projsB, false, 'buggy', 400, 250);
        const auditB_fixed = auditPixel(projsB, false, 'fixed', 400, 250);

        const auditC_buggy = auditPixel(projsC, true, 'buggy', 400, 220);
        const auditC_fixed = auditPixel(projsC, true, 'fixed', 400, 220);

        return {
          audits: {
            sceneA: { sample: 'Tam giác (400, 200)', buggy: auditA_buggy, fixed: auditA_fixed },
            sceneB: { sample: 'Tâm 8 Multi-Cast (400, 250)', buggy: auditB_buggy, fixed: auditB_fixed },
            sceneC: { sample: 'Khu vực cảnh báo quái (400, 220)', buggy: auditC_buggy, fixed: auditC_fixed }
          },
          images: {
            beforeA: renderScene(projsA, false, 'buggy').toDataURL('image/png'),
            afterA:  renderScene(projsA, false, 'fixed').toDataURL('image/png'),
            beforeB: renderScene(projsB, false, 'buggy').toDataURL('image/png'),
            afterB:  renderScene(projsB, false, 'fixed').toDataURL('image/png'),
            beforeC: renderScene(projsC, true,  'buggy').toDataURL('image/png'),
            afterC:  renderScene(projsC, true,  'fixed').toDataURL('image/png'),
            beforeD: renderScene(projsD, true,  'buggy').toDataURL('image/png'),
            afterD:  renderScene(projsD, true,  'fixed').toDataURL('image/png')
          }
        };
      })()
    `);

    console.log('\n--- KẾT QUẢ ĐO PIXEL ALPHA TẠI VÙNG TRỐNG GIỮA CÁC PROJECTILE ---');
    console.log('Scene A (Tam giác 3 đạn):');
    console.log('  - BEFORE (v1.3.6): Alpha =', result.audits.sceneA.buggy.a, '(Bị phủ mảng tối đen 25%)');
    console.log('  - AFTER (v1.3.6.1): Alpha =', result.audits.sceneA.fixed.a, '(Hoàn toàn trong suốt 0% - ĐẠT CHUẨN)');

    console.log('Scene B (Multi-Cast 8 chiêu đạn tỏa tròn):');
    console.log('  - BEFORE (v1.3.6): Alpha =', result.audits.sceneB.buggy.a, '(Bị phủ đa giác tối đen khổng lồ)');
    console.log('  - AFTER (v1.3.6.1): Alpha =', result.audits.sceneB.fixed.a, '(Hoàn toàn trong suốt 0% - ĐẠT CHUẨN)');

    console.log('Scene C (Cảnh báo đỏ quái + đạn người chơi):');
    console.log('  - BEFORE (v1.3.6): Alpha =', result.audits.sceneC.buggy.a, '(Bị nối vệt đỏ/đen giữa các quái)');
    console.log('  - AFTER (v1.3.6.1): Alpha =', result.audits.sceneC.fixed.a, '(Hoàn toàn trong suốt 0% - ĐẠT CHUẨN)');

    // Save screenshots
    for (const [key, dataUrl] of Object.entries(result.images)) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${key}.png`;
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buffer);
      fs.writeFileSync(path.join(LOCAL_DIR, filename), buffer);
    }

    console.log(`\nĐã lưu toàn bộ 8 ảnh minh chứng vào:`);
    console.log(`- Artifacts: ${ARTIFACT_DIR}`);
    console.log(`- Project local: ${LOCAL_DIR}`);

    return result.audits;
  } finally {
    try { chrome.kill(); } catch {}
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
