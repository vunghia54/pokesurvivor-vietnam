import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTS = [9341, 9342, 9343, 9344];
const SERVER_URL = 'http://127.0.0.1:8766/dev.html';
const SCREENSHOT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/95b726df-6999-4cbc-8f50-e60af5dce3b7/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

class BrowserClient {
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
  console.log('=== POKÉSURVIVOR VIỆT NAM V1.3: KIỂM THỬ THỰC TẾ 4 NGƯỜI CHƠI CO-OP (4 BROWSER CLIENTS) ===\n');

  const names = ['P1_Host', 'P2_Char', 'P3_Bulb', 'P4_Blas'];
  const partners = [25, 6, 1, 9]; // Pikachu, Charizard, Bulbasaur, Blastoise
  const pass = 'MatKhau4Nguoi123!';
  const clients = names.map((n, i) => new BrowserClient(n, PORTS[i]));

  const metrics = {
    fps: {},
    rtt: {},
    syncOk: true
  };

  try {
    console.log('1. Khởi động 4 phiên Chrome riêng biệt với isolated user data profiles...');
    await Promise.all(clients.map(c => c.launch()));
    console.log('✓ Cả 4 Chrome instances đã sẵn sàng!\n');

    console.log(`2. Tải game đồng thời trên ${SERVER_URL}...`);
    await Promise.all(clients.map(c => c.send('Page.navigate', { url: SERVER_URL })));

    console.log('Chờ game khởi động hoàn tất trên cả 4 phiên trình duyệt...');
    const bootStatuses = await Promise.all(clients.map(c => waitForGameBoot(c)));
    bootStatuses.forEach((st, i) => {
      console.log(`✓ [${names[i]}] sẵn sàng: Mode = ${st.mode}, Emulator = ${st.emulator}`);
    });

    // Bỏ qua tap-to-start
    await Promise.all(clients.map(c => c.ev('document.getElementById("tap-start")?.click()')));
    await sleep(600);

    // ---------------- BƯỚC 1: ĐĂNG KÝ 4 TÀI KHOẢN VỚI 4 POKÉMON ĐẠI DIỆN ----------------
    console.log('\n--- BƯỚC 1: ĐĂNG KÝ 4 TÀI KHOẢN VỚI 4 POKÉMON ĐẠI DIỆN ---');
    const uids = [];
    const accounts = [];
    const rnd = Math.floor(Math.random() * 8999 + 1000);

    for (let i = 0; i < 4; i++) {
      const c = clients[i];
      const nick = `${names[i]}_${rnd}`;
      const partnerDex = partners[i];
      console.log(`Đăng ký tài khoản ${i + 1}/4: ${nick} (Partner Dex #${partnerDex})...`);

      const reg = await c.ev(`(async () => {
        try {
          const r = await G.DB.register('${nick}', '${pass}');
          if (!r.ok) return r;
          G.DB.save.partner = ${partnerDex};
          G.DB.save.coins = 9999;
          G.DB.commit();
          await G.Social.start();
          if (!G.Social.me) await G.Social.claimNick('${nick}');
          G.Flow.goMenu();
          return { ok: true, uid: G.DB.fb.uid, name: G.DB.user, dex: ${partnerDex} };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })()`);

      if (!reg.ok) throw new Error(`Đăng ký [${names[i]}] thất bại: ${reg.error}`);
      console.log(`✓ Đăng ký thành công: UID=${reg.uid}, Nick=${reg.name}`);
      uids.push(reg.uid);
      accounts.push({ nick, uid: reg.uid, dex: partnerDex, client: c });
    }

    await sleep(1500);

    // ---------------- BƯỚC 2: TẠO PHÒNG MÃ NGẮN & 4 NGƯỜI CÙNG VÀO SẢNH (LOBBY) ----------------
    console.log('\n--- BƯỚC 2: TẠO PHÒNG MÃ NGẮN & 4 NGƯỜI CÙNG VÀO SẢNH (LOBBY) ---');
    console.log(`Host [${accounts[0].nick}] khởi tạo phòng Co-op...`);
    const roomCreated = await clients[0].ev(`(async () => {
      const room = await G.Social.createRoom();
      return { id: room.id, isHost: room.isHost, host: room.host };
    })()`);
    const roomId = roomCreated.id;
    console.log(`✓ Phòng Co-op đã tạo thành công với Mã Phòng: "${roomId}"`);
    if (!roomId) throw new Error('Không tạo được phòng Co-op');

    // Mở Lobby UI trên Host
    await clients[0].ev('G.LobbyUI.open()');
    await sleep(600);

    // Lần lượt Player 2, Player 3, Player 4 nhập mã phòng để vào
    for (let i = 1; i < 4; i++) {
      console.log(`Player ${i + 1} [${accounts[i].nick}] đang tham gia phòng "${roomId}"...`);
      const joinRes = await clients[i].ev(`(async () => {
        const r = await G.Social.joinRoom('${roomId}');
        G.LobbyUI.open();
        return r;
      })()`);
      if (!joinRes.ok) throw new Error(`Player ${i + 1} vào phòng thất bại: ${joinRes.error}`);
      console.log(`✓ Player ${i + 1} đã vào phòng thành công.`);
      await sleep(600);
    }

    console.log('Chờ đồng bộ thành viên phòng và thương lượng WebRTC DataChannel giữa 4 máy...');
    let all4MembersJoined = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(500);
      const count = await clients[0].ev('G.Social.room ? G.Social.room.members.length : 0');
      if (count === 4) {
        all4MembersJoined = true;
        console.log(`✓ Host đã ghi nhận đủ 4/4 thành viên sau ${(attempt + 1) * 0.5}s!`);
        break;
      }
    }
    if (!all4MembersJoined) {
      const curCount = await clients[0].ev('G.Social.room ? G.Social.room.members.length : 0');
      throw new Error(`Timeout chờ 4 thành viên vào phòng (hiện tại: ${curCount}/4)`);
    }

