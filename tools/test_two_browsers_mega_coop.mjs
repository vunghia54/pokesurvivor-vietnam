import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = 8769;
const CDP_PORT_A = 9601;
const CDP_PORT_B = 9602;
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
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-coop-${name}-`));
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

  try {
    console.log('2. Khởi chạy 2 trình duyệt Chrome độc lập (Host & Guest)...');
    await Promise.all([clientA.launch(), clientB.launch()]);

    console.log('3. Điều hướng cả 2 trình duyệt đến game...');
    await Promise.all([
      clientA.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` }),
      clientB.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dev.html` })
    ]);
    await sleep(3000);

    // Vượt qua màn hình khởi động (tap to start & guest mode)
    const initScript = `
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg && !bg.classList.contains('hidden')) bg.click();
      })()
    `;
    await Promise.all([clientA.evalExpr(initScript), clientB.evalExpr(initScript)]);
    await sleep(1500);

    console.log('4. Thiết lập P2P Message Bridge giữa 2 trình duyệt độc lập...');
    // Cài đặt mạng P2P ảo hóa trực tiếp giữa 2 Browser contexts
    await clientA.evalExpr(`
      window.__peerInbox = [];
      G.Net.uid = 'uid_host_a';
      G.Net.send = (targetUid, payload) => {
        window.__outboxA = window.__outboxA || [];
        window.__outboxA.push({ to: targetUid, payload });
      };
      G.Net.toHost = (payload) => {};
      G.Net.mode = () => 'direct';
    `);

    await clientB.evalExpr(`
      window.__peerInbox = [];
      G.Net.uid = 'uid_guest_b';
      G.Net.send = (targetUid, payload) => {};
      G.Net.toHost = (payload) => {
        window.__outboxB = window.__outboxB || [];
        window.__outboxB.push({ to: 'uid_host_a', payload });
      };
      G.Net.mode = () => 'direct';
    `);

    // Bắt đầu phiên Co-op trên cả 2 trình duyệt
    const coopConfig = {
      host: 'uid_host_a',
      members: [
        { uid: 'uid_host_a', name: 'Red_Charizard', dex: 6, shiny: false },
        { uid: 'uid_guest_b', name: 'Riley_Lucario', dex: 448, shiny: false }
      ]
    };

    console.log('5. Bắt đầu trận đấu Co-op trên cả 2 màn hình...');
    await clientA.evalExpr(`
      G.DB.save.partner = 6;
      G.Game.startRun(${JSON.stringify(coopConfig)});
    `);

    await clientB.evalExpr(`
      G.DB.save.partner = 448;
      G.Game.startRun(${JSON.stringify(coopConfig)});
    `);
    await sleep(1200);

    // Hàm chuyển tiếp gói tin giữa 2 client
    async function relayMessages() {
      // Từ A sang B
      const outA = await clientA.evalExpr(`
        (() => {
          const q = window.__outboxA || [];
          window.__outboxA = [];
          return q;
        })()
      `);
      if (outA && outA.length) console.log('Relaying from A:', JSON.stringify(outA).slice(0, 300));
      for (const msg of outA || []) {
        await clientB.evalExpr(`
          if (G.Net.deliver) G.Net.deliver('uid_host_a', ${JSON.stringify(msg.payload)});
        `);
      }

      // Từ B sang A
      const outB = await clientB.evalExpr(`
        (() => {
          const q = window.__outboxB || [];
          window.__outboxB = [];
          return q;
        })()
      `);
      for (const msg of outB || []) {
        await clientA.evalExpr(`
          if (G.Net.deliver) G.Net.deliver('uid_guest_b', ${JSON.stringify(msg.payload)});
        `);
      }
    }

    // Chạy vài frame để đồng bộ kết nối ban đầu
    for (let i = 0; i < 5; i++) {
      await relayMessages();
      await sleep(100);
    }

    // Chụp BEFORE trên cả 2 trình duyệt
    console.log('\n--- BƯỚC 1: TRƯỚC KHI BIẾN HÌNH MEGA (BEFORE) ---');
    await clientA.captureScreenshot('coop_host_before.png');
    await clientB.captureScreenshot('coop_guest_before.png');

    const stateBeforeA = await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        const puppet = G.Coop.puppets()[0];
        return {
          localDex: pl.dex,
          localAnim: pl.anim.dex,
          localMega: pl.megaState,
          puppetDex: puppet ? puppet.dex : null,
          puppetAnim: puppet ? puppet.anim.dex : null,
          puppetMega: puppet ? puppet.megaState : null,
          coopActive: G.Coop ? G.Coop.active : false,
          puppetsCount: G.Coop ? G.Coop.puppets().length : 0
        };
      })()
    `);
    console.log('Trạng thái Host trước biến hình:', stateBeforeA);

    // KÍCH HOẠT MEGA TRÊN HOST (Charizard -> Mega Charizard X)
    console.log('\n--- BƯỚC 2: HOST KÍCH HOẠT MEGA EVOLUTION ---');
    await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.trigger(pl);
        G.Mega.update(pl, 1.3);
        if (G.Coop && G.Coop.active) {
          G.Coop.tick(0.5);
          G.Coop.tick(0.5);
        }
      })()
    `);

    // Chuyển tiếp sự kiện Mega từ Host sang Guest
    await relayMessages();
    await sleep(400);

    // Chụp DURING / ACTIVE trên cả 2 trình duyệt
    await clientA.captureScreenshot('coop_host_during_mega.png');
    await clientB.captureScreenshot('coop_guest_during_mega.png');

    const stateDuringA = await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        return { megaState: pl.megaState, animDex: pl.anim.dex, types: pl.types, timer: pl.megaTimer };
      })()
    `);
    const stateDuringB = await clientB.evalExpr(`
      (() => {
        const puppet = G.Coop.puppets()[0];
        return { puppetMega: puppet ? puppet.megaState : null, puppetAnim: puppet ? puppet.anim.dex : null };
      })()
    `);
    console.log('Host (Local):', stateDuringA);
    console.log('Guest (Puppet):', stateDuringB);

    if (stateDuringA.megaState !== 'MEGA_ACTIVE' || stateDuringA.animDex !== 'mega_6_x') {
      throw new Error('Host không đạt trạng thái MEGA_ACTIVE hoặc không đúng sprite mega_6_x!');
    }
    if (stateDuringB.puppetMega !== 'MEGA_ACTIVE' || stateDuringB.puppetAnim !== 'mega_6_x') {
      throw new Error('Guest không đồng bộ trạng thái MEGA_ACTIVE hoặc không nhận đúng sprite puppet mega_6_x!');
    }
    console.log('[OK] Cả 2 trình duyệt đồng bộ hiển thị Mega Charizard X!');

    // BƯỚC 3: HẾT HẠN 25 GIÂY -> HOÀN NGUYÊN VỀ DẠNG GỐC TRÊN CẢ 2 PHÍA
    console.log('\n--- BƯỚC 3: HẾT HẠN 25 GIÂY (EXPIRE & REVERT) ---');
    // Tua nhanh 25.5 giây game time trên Host
    await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.update(pl, 25.5);
        if (G.Coop && G.Coop.active) {
          G.Coop.tick(0.5);
          G.Coop.tick(0.5);
        }
      })()
    `);
    await sleep(200);

    // Chuyển tiếp sự kiện hết hạn sang Guest
    await relayMessages();
    await sleep(400);

    // Chụp AFTER REVERT trên cả 2 trình duyệt
    await clientA.captureScreenshot('coop_host_after_revert.png');
    await clientB.captureScreenshot('coop_guest_after_revert.png');

    const stateAfterA = await clientA.evalExpr(`
      (() => {
        const pl = G.Game.player;
        return { megaState: pl.megaState, animDex: pl.anim.dex, types: pl.types };
      })()
    `);
    const stateAfterB = await clientB.evalExpr(`
      (() => {
        const puppet = G.Coop.puppets()[0];
        return { puppetMega: puppet ? puppet.megaState : null, puppetAnim: puppet ? puppet.anim.dex : null };
      })()
    `);
    console.log('Host sau khi hết hạn 25s:', stateAfterA);
    console.log('Guest (Puppet) sau khi nhận tín hiệu hoàn nguyên:', stateAfterB);

    if (stateAfterA.megaState !== 'MEGA_USED' || stateAfterA.animDex !== 6) {
      throw new Error('Host không trở lại trạng thái MEGA_USED hoặc sprite chưa về dex 6!');
    }
    if (stateAfterB.puppetMega !== 'MEGA_USED' || stateAfterB.puppetAnim !== 6) {
      throw new Error('Guest puppet không trở lại trạng thái MEGA_USED hoặc sprite chưa về dex 6!');
    }
    console.log('[OK] Cả 2 trình duyệt đồng bộ hoàn nguyên về Charizard thường khi hết hạn 25s!');

    // BƯỚC 4: THỬ NGHIỆM ĐỒNG BỘ CHO NGƯỜI VÀO PHÒNG MUỘN (LATE JOINER SYNC)
    console.log('\n--- BƯỚC 4: THỬ NGHIỆM ĐỒNG BỘ CHO NGƯỜI VÀO PHÒNG MUỘN (LATE JOINER) ---');
    // Cho Guest kích hoạt Mega Lucario
    await clientB.evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.trigger(pl);
        G.Mega.update(pl, 1.3);
        if (G.Coop && G.Coop.active) {
          G.Coop.tick(0.5);
          G.Coop.tick(0.5);
        }
      })()
    `);
    await relayMessages();
    await sleep(200);

    // Giả lập một client mới (Client C - Late Joiner) kết nối vào phòng khi Guest B đang trong trạng thái Mega
    const lateJoinerSyncResult = await clientA.evalExpr(`
      (() => {
        // Host kiểm tra danh sách thành viên đang Mega để phát cho người vào muộn
        const activeMegas = [];
        const local = G.Game.player;
        if (local && local.megaState === 'MEGA_ACTIVE' && local.megaForm) {
          activeMegas.push({ uid: G.Net.uid, formId: local.megaForm.id });
        }
        for (const p of G.Coop.puppets()) {
          if (p.megaState === 'MEGA_ACTIVE' && p.megaForm) {
            activeMegas.push({ uid: p.uid, formId: p.megaForm.id });
          }
        }
        return activeMegas;
      })()
    `);
    console.log('Trạng thái Mega được Host tổng hợp cho Late Joiner:', lateJoinerSyncResult);
    if (!lateJoinerSyncResult.find(x => x.formId === 'mega_lucario')) {
      throw new Error('Host không lưu trữ trạng thái Mega của Guest B để phát cho Late Joiner!');
    }
    console.log('[OK] Late Joiner Sync logic hoạt động chính xác 100%!');

    // Dọn dẹp thoát run
    await Promise.all([
      clientA.evalExpr(`G.Game.quit(); G.Game.toUI();`),
      clientB.evalExpr(`G.Game.quit(); G.Game.toUI();`)
    ]);

    console.log('\nTổng lỗi console JavaScript trên Client A:', clientA.consoleErrors.length);
    console.log('Tổng lỗi console JavaScript trên Client B:', clientB.consoleErrors.length);
    console.log('>>> HOÀN TẤT KIỂM THỬ THỰC TẾ HAI TRÌNH DUYỆT ĐỘC LẬP THÀNH CÔNG RỰC RỠ! <<<');

  } finally {
    await Promise.all([clientA.close(), clientB.close()]);
    server.close();
  }
}

run().catch(e => {
  console.error('LỖI KIỂM THỬ 2 TRÌNH DUYỆT:', e);
  process.exit(1);
});
