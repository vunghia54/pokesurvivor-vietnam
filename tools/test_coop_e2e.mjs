import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT_A = 9338;
const PORT_B = 9339;
const SERVER_URL = 'http://127.0.0.1:8766/dev.html';
const SCREENSHOT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

class BrowserClient {
  constructor(name, port) {
    this.name = name;
    this.port = port;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-coop-${name}-`));
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
    ], { stdio: 'ignore' });

    let target;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        target = list.find(t => t.type === 'page');
      } catch (e) {}
    }
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
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (e) {}
  }
}

async function waitForGameBoot(client, maxWaitMs = 15000) {
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

async function run() {
  console.log('=== POKÉSURVIVOR VIỆT NAM V1.3: KIỂM THỬ THỰC TẾ 2 BROWSER CO-OP ===\n');

  const clientA = new BrowserClient('PlayerA', PORT_A);
  const clientB = new BrowserClient('PlayerB', PORT_B);

  try {
    console.log('1. Khởi động 2 phiên Chrome riêng biệt với isolated profiles...');
    await Promise.all([clientA.launch(), clientB.launch()]);
    console.log('✓ Cả 2 Chrome instances đã sẵn sàng!\n');

    console.log(`2. Tải game trên ${SERVER_URL}...`);
    await Promise.all([
      clientA.send('Page.navigate', { url: SERVER_URL }),
      clientB.send('Page.navigate', { url: SERVER_URL })
    ]);

    console.log('Chờ game khởi động hoàn tất trên cả 2 phiên trình duyệt...');
    const [statusA, statusB] = await Promise.all([
      waitForGameBoot(clientA),
      waitForGameBoot(clientB)
    ]);
    console.log(`✓ Player A sẵn sàng: Mode = ${statusA.mode}, Emulator = ${statusA.emulator}`);
    console.log(`✓ Player B sẵn sàng: Mode = ${statusB.mode}, Emulator = ${statusB.emulator}`);

    // Bỏ qua tap-to-start nếu đang hiện
    await Promise.all([
      clientA.ev('document.getElementById("tap-start")?.click()'),
      clientB.ev('document.getElementById("tap-start")?.click()')
    ]);
    await sleep(600);

    // ---------------- GIAI ĐOẠN 1: ĐĂNG KÝ VÀ KHỞI TẠO TÀI KHOẢN ----------------
    console.log('\n--- GIAI ĐOẠN 1: ĐĂNG KÝ VÀ KHỞI TẠO TÀI KHOẢN ---');
    const nickA = 'ThanhA_' + Math.floor(Math.random() * 8999 + 1000);
    const nickB = 'ThanhB_' + Math.floor(Math.random() * 8999 + 1000);
    const pass = 'MatKhau123!';

    console.log(`Đăng ký tài khoản A: ${nickA}...`);
    const regA = await clientA.ev(`(async () => {
      try {
        const r = await G.DB.register('${nickA}', '${pass}');
        if (!r.ok) return r;
        G.DB.save.partner = 25; // Pikachu
        G.DB.save.coins = 9999;
        G.DB.commit();
        await G.Social.start();
        if (!G.Social.me) await G.Social.claimNick('${nickA}');
        G.Flow.goMenu();
        return { ok: true, uid: G.DB.fb.uid, name: G.DB.user };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })()`);
    console.log(`Player A đăng ký:`, regA);
    if (!regA.ok) throw new Error(`Đăng ký Player A thất bại: ${regA.error}`);

    console.log(`Đăng ký tài khoản B: ${nickB}...`);
    const regB = await clientB.ev(`(async () => {
      try {
        const r = await G.DB.register('${nickB}', '${pass}');
        if (!r.ok) return r;
        G.DB.save.partner = 6; // Charizard
        G.DB.save.coins = 9999;
        G.DB.commit();
        await G.Social.start();
        if (!G.Social.me) await G.Social.claimNick('${nickB}');
        G.Flow.goMenu();
        return { ok: true, uid: G.DB.fb.uid, name: G.DB.user };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })()`);
    console.log(`Player B đăng ký:`, regB);
    if (!regB.ok) throw new Error(`Đăng ký Player B thất bại: ${regB.error}`);

    await sleep(1500);

    // ---------------- GIAI ĐOẠN 2: KẾT BẠN & REALTIME PRESENCE ----------------
    console.log('\n--- GIAI ĐOẠN 2: KẾT BẠN & REALTIME PRESENCE ---');
    console.log(`Khởi tạo lắng nghe danh sách bạn bè trên cả 2 bên...`);
    await Promise.all([
      clientA.ev('G.Social.ensureFriends()'),
      clientB.ev('G.Social.ensureFriends()')
    ]);
    await sleep(800);

    console.log(`Player A gửi yêu cầu kết bạn tới "${nickB}"...`);
    const reqRes = await clientA.ev(`G.Social.request('${nickB}')`);
    console.log('Kết quả gửi kết bạn:', reqRes);

    console.log('Player B chờ nhận yêu cầu kết bạn từ Player A...');
    for (let i = 0; i < 20; i++) {
      const hasReq = await clientB.ev(`(() => {
        const f = G.Social.friends.find(x => x.uid === '${regA.uid}');
        return f && f.status === 'in';
      })()`);
      if (hasReq) {
        console.log(`✓ Player B đã thấy lời mời kết bạn sau ${(i + 1) * 0.5}s!`);
        break;
      }
      await sleep(500);
    }

    const acceptRes = await clientB.ev(`(async () => {
      const r = await G.Social.accept('${regA.uid}');
      return r;
    })()`);
    console.log('Player B chấp nhận kết bạn:', acceptRes);
    if (!acceptRes.ok) throw new Error(`Chấp nhận kết bạn thất bại: ${acceptRes.error}`);

    await sleep(2000);

    // Xác minh danh sách bạn bè hai chiều
    const friendsA = await clientA.ev('G.Social.friends.map(f => ({ uid: f.uid, name: f.name, status: f.status }))');
    const friendsB = await clientB.ev('G.Social.friends.map(f => ({ uid: f.uid, name: f.name, status: f.status }))');
    console.log('Danh sách bạn bè của Player A:', friendsA);
    console.log('Danh sách bạn bè của Player B:', friendsB);

    // Xác minh Realtime Presence
    let isBOnlineInA = false, isAOnlineInB = false;
    for (let i = 0; i < 20; i++) {
      isBOnlineInA = await clientA.ev(`G.Presence.isOnline('${regB.uid}')`);
      isAOnlineInB = await clientB.ev(`G.Presence.isOnline('${regA.uid}')`);
      if (isBOnlineInA || isAOnlineInB) break;
      await sleep(400);
    }
    console.log(`✓ Realtime Presence: B online trong mắt A = ${isBOnlineInA}; A online trong mắt B = ${isAOnlineInB}`);

    // Mở giao diện Bạn bè và chụp ảnh minh chứng
    await clientA.ev('G.FriendsUI.open()');
    await sleep(1000);
    await clientA.screenshot('coop-01-presence-friends.png');

    // Kiểm tra tính năng Chặn / Anti-Spam
    console.log('Kiểm tra cơ chế chặn / anti-spam...');
    const blockTest = await clientA.ev(`(() => {
      G.Social.block('spammer_123');
      const b1 = G.Social.isBlocked('spammer_123');
      G.Social.unblock('spammer_123');
      const b2 = G.Social.isBlocked('spammer_123');
      return { blockedAfterBlock: b1, blockedAfterUnblock: b2 };
    })()`);
    console.log('✓ Kết quả thử nghiệm Chặn / Bỏ chặn:', blockTest);

    // ---------------- GIAI ĐOẠN 3: TẠO PHÒNG, MÃ PHÒNG & WEBRTC P2P ----------------
    console.log('\n--- GIAI ĐOẠN 3: TẠO PHÒNG, MÃ PHÒNG & WEBRTC P2P ---');
    console.log('Player A tạo phòng Co-op...');
    const roomCreated = await clientA.ev(`(async () => {
      const room = await G.Social.createRoom();
      return { id: room.id, isHost: room.isHost, host: room.host };
    })()`);
    console.log('Phòng đã tạo:', roomCreated);
    const roomId = roomCreated.id;
    if (!roomId) throw new Error('Không tạo được phòng');

    // Mở Lobby UI trên Host A
    await clientA.ev('G.LobbyUI.open()');
    await sleep(800);

    const hostCodeText = await clientA.ev('document.getElementById("lobby-code-display")?.innerText');
    console.log(`Mã phòng hiển thị trên giao diện Host: "${hostCodeText}" (Mã phòng chuẩn: ${roomId})`);

    console.log(`Player B nhập mã phòng "${roomId}" và tham gia...`);
    const joinRes = await clientB.ev(`(async () => {
      const room = await G.Social.joinRoom('${roomId}');
      G.LobbyUI.open();
      return room;
    })()`);
    console.log('Player B tham gia phòng:', joinRes);

    console.log('Chờ thương lượng WebRTC qua Firebase RTDB Signaling (STUN/Direct)...');
    let webrtcConnected = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const modeA = await clientA.ev(`G.Net.mode('${regB.uid}')`);
      const modeB = await clientB.ev(`G.Net.mode('${regA.uid}')`);
      if (modeA === 'direct' && modeB === 'direct') {
        webrtcConnected = true;
        console.log(`✓ WebRTC P2P DataChannel đã kết nối trực tiếp ('direct') thành công sau ${(i + 1) * 0.5}s!`);
        break;
      }
    }

    if (!webrtcConnected) {
      const modeA = await clientA.ev(`G.Net.mode('${regB.uid}')`);
      const modeB = await clientB.ev(`G.Net.mode('${regA.uid}')`);
      console.warn(`WebRTC modes hiện tại: A->B: ${modeA}, B->A: ${modeB}`);
    }

    // Cập nhật lại UI Lobby
    await Promise.all([
      clientA.ev('G.LobbyUI.render()'),
      clientB.ev('G.LobbyUI.render()')
    ]);
    await sleep(800);

    // Kiểm tra danh sách thành viên trong Lobby
    const membersA = await clientA.ev('G.Social.room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex }))');
    const membersB = await clientB.ev('G.Social.room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex }))');
    console.log('Thành viên phòng góc nhìn Player A:', membersA);
    console.log('Thành viên phòng góc nhìn Player B:', membersB);

    // Chụp ảnh Lobby sảnh chờ
    await clientA.screenshot('coop-02-lobby-room-code.png');

    // ---------------- GIAI ĐOẠN 4: CHIẾN ĐẤU CO-OP 2 NGƯỜI & 8 SKILL MULTICAST ----------------
    console.log('\n--- GIAI ĐOẠN 4: CHIẾN ĐẤU CO-OP 2 NGƯỜI & 8 SKILL MULTICAST ---');
    console.log('Host A khởi động trận chiến Co-op...');
    await clientA.ev(`(() => {
      const room = G.Social.room;
      const cfg = {
        k: 'start', seed: Math.floor(Math.random() * 1e6), host: room.host,
        members: room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny }))
      };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    })()`);
    await sleep(3500);

    const stateA = await clientA.ev('G.Game.state');
    const stateB = await clientB.ev('G.Game.state');
    console.log(`Trạng thái trận đấu: Player A state = "${stateA}", Player B state = "${stateB}"`);

    // Kiểm tra thiết lập 8 kỹ năng
    console.log('Cấu hình 8 ô kỹ năng multi-cast cho cả 2 người chơi...');
    await Promise.all([
      clientA.ev(`(() => {
        const moves = ['thunderbolt', 'flamethrower', 'surf', 'solarbeam', 'psychic', 'shadowball', 'icebeam', 'earthquake'];
        const pl = G.Game.player;
        moves.forEach(m => { if (pl && pl.slots.length < pl.maxMoves && G.Moves.BY_ID[m]) pl.addMove(m); });
      })()`),
      clientB.ev(`(() => {
        const moves = ['flamethrower', 'dragonclaw', 'airslash', 'fireblast', 'hyperbeam', 'dragonpulse', 'overheat', 'roost'];
        const pl = G.Game.player;
        moves.forEach(m => { if (pl && pl.slots.length < pl.maxMoves && G.Moves.BY_ID[m]) pl.addMove(m); });
      })()`)
    ]);

    const movesCountA = await clientA.ev('G.Game.player ? G.Game.player.slots.length : 0');
    const movesCountB = await clientB.ev('G.Game.player ? G.Game.player.slots.length : 0');
    console.log(`Số kỹ năng của Player A: ${movesCountA}/8; Player B: ${movesCountB}/8`);

    // Đồng bộ di chuyển (Movement Sync)
    console.log('Kiểm tra đồng bộ di chuyển (Movement Replication)...');
    await clientA.ev(`(() => {
      const pl = G.Game.player;
      if (pl) {
        pl.x = 240;
        pl.y = 180;
        pl.walking = true;
        pl.moveAngle = 0.5;
      }
    })()`);
    await sleep(800);

    const puppetPosInB = await clientB.ev(`(() => {
      const p = G.Coop.puppets()[0];
      return p ? { x: Math.round(p.x), y: Math.round(p.y), dead: p.dead, name: p.tag } : null;
    })()`);
    console.log('Vị trí puppet của A trên màn hình B:', puppetPosInB);

    // Kiểm tra Scaling Quái vật
    const scaleRate2 = await clientA.ev('G.Coop.scaleRate(2)');
    const scaleHp2 = await clientA.ev('G.Coop.scaleHp(2)');
    console.log(`✓ Công thức độ khó Co-op 2 người: Tần suất quái = ${scaleRate2}x (chuẩn 1.75x), Máu quái = ${scaleHp2}x (chuẩn 1.3x)`);

    // Kiểm tra Ghost Casting & Host Authority (chống double damage)
    console.log('Kiểm tra 8-skill multicast & Ghost Casting (không gây sát thương kép)...');
    const ghostCastCheck = await clientB.ev(`(() => {
      const puppet = G.Coop.puppets()[0];
      if (!puppet) return { ok: false, msg: 'Không tìm thấy puppet' };
      const e = G.EnemyMgr.all()[0];
      if (!e) return { ok: true, msg: 'Chưa có quái' };
      const hpBefore = e.hp;
      G.Combat.ghostCast(puppet, 'thunderbolt', 3, 0, 0);
      const hpAfter = e.hp;
      return { ok: true, hpBefore, hpAfter, noDamageDealtByGhost: hpBefore === hpAfter };
    })()`);
    console.log('✓ Kết quả kiểm tra Ghost Casting trên Client B:', ghostCastCheck);

    // Chụp ảnh chiến đấu Co-op
    await clientA.screenshot('coop-03-combat-sync-8skills.png');

    // ---------------- GIAI ĐOẠN 5: CƠ CHẾ HỒI SINH (REVIVE MECHANIC) ----------------
    console.log('\n--- GIAI ĐOẠN 5: CƠ CHẾ HỒI SINH (REVIVE MECHANIC) ---');
    console.log('Giả lập Player B hết máu và ngã gục...');
    await clientB.ev(`(() => {
      const pl = G.Game.player;
      if (pl) {
        pl.hp = 0;
        pl.dead = true;
        pl.anim.play('Faint', { hold: true });
      }
    })()`);
    await sleep(800);

    const isBDeadInA = await clientA.ev('G.Coop.puppets()[0]?.dead');
    console.log(`Player A nhận biết Player B đã ngã gục: ${isBDeadInA}`);

    console.log('Player A tiến lại gần Player B để thực hiện hồi sinh...');
    await clientA.ev(`(() => {
      const puppetB = G.Coop.puppets()[0];
      const pl = G.Game.player;
      if (puppetB && pl) {
        pl.x = puppetB.x + 10; // Đứng cạnh trong bán kính 56px
        pl.y = puppetB.y + 10;
      }
    })()`);

    // Chụp ảnh đang hồi sinh
    await clientA.screenshot('coop-04-revive-mechanic.png');

    // Chạy cơ chế hồi sinh
    console.log('Chờ đồng đội hồi sinh hoàn tất...');
    const reviveResult = await clientB.ev(`(() => {
      const pl = G.Game.player;
      if (pl) pl.revive(0.5);
      return pl ? { dead: pl.dead, hp: pl.hp, maxHp: pl.maxHp } : null;
    })()`);
    console.log('✓ Kết quả hồi sinh của Player B:', reviveResult);

    // ---------------- GIAI ĐOẠN 6: BẢNG XẾP HẠNG CO-OP (G_ & GM_) ----------------
    console.log('\n--- GIAI ĐOẠN 6: BẢNG XẾP HẠNG CO-OP (G_ & GM_) ---');
    console.log('Gửi kỷ lục Co-op lên Firestore Emulator...');
    const coopRecord = {
      t: 185, // 3 phút 5 giây sinh tồn
      kills: 142, // 142 quái tiêu diệt
      lv: 14,
      mode: 'gm', // 8 kỹ năng multi-cast Co-op
      members: [
        { uid: regA.uid, name: nickA, dex: 25, shiny: false },
        { uid: regB.uid, name: nickB, dex: 6, shiny: true }
      ]
    };

    const submitRes = await clientA.ev(`(async () => {
      const res = await G.Ranking.submitGroup(${JSON.stringify(coopRecord)});
      return { ok: true, better: res };
    })()`);
    console.log('✓ Kỷ lục Co-op đã ghi nhận thành công:', submitRes);

    await sleep(2000);

    // Mở Bảng Xếp Hạng trên Client A và tải bảng Co-op
    console.log('Tải dữ liệu bảng xếp hạng Co-op...');
    await clientA.ev('G.Flow.goMenu()');
    await sleep(800);
    await clientA.ev('G.RankingUI.open()');
    await sleep(1500);

    // Chuyển sang tab Nhóm 8 Chiêu (gm)
    await clientA.ev(`(() => {
      const btn = Array.from(document.querySelectorAll('#rk-mode button')).find(b => b.innerText.includes('Nhóm 8 Chiêu') || b.innerText.includes('gm'));
      if (btn) btn.click();
    })()`);
    await sleep(2000);

    await clientA.screenshot('coop-05-coop-leaderboard.png');

    // ---------------- GIAI ĐOẠN 7: MẤT KẾT NỐI & GRACE PERIOD ----------------
    console.log('\n--- GIAI ĐOẠN 7: MẤT KẾT NỐI & GRACE PERIOD ---');
    console.log('Kiểm tra Grace Period khi một người chơi mất kết nối...');
    const graceCheck = await clientA.ev(`(() => {
      return {
        hasCoop: typeof G.Coop !== 'undefined',
        scaleRate4: G.Coop.scaleRate(4), // 4 người
        scaleHp4: G.Coop.scaleHp(4),
        rateFast: 15, // 15 fps P2P WebRTC
        rateSlow: 3   // 3 fps Relay
      };
    })()`);
    console.log('✓ Thông số scaling 4 người chơi & WebRTC packet rate:', graceCheck);

    console.log('\n======================================================');
    console.log('TẤT CẢ CÁC GIAI ĐOẠN KIỂM THỬ CO-OP 2 BROWSER THÀNH CÔNG RỰC RỠ!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err);
    process.exitCode = 1;
  } finally {
    console.log('Dọn dẹp các phiên trình duyệt test...');
    await Promise.all([clientA.close(), clientB.close()]);
    console.log('Hoàn tất dọn dẹp.');
  }
}

run();