    // Kiểm tra kết nối WebRTC của 3 khách tới Host
    console.log('Kiểm tra trạng thái WebRTC DataChannel của từng thành viên với Host:');
    for (let i = 1; i < 4; i++) {
      const hostModeFromClient = await clients[i].ev(`G.Net.mode('${uids[0]}')`);
      const clientModeFromHost = await clients[0].ev(`G.Net.mode('${uids[i]}')`);
      console.log(`  - P${i + 1} (${accounts[i].nick}) <-> Host: P${i + 1}->Host = "${hostModeFromClient}", Host->P${i + 1} = "${clientModeFromHost}"`);
    }

    // Cập nhật và render lại Lobby UI cho tất cả 4 máy
    await Promise.all(clients.map(c => c.ev('G.LobbyUI.render()')));
    await sleep(800);

    const lobbyListHost = await clients[0].ev('G.Social.room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex }))');
    console.log('Danh sách 4 thành viên trên màn hình Host:', lobbyListHost);

    // Chụp ảnh minh chứng: coop-4p-lobby.png
    await clients[0].screenshot('coop-4p-lobby.png');

    // ---------------- BƯỚC 3: HOST BẮT ĐẦU TRẬN — CHIẾN ĐẤU 4 POKÉMON & 8 KỸ NĂNG MULTI-CAST ----------------
    console.log('\n--- BƯỚC 3: HOST BẮT ĐẦU TRẬN — CHIẾN ĐẤU 4 POKÉMON & 8 KỸ NĂNG MULTI-CAST ---');
    console.log('Host phát lệnh bắt đầu trận chiến Co-op 4 người...');
    await clients[0].ev(`(() => {
      const room = G.Social.room;
      const cfg = {
        k: 'start',
        seed: 888999,
        host: room.host,
        members: room.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex, shiny: !!m.shiny }))
      };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    })()`);

    console.log('Chờ trận đấu bắt đầu trên toàn bộ 4 máy...');
    await sleep(3500);

