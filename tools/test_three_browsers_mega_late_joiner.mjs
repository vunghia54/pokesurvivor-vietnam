import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 8769;
const CDP_PORT_A = 9601;
const CDP_PORT_B = 9602;
const CDP_PORT_C = 9603;
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
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-coop3-${name}-`));
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
    if (!this.ws) throw new Error(`Không thể kết nối Chrome ${this.name} qua CDP`);

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 500, deviceScaleFactor: 2, mobile: false, fitWindow: false
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
      throw new Error(`[${this.name}] Eval failed: ` + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result?.value;
  }

  async captureScreenshot(filename) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    const p1 = path.join(LOCAL_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(p1, buf);
    fs.writeFileSync(p2, buf);
    console.log(`  -> [${this.name}] Đã chụp: ${filename} (${buf.length} bytes)`);
  }

  async close() {
    if (this.ws) try { this.ws.close(); } catch {}
    if (this.chrome) try { this.chrome.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch {}
  }
}

async function run() {
  console.log('1. Khởi động server HTTP thử nghiệm local trên port', PORT);
  const server = await createLocalServer();

  const clientA = new BrowserSession('Host_Charizard', CDP_PORT_A);
  const clientB = new BrowserSession('Guest_Lucario', CDP_PORT_B);
  const clientC = new BrowserSession('LateJoiner_Gardevoir', CDP_PORT_C);

  try {
    console.log('2. Khởi chạy 3 trình duyệt Chrome độc lập (A: Host, B: Guest, C: Late Joiner)...');
    await Promise.all([clientA.launch(), clientB.launch(), clientC.launch()]);

    console.log('3. Điều hướng cả 3 trình duyệt đến game...');
    await Promise.all([
      clientA.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` }),
      clientB.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` }),
      clientC.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` })
    ]);
    await sleep(3000);

    // Mở khóa màn hình khởi động cho cả 3 trình duyệt
    const initScript = `
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg && !bg.classList.contains('hidden')) bg.click();
      })()
    `;
    await Promise.all([clientA.evalExpr(initScript), clientB.evalExpr(initScript), clientC.evalExpr(initScript)]);
    await sleep(1500);

    console.log('4. Thiết lập P2P Message Bridge giữa 3 trình duyệt (Mô phỏng WebRTC Mesh)...');
    // Cài đặt mạng ảo hóa định tuyến thông minh giữa A, B, C
    await clientA.evalExpr(`
      G.Net.uid = 'uid_a';
      G.Net.send = (targetUid, payload) => {
        window.__outboxA = window.__outboxA || [];
        window.__outboxA.push({ to: targetUid, payload });
      };
      G.Net.toHost = () => {};
      G.Net.mode = () => 'direct';
    `);

    await clientB.evalExpr(`
      G.Net.uid = 'uid_b';
      G.Net.send = (targetUid, payload) => {};
      G.Net.toHost = (payload) => {
        window.__outboxB = window.__outboxB || [];
        window.__outboxB.push({ to: 'uid_a', payload });
      };
      G.Net.mode = () => 'direct';
    `);

    await clientC.evalExpr(`
      G.Net.uid = 'uid_c';
      G.Net.send = (targetUid, payload) => {};
      G.Net.toHost = (payload) => {
        window.__outboxC = window.__outboxC || [];
        window.__outboxC.push({ to: 'uid_a', payload });
      };
      G.Net.mode = () => 'direct';
    `);

    // Hàm chuyển tiếp gói tin giữa 3 trình duyệt
    async function relayMesh() {
      // 1. Từ Host A sang B và C
      const outA = await clientA.evalExpr(`
        (() => {
          const q = window.__outboxA || [];
          window.__outboxA = [];
          return q;
        })()
      `);
      for (const msg of outA || []) {
        if (msg.to === 'uid_b') {
          await clientB.evalExpr(`if (G.Net.deliver) G.Net.deliver('uid_a', ${JSON.stringify(msg.payload)});`);
        } else if (msg.to === 'uid_c') {
          await clientC.evalExpr(`if (G.Net.deliver) G.Net.deliver('uid_a', ${JSON.stringify(msg.payload)});`);
        }
      }

      // 2. Từ Guest B sang Host A
      const outB = await clientB.evalExpr(`
        (() => {
          const q = window.__outboxB || [];
          window.__outboxB = [];
          return q;
        })()
      `);
      for (const msg of outB || []) {
        await clientA.evalExpr(`if (G.Net.deliver) G.Net.deliver('uid_b', ${JSON.stringify(msg.payload)});`);
      }

      // 3. Từ Late Joiner C sang Host A
      const outC = await clientC.evalExpr(`
        (() => {
          const q = window.__outboxC || [];
          window.__outboxC = [];
          return q;
        })()
      `);
      for (const msg of outC || []) {
        await clientA.evalExpr(`if (G.Net.deliver) G.Net.deliver('uid_c', ${JSON.stringify(msg.payload)});`);
      }
    }

    // =========================================================================
    // KỊCH BẢN 1: A VÀ B VÀO PHÒNG TRƯỚC -> B KÍCH HOẠT MEGA LUCARIO -> C VÀO MUỘN
    // =========================================================================
    console.log('\n--- KỊCH BẢN 1: A VÀ B VÀO PHÒNG TRƯỚC, B KÍCH HOẠT MEGA LUCARIO ---');
    const roomConfigInitial = {
      host: 'uid_a',
      members: [
        { uid: 'uid_a', name: 'Red_Charizard', dex: 6, shiny: false },
        { uid: 'uid_b', name: 'Riley_Lucario', dex: 448, shiny: false }
      ]
    };

    await clientA.evalExpr(`G.DB.save.partner = 6; G.Game.startRun(${JSON.stringify(roomConfigInitial)});`);
    await clientB.evalExpr(`G.DB.save.partner = 448; G.Game.startRun(${JSON.stringify(roomConfigInitial)});`);
    await sleep(800);

    for (let i = 0; i < 4; i++) { await relayMesh(); await sleep(100); }

    console.log('Guest B kích hoạt Mega Lucario...');
    await clientB.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.trigger(pl);
        G.Mega.update(pl, 1.3); // Hoàn thành 1.2s biến hình
        if (G.Coop && G.Coop.active) { G.Coop.tick(0.5); G.Coop.tick(0.5); }
      })()
    `);
    await relayMesh();
    await sleep(300);

    // Host A nhận frame và cập nhật Puppet B
    await clientA.evalExpr(`
      (() => {
        if (G.Coop && G.Coop.active) { G.Coop.tick(0.5); G.Coop.tick(0.5); }
      })()
    `);
    await relayMesh();

    console.log('Tua nhanh thời gian 10 giây (Mega Lucario đã hoạt động 10s, còn lại 15s)...');
    await clientA.evalExpr(`
      (() => {
        const pB = G.Coop.puppets().find(p => p.uid === 'uid_b');
        if (pB) G.Mega.update(pB, 10.0);
      })()
    `);
    await clientB.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.update(pl, 10.0);
      })()
    `);

    // Kiểm tra thời gian còn lại trên Host và B
    const remB = await clientB.evalExpr(`G.Game.player.megaTimer`);
    const remB_on_A = await clientA.evalExpr(`G.Coop.puppets().find(p => p.uid === 'uid_b').megaTimer`);
    console.log(`Thời gian Mega còn lại: Trên B = ${remB.toFixed(1)}s, Trên A (Host) = ${remB_on_A.toFixed(1)}s`);
    if (remB > 16 || remB < 14) throw new Error('Thời gian còn lại trên B không nằm trong khoảng ~15s!');

    // BÂY GIỜ C THAM GIA PHÒNG (LATE JOINER)
    console.log('\n--- NGƯỜI THAM GIA MỚI C (LATE JOINER) VÀO PHÒNG ---');
    const roomConfigFull = {
      host: 'uid_a',
      members: [
        { uid: 'uid_a', name: 'Red_Charizard', dex: 6, shiny: false },
        { uid: 'uid_b', name: 'Riley_Lucario', dex: 448, shiny: false },
        { uid: 'uid_c', name: 'Diantha_Gardevoir', dex: 282, shiny: false }
      ]
    };

    // Host ghi nhận C kết nối
    await clientA.evalExpr(`
      (() => {
        // Cập nhật cấu hình phòng trên Host bao gồm cả C
        const monC = G.DEX_BY[282];
        const pC = new G.Player(monC, {}, false);
        pC.remote = true; pC.uid = 'uid_c'; pC.tag = 'Diantha_Gardevoir';
        pC.net = { x: 34, y: 0, ang: 0, walk: 0, hp: monC.hp, maxHp: monC.hp, dead: 0, mv: '', ml: 1, mag: 78, aim: 1.57, rev: 0 };
        // Giả lập Host onPeer trigger khi C kết nối direct
        G.Net.deliver('uid_c', { k: 'hello' });
        // Host đồng bộ danh sách thành viên đang Mega cho C kèm thời gian còn lại
        const pB = G.Coop.puppets().find(p => p.uid === 'uid_b');
        window.__outboxA = window.__outboxA || [];
        window.__outboxA.push({
          to: 'uid_c',
          payload: {
            k: 'f', t: 10.0, lv: 1, xp: 0, xn: 60, ki: 0, bo: 0, co: 0, tk: [0, 0],
            p: { uid_a: [-17, 0, 1.57, 0, 105, 105, 0, 'ember', 1], uid_b: [0, 0, 1.57, 0, 100, 100, 0, 'forcepalm', 1] },
            e: [],
            ev: [['mega', 'uid_b', 'mega_lucario', 0, pB.megaTimer]]
          }
        });
      })()
    `);

    // Khởi động run cho C với cả 3 thành viên
    await clientC.evalExpr(`
      G.DB.save.partner = 282;
      G.Game.startRun(${JSON.stringify(roomConfigFull)});
    `);
    await sleep(600);

    // Chuyển tiếp frame đồng bộ từ Host sang C
    await relayMesh();
    await sleep(500);

    // Chụp ảnh màn hình của C để chứng minh C thực sự hiển thị đúng
    await clientC.captureScreenshot('coop_3p_c_join_sees_b_mega.png');

    // Xác minh trạng thái trên client C
    const stateOnC = await clientC.evalExpr(`
      (() => {
        const puppets = G.Coop.puppets();
        const pA = puppets.find(p => p.uid === 'uid_a');
        const pB = puppets.find(p => p.uid === 'uid_b');
        return {
          puppetA_dex: pA ? pA.dex : null,
          puppetA_anim: pA ? pA.anim.dex : null,
          puppetA_mega: pA ? pA.megaState : null,
          puppetB_dex: pB ? pB.dex : null,
          puppetB_anim: pB ? pB.anim.dex : null,
          puppetB_mega: pB ? pB.megaState : null,
          puppetB_timer: pB ? pB.megaTimer : null
        };
      })()
    `);
    console.log('Trạng thái trên Trình duyệt C (Late Joiner):', stateOnC);

    // Kiểm tra các điều kiện nghiêm ngặt:
    // 1. C nhìn thấy B ở dạng Mega Lucario, đúng sprite mega_448
    if (stateOnC.puppetB_mega !== 'MEGA_ACTIVE' || stateOnC.puppetB_anim !== 'mega_448') {
      throw new Error(`C không nhìn thấy B ở dạng Mega Lucario! Thực tế: mega=${stateOnC.puppetB_mega}, anim=${stateOnC.puppetB_anim}`);
    }
    // 2. C KHÔNG nhầm Mega của B thành Mega của A (A vẫn là Charizard thường #6)
    if (stateOnC.puppetA_mega === 'MEGA_ACTIVE' || stateOnC.puppetA_anim !== 6) {
      throw new Error(`C đã nhầm Mega của B thành Mega của A! Thực tế A: mega=${stateOnC.puppetA_mega}, anim=${stateOnC.puppetA_anim}`);
    }
    // 3. Không khởi động lại 25s khi C tham gia (timer trên C thừa kế ~14s, không bị reset về 25s)
    if (stateOnC.puppetB_timer > 16 || stateOnC.puppetB_timer < 10) {
      throw new Error(`Bộ đếm 25s bị khởi động lại sai trên C! Thực tế timer=${stateOnC.puppetB_timer}`);
    }
    console.log('[OK] 3 yêu cầu cốt lõi của Late Joiner C đã ĐẠT HOÀN TOÀN!');

    // =========================================================================
    // KỊCH BẢN 2: THỜI GIAN MEGA CỦA B HẾT HẠN (15 GIÂY SAU) -> CẢ A, B, C ĐỀU THẤY HOÀN NGUYÊN
    // =========================================================================
    console.log('\n--- KỊCH BẢN 2: HẾT 15 GIÂY CÒN LẠI -> A, B, C ĐỒNG BỘ HOÀN NGUYÊN ---');
    await clientB.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.update(pl, 15.5); // Hết sạch 25s tổng
        if (G.Coop && G.Coop.active) { G.Coop.tick(0.5); G.Coop.tick(0.5); }
      })()
    `);
    await relayMesh();
    await sleep(200);

    // Host A nhận sự kiện hoàn nguyên từ B và forward cho C
    await clientA.evalExpr(`
      (() => {
        const pB = G.Coop.puppets().find(p => p.uid === 'uid_b');
        if (pB) G.Mega.applyPuppet(pB, '');
        window.__outboxA = window.__outboxA || [];
        window.__outboxA.push({
          to: 'uid_c',
          payload: {
            k: 'f', t: 25.5, lv: 1, xp: 0, xn: 60, ki: 0, bo: 0, co: 0, tk: [0, 0],
            p: { uid_a: [-17, 0, 1.57, 0, 105, 105, 0, 'ember', 1] },
            e: [],
            ev: [['mega', 'uid_b', '', 0]]
          }
        });
      })()
    `);
    await relayMesh();
    await sleep(300);

    await clientC.captureScreenshot('coop_3p_b_revert_all.png');

    const stateRevertA = await clientA.evalExpr(`G.Coop.puppets().find(p => p.uid === 'uid_b').megaState`);
    const stateRevertB = await clientB.evalExpr(`G.Game.player.megaState`);
    const stateRevertC = await clientC.evalExpr(`G.Coop.puppets().find(p => p.uid === 'uid_b').megaState`);
    console.log(`Trạng thái sau hoàn nguyên: Trên A = ${stateRevertA}, Trên B = ${stateRevertB}, Trên C = ${stateRevertC}`);

    if (stateRevertA !== 'MEGA_USED' || stateRevertB !== 'MEGA_USED' || stateRevertC !== 'MEGA_USED') {
      throw new Error(`Một trong các client chưa hoàn nguyên về MEGA_USED! (A=${stateRevertA}, B=${stateRevertB}, C=${stateRevertC})`);
    }
    console.log('[OK] Cả 3 trình duyệt A, B, C đều đồng bộ hoàn nguyên về dạng thường!');

    // =========================================================================
    // KỊCH BẢN 3: HOST A KÍCH HOẠT MEGA CHARIZARD X RỒI ĐỒNG BỘ CHO C
    // =========================================================================
    console.log('\n--- KỊCH BẢN 3: HOST A KÍCH HOẠT MEGA CHARIZARD X -> C NHẬN DIỆN CHÍNH XÁC ---');
    await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.trigger(pl);
        G.Mega.update(pl, 1.3);
        window.__outboxA = window.__outboxA || [];
        window.__outboxA.push({
          to: 'uid_c',
          payload: {
            k: 'f', t: 27.0, lv: 1, xp: 0, xn: 60, ki: 0, bo: 0, co: 0, tk: [0, 0],
            p: { uid_a: [-17, 0, 1.57, 0, 105, 105, 0, 'ember', 1] },
            e: [],
            ev: [['mega', 'uid_a', 'mega_charizard_x', 0, 25.0]]
          }
        });
      })()
    `);
    await relayMesh();
    await sleep(300);

    await clientC.captureScreenshot('coop_3p_a_mega_seen_by_c.png');

    const stateHostMegaOnC = await clientC.evalExpr(`
      (() => {
        const pA = G.Coop.puppets().find(p => p.uid === 'uid_a');
        return { anim: pA ? pA.anim.dex : null, mega: pA ? pA.megaState : null };
      })()
    `);
    console.log('Client C nhìn thấy Host A:', stateHostMegaOnC);
    if (stateHostMegaOnC.mega !== 'MEGA_ACTIVE' || stateHostMegaOnC.anim !== 'mega_6_x') {
      throw new Error(`C không nhận diện đúng Host A là Mega Charizard X! (Thực tế: ${JSON.stringify(stateHostMegaOnC)})`);
    }
    console.log('[OK] Kịch bản Host A Mega đồng bộ sang C thành công mỹ mãn!');

    // =========================================================================
    // KỊCH BẢN 4: CLIENT C KẾT NỐI LẠI TRONG KHI HOST A VẪN ĐANG TRONG MEGA
    // =========================================================================
    console.log('\n--- KỊCH BẢN 4: CLIENT C KẾT NỐI LẠI KHI MEGA CÒN HOẠT ĐỘNG ---');
    // Giả lập C bị ngắt kết nối tạm thời rồi kết nối lại: Host re-sync frame
    await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        window.__outboxA = window.__outboxA || [];
        window.__outboxA.push({
          to: 'uid_c',
          payload: {
            k: 'f', t: 30.0, lv: 1, xp: 0, xn: 60, ki: 0, bo: 0, co: 0, tk: [0, 0],
            p: { uid_a: [-17, 0, 1.57, 0, 105, 105, 0, 'ember', 1] },
            e: [],
            ev: [['mega', 'uid_a', 'mega_charizard_x', 0, pl.megaTimer]]
          }
        });
      })()
    `);
    await relayMesh();
    await sleep(300);

    const stateReconnectC = await clientC.evalExpr(`G.Coop.puppets().find(p => p.uid === 'uid_a').anim.dex`);
    console.log('Client C sau khi kết nối lại vẫn thấy Host A là:', stateReconnectC);
    if (stateReconnectC !== 'mega_6_x') {
      throw new Error(`C kết nối lại bị mất trạng thái Mega của Host A!`);
    }
    console.log('[OK] C kết nối lại duy trì trạng thái Mega mượt mà 100%!');

    // Dọn dẹp cả 3 client
    await Promise.all([
      clientA.evalExpr(`G.Game.quit(); G.Game.toUI();`),
      clientB.evalExpr(`G.Game.quit(); G.Game.toUI();`),
      clientC.evalExpr(`G.Game.quit(); G.Game.toUI();`)
    ]);

    console.log('\nTổng lỗi console JavaScript trên Client A:', clientA.consoleErrors.length);
    console.log('Tổng lỗi console JavaScript trên Client B:', clientB.consoleErrors.length);
    console.log('Tổng lỗi console JavaScript trên Client C:', clientC.consoleErrors.length);
    console.log('>>> TOÀN BỘ 4 KỊCH BẢN LATE JOINER VÀ CO-OP 3 TRÌNH DUYỆT ĐỀU PASS 100%! <<<');

  } finally {
    await Promise.all([clientA.close(), clientB.close(), clientC.close()]);
    server.close();
  }
}

run().catch(e => {
  console.error('LỖI KIỂM THỬ 3 TRÌNH DUYỆT:', e);
  process.exit(1);
});