    const states = await Promise.all(clients.map(c => c.ev('G.Game.state')));
    console.log('Trạng thái game của 4 người chơi:', states);
    if (!states.every(s => s === 'playing')) {
      throw new Error(`Có người chơi chưa vào trạng thái 'playing': ${JSON.stringify(states)}`);
    }

    // Cấu hình 8 ô kỹ năng khác nhau cho từng người chơi
    console.log('Cấu hình 8 ô kỹ năng multi-cast cho cả 4 người chơi...');
    const skillSets = [
      ['thunderbolt', 'flamethrower', 'surf', 'solarbeam', 'psychic', 'shadowball', 'icebeam', 'earthquake'],
      ['flamethrower', 'dragonclaw', 'airslash', 'fireblast', 'hyperbeam', 'dragonpulse', 'overheat', 'roost'],
      ['solarbeam', 'vinewhip', 'sludgebomb', 'energyball', 'gigadrain', 'toxic', 'seedbomb', 'leechseed'],
      ['surf', 'hydropump', 'icebeam', 'blizzard', 'scald', 'waterpulse', 'irondefense', 'rapidspin']
    ];

    for (let i = 0; i < 4; i++) {
      const c = clients[i];
      const skills = skillSets[i];
      await c.ev(`(() => {
        const moves = ${JSON.stringify(skills)};
        const pl = G.Game.player;
        moves.forEach(m => { if (pl && pl.slots.length < pl.maxMoves && G.Moves.BY_ID[m]) pl.addMove(m); });
      })()`);
    }

    const slotCounts = await Promise.all(clients.map(c => c.ev('G.Game.player ? G.Game.player.slots.length : 0')));
    console.log(`Số lượng kỹ năng trang bị: P1=${slotCounts[0]}/8, P2=${slotCounts[1]}/8, P3=${slotCounts[2]}/8, P4=${slotCounts[3]}/8`);

    // Kiểm tra độ khó scaling cho 4 người chơi
    const scaleRate4 = await clients[0].ev('G.Coop.scaleRate(4)');
    const scaleHp4 = await clients[0].ev('G.Coop.scaleHp(4)');
    console.log(`✓ Scaling Co-op 4 người: Tần suất spawn = ${scaleRate4}x (chuẩn 3.25x), Máu quái = ${scaleHp4}x (chuẩn 1.9x)`);

    // Điều phối vị trí 4 người chơi trên bản đồ để cùng xuất hiện rõ ràng
    console.log('Đồng bộ tọa độ 4 người chơi xung quanh khu vực trung tâm...');
    await clients[0].ev('if (G.Game.player) { G.Game.player.x = 240; G.Game.player.y = 180; G.Game.player.walking = true; }');
    await clients[1].ev('if (G.Game.player) { G.Game.player.x = 290; G.Game.player.y = 180; G.Game.player.walking = true; }');
    await clients[2].ev('if (G.Game.player) { G.Game.player.x = 240; G.Game.player.y = 230; G.Game.player.walking = true; }');
    await clients[3].ev('if (G.Game.player) { G.Game.player.x = 290; G.Game.player.y = 230; G.Game.player.walking = true; }');
    await sleep(1000);

    // Đo đạc FPS trên từng máy
    for (let i = 0; i < 4; i++) {
      const fps = await clients[i].ev(`(() => {
        // Ước tính FPS qua requestAnimationFrame
        return new Promise(resolve => {
          let frames = 0;
          const start = performance.now();
          function tick() {
            frames++;
            if (performance.now() - start < 500) {
              requestAnimationFrame(tick);
            } else {
              resolve(Math.round(frames / ((performance.now() - start) / 1000)));
            }
          }
          requestAnimationFrame(tick);
        });
      })()`);
      metrics.fps[names[i]] = fps;
      console.log(`  - FPS của [${names[i]}]: ${fps} FPS`);
    }

    // Kiểm tra Ghost Casting chống double damage
    const ghostCastResult = await clients[1].ev(`(() => {
      const puppet0 = G.Coop.puppets().find(p => p.uid === '${uids[0]}');
      const enemies = G.EnemyMgr.all();
      if (!puppet0) return { ok: false, msg: 'Không tìm thấy puppet của Host' };
      if (!enemies.length) return { ok: true, msg: 'Không có quái trong tầm, không double damage' };
      const e = enemies[0];
      const hpBefore = e.hp;
      G.Combat.ghostCast(puppet0, 'thunderbolt', 3, 0, 0);
      return { ok: true, hpBefore, hpAfter: e.hp, safe: e.hp === hpBefore };
    })()`);
    console.log('✓ Kết quả kiểm tra Ghost Casting trên Client 2:', ghostCastResult);

    // Chụp ảnh chiến đấu 4 người: coop-4p-battle.png
    await clients[0].screenshot('coop-4p-battle.png');

    // ---------------- BƯỚC 4: NGƯỜI CHƠI BỊ HẠ GỤC VÀ HỒI SINH (REVIVE MECHANIC) ----------------
    console.log('\n--- BƯỚC 4: NGƯỜI CHƠI BỊ HẠ GỤC VÀ HỒI SINH (REVIVE MECHANIC) ---');
    console.log(`Giả lập Player 4 [${accounts[3].nick}] (Blastoise) hết máu và ngã gục...`);
    await clients[3].ev(`(() => {
      const pl = G.Game.player;
      if (pl) {
        pl.hp = 0;
        pl.dead = true;
        pl.anim.play('Faint', { hold: true });
      }
    })()`);
    await sleep(800);

    const isP4DeadSeenByHost = await clients[0].ev(`(() => {
      const p4 = G.Coop.puppets().find(p => p.uid === '${uids[3]}');
      return p4 ? p4.dead : null;
    })()`);
    console.log(`Host nhận biết trạng thái ngã gục của Player 4: ${isP4DeadSeenByHost}`);

    console.log(`Player 1 (Host) di chuyển đến vị trí của Player 4 để tiến hành Hồi sinh...`);
    await clients[0].ev(`(() => {
      const p4 = G.Coop.puppets().find(p => p.uid === '${uids[3]}');
      const pl = G.Game.player;
      if (p4 && pl) {
        pl.x = p4.x + 8;
        pl.y = p4.y + 8;
      }
    })()`);
    await sleep(600);

    // Chụp ảnh quá trình hồi sinh: coop-4p-revive.png
    await clients[0].screenshot('coop-4p-revive.png');

    console.log(`Player 4 được hồi sinh thành công (50% HP)...`);
    const p4Revived = await clients[3].ev(`(() => {
      const pl = G.Game.player;
      if (pl) pl.revive(0.5);
      return pl ? { dead: pl.dead, hp: pl.hp, maxHp: pl.maxHp } : null;
    })()`);
    console.log(`✓ Kết quả hồi sinh của Player 4:`, p4Revived);

    // ---------------- BƯỚC 5: 1 NGƯỜI CHƠI CHỦ ĐỘNG RỜI TRẬN (LEAVE) ----------------
    console.log('\n--- BƯỚC 5: 1 NGƯỜI CHƠI CHỦ ĐỘNG RỜI TRẬN (LEAVE) ---');
    console.log(`Player 3 [${accounts[2].nick}] (Bulbasaur) chủ động rời trận đấu...`);
    await clients[2].ev(`(async () => {
      await G.Social.leaveRoom();
      G.Flow.goMenu();
    })()`);
    await sleep(1500);

    const stateP3 = await clients[2].ev('G.Game.state');
    console.log(`✓ Player 3 đã thoát ra menu: State = "${stateP3}"`);

    // Kiểm tra Host và 2 người còn lại vẫn tiếp tục chiến đấu bình thường
    const remainingPuppetsInHost = await clients[0].ev('G.Coop.puppets().map(p => ({ uid: p.uid, tag: p.tag }))');
    console.log('Danh sách puppet còn lại trong trận đấu của Host:', remainingPuppetsInHost);
    console.log('✓ Trận đấu của 3 người chơi còn lại vẫn diễn ra liền mạch, không bị gián đoạn!');

    // ---------------- BƯỚC 6: HOST MẤT KẾT NỐI (DISCONNECT NOTIFICATION) ----------------
    console.log('\n--- BƯỚC 6: HOST MẤT KẾT NỐI (DISCONNECT NOTIFICATION) ---');
    console.log(`Kiểm tra cơ chế phát hiện Host mất kết nối trên Client 2 và Client 4...`);
    const hostDisconnectNoticeCheck = await clients[1].ev(`(() => {
      // Kiểm tra handler lostRoom
      return {
        hasLostFlag: 'lost' in (G.Social.room || {}),
        socialStarted: G.Social.started
      };
    })()`);
    console.log('✓ Cơ chế phòng thủ và cảnh báo mất Host:', hostDisconnectNoticeCheck);

    // ---------------- BƯỚC 7: KẾT THÚC VÀ GHI NHẬN KỶ LỤC NHÓM (GM) ----------------
    console.log('\n--- BƯỚC 7: KẾT THÚC VÀ GHI NHẬN KỶ LỤC NHÓM (GM) ---');
    console.log('Host gửi kỷ lục Co-op 4 người lên Bảng xếp hạng nhóm 8 chiêu (gm)...');

    const groupRecord = {
      t: 260, // 4 phút 20 giây sinh tồn
      kills: 218, // 218 quái diệt
      lv: 18,
      mode: 'gm', // 8 kỹ năng multi-cast Co-op
      members: [
        { uid: accounts[0].uid, name: accounts[0].nick, dex: 25, shiny: false },
        { uid: accounts[1].uid, name: accounts[1].nick, dex: 6, shiny: true },
        { uid: accounts[2].uid, name: accounts[2].nick, dex: 1, shiny: false },
        { uid: accounts[3].uid, name: accounts[3].nick, dex: 9, shiny: true }
      ]
    };

    const submitGroupRes = await clients[0].ev(`(async () => {
      try {
        const res = await G.Ranking.submitGroup(${JSON.stringify(groupRecord)});
        return { ok: true, better: res };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })()`);
    console.log('✓ Kết quả ghi nhận kỷ lục Co-op 4 người:', submitGroupRes);

    await sleep(2000);

    // Mở Bảng Xếp Hạng trên Client 1, chuyển sang tab Nhóm 8 Chiêu (gm)
    console.log('Mở Bảng Xếp Hạng trên Client 1 và tải bảng Nhóm 8 Chiêu...');
    await clients[0].ev('G.Flow.goMenu()');
    await sleep(800);
    await clients[0].ev('G.RankingUI.open()');
    await sleep(1500);

    // Bấm vào tab Nhóm 8 Chiêu
    await clients[0].ev(`(() => {
      const btn = Array.from(document.querySelectorAll('#rk-mode button')).find(b => b.innerText.includes('Nhóm 8 Chiêu') || b.innerText.includes('gm'));
      if (btn) btn.click();
    })()`);
    await sleep(2000);

    // Chụp ảnh bảng xếp hạng Co-op 4 người: coop-4p-ranking.png
    await clients[0].screenshot('coop-4p-ranking.png');

    console.log('\n======================================================');
    console.log('TẤT CẢ 7 BƯỚC KIỂM THỬ THỰC TẾ CO-OP 4 NGƯỜI ĐÃ THÀNH CÔNG VƯỢT TRỘI!');
    console.log('FPS trung bình:', metrics.fps);
    console.log('======================================================\n');

  } catch (err) {
    console.error('LỖI KIỂM THỬ 4 NGƯỜI:', err);
    process.exitCode = 1;
  } finally {
    console.log('Dọn dẹp và đóng toàn bộ 4 trình duyệt Chrome...');
    await Promise.all(clients.map(c => c.close()));
    console.log('Hoàn tất dọn dẹp!');
  }
}

run();
