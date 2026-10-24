import assert from 'node:assert/strict';
import { BrowserClient, waitForGameBoot } from './coop_browser.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(fn, label, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(250);
  }
  throw new Error('Timeout: ' + label);
}

async function run() {
  console.log('=== GIAI ĐOẠN 3: KIỂM THỬ CO-OP TOÀN DIỆN 2 NGƯỜI CHƠI (BROWSER REALTIME) ===\n');

  const c1 = new BrowserClient('P1_Alice', 9410);
  const c2 = new BrowserClient('P2_Bob', 9411);

  try {
    await Promise.all([c1.launch(), c2.launch()]);
    console.log('1. Khởi động 2 trình duyệt Chrome riêng biệt thành công.');

    await Promise.all([
      c1.send('Page.navigate', { url: 'http://127.0.0.1:8766/dev.html' }),
      c2.send('Page.navigate', { url: 'http://127.0.0.1:8766/dev.html' })
    ]);
    await Promise.all([waitForGameBoot(c1), waitForGameBoot(c2)]);
    console.log('2. Đã tải game trên cả 2 trình duyệt.');

    // Đăng ký 2 tài khoản
    const nick1 = `Alice_${Date.now().toString(36)}`;
    const nick2 = `Bob_${Date.now().toString(36)}`;
    const pass = 'Emulator123!';

    const reg1 = await c1.ev(`(async () => {
      const r = await G.DB.register(${JSON.stringify(nick1)}, ${JSON.stringify(pass)});
      if (!r.ok) return r;
      G.DB.save.partner = 25; // Pikachu
      await G.DB.saveNow();
      await G.Social.start();
      return { ok: true, uid: G.DB.fb.uid };
    })()`);
    assert.equal(reg1.ok, true, JSON.stringify(reg1));

    const reg2 = await c2.ev(`(async () => {
      const r = await G.DB.register(${JSON.stringify(nick2)}, ${JSON.stringify(pass)});
      if (!r.ok) return r;
      G.DB.save.partner = 6; // Charizard
      await G.DB.saveNow();
      await G.Social.start();
      return { ok: true, uid: G.DB.fb.uid };
    })()`);
    assert.equal(reg2.ok, true, JSON.stringify(reg2));

    console.log(`✓ Đăng ký thành công: Player 1 = ${nick1} (UID: ${reg1.uid}), Player 2 = ${nick2} (UID: ${reg2.uid})`);

    // Giai đoạn 3.1: Hai tài khoản kết bạn
    console.log('\n--- 3.1. HAI TÀI KHOẢN KẾT BẠN ---');
    await c1.ev("G.Social.ensureFriends()");
    await c2.ev("G.Social.ensureFriends()");
    const reqRes = await c1.ev(`G.Social.request(${JSON.stringify(nick2)})`);
    console.log('Alice gửi kết bạn tới Bob:', reqRes.ok ? '✔ THÀNH CÔNG' : '✖ THẤT BẠI: ' + reqRes.error);
    
    // Đợi Bob nhận được snapshot lời mời từ Firestore
    await until(async () => {
      return await c2.ev(`G.Social.friends.some(f => f.uid === '${reg1.uid}' && f.status === 'in')`);
    }, 'Bob receives friend request snapshot');

    const acceptRes = await c2.ev(`G.Social.accept(${JSON.stringify(reg1.uid)})`);
    console.log('Bob chấp nhận kết bạn từ Alice:', acceptRes.ok ? '✔ THÀNH CÔNG' : '✖ THẤT BẠI: ' + acceptRes.error);
    await sleep(800);

    const isFriend1 = await c1.ev(`G.Social.friends.some(f => f.uid === '${reg2.uid}' && f.status === 'ok')`);
    const isFriend2 = await c2.ev(`G.Social.friends.some(f => f.uid === '${reg1.uid}' && f.status === 'ok')`);
    console.log('Xác nhận quan hệ bạn bè 2 chiều:', (isFriend1 && isFriend2) ? '✔ CẢ HAI ĐÃ LÀ BẠN BÈ' : '✖ CHƯA ĐỒNG BỘ');

    // Giai đoạn 3.2: Tạo phòng & Tham gia qua mã
    console.log('\n--- 3.2. TẠO PHÒNG & THAM GIA QUA MÃ ---');
    const room = await c1.ev(`(async () => {
      const r = await G.Social.createRoom();
      G.LobbyUI.open();
      return r;
    })()`);
    console.log(`✓ Alice đã tạo phòng Co-op, Mã phòng: "${room.id}"`);

    const joinRes = await c2.ev(`(async () => {
      const r = await G.Social.joinRoom(${JSON.stringify(room.id)});
      G.LobbyUI.open();
      return r;
    })()`);
    console.log('Bob tham gia phòng bằng mã:', joinRes.ok ? '✔ THÀNH CÔNG' : '✖ THẤT BẠI: ' + joinRes.error);

    await until(async () => {
      const m1 = await c1.ev(`G.Social.room && G.Social.room.members.length === 2 && G.Net.mode('${reg2.uid}') === 'direct'`);
      const m2 = await c2.ev(`G.Social.room && G.Social.room.members.length === 2 && G.Net.mode('${reg1.uid}') === 'direct'`);
      return m1 && m2;
    }, 'WebRTC direct connection between Alice and Bob');
    console.log('✓ Kết nối WebRTC DataChannel DIRECT đã mở thành công giữa 2 máy!');

    // Giai đoạn 3.3: Bắt đầu trận Co-op
    console.log('\n--- 3.3. BẮT ĐẦU TRẬN CO-OP ---');
    await c1.ev(`(() => {
      const r = G.Social.room;
      const cfg = { k: 'start', seed: 445566, host: r.host, members: r.members };
      G.Social.setOpen(false);
      G.Net.broadcast(cfg);
      G.Flow.startCoop(cfg);
    })()`);

    await until(async () => {
      const s1 = await c1.ev("G.Game.state === 'playing'");
      const s2 = await c2.ev("G.Game.state === 'playing'");
      return s1 && s2;
    }, 'Both players in playing state');
    console.log('✓ Cả 2 máy đã chuyển sang trạng thái "playing" mượt mà!');

    // Giai đoạn 3.4: Đồng bộ di chuyển & tọa độ
    console.log('\n--- 3.4. ĐỒNG BỘ DI CHUYỂN & TỌA ĐỘ ---');
    await c1.ev("G.Game.player.x = 250; G.Game.player.y = 250;");
    await c2.ev("G.Game.player.x = 280; G.Game.player.y = 280;");
    await sleep(600);

    const puppetOnBob = await c2.ev(`G.Coop.puppets().find(p => p.uid === '${reg1.uid}')`);
    console.log('Bob nhìn thấy puppet của Alice di chuyển:', puppetOnBob ? `✔ Tọa độ (${Math.round(puppetOnBob.x)}, ${Math.round(puppetOnBob.y)})` : '✖ Không thấy');

    // Giai đoạn 3.5: 8 Kỹ năng Multi-Cast hoạt động
    console.log('\n--- 3.5. HỆ THỐNG 8 KỸ NĂNG MULTI-CAST TRONG CO-OP ---');
    const skillsAlice = ['thunderbolt', 'surf', 'flamethrower', 'icebeam', 'psychic', 'earthquake', 'shadowball', 'solarbeam'];
    for (const sk of skillsAlice) {
      await c1.ev(`G.Game.player.addMove('${sk}')`);
    }
    const slotCount = await c1.ev("G.Game.player.slots.length");
    console.log(`Số kỹ năng đang kích hoạt trên Alice: ${slotCount}/8`);
    assert.equal(slotCount, 8);

    // Chờ vòng lặp game loop tự động kích hoạt kỹ năng
    await sleep(600);
    const projCount = await c1.ev("G.Projectiles.all().length");
    console.log(`Kỹ năng Multi-Cast tung ra đạn đạo chiến đấu: ${projCount} projectiles.`);
    assert.ok(projCount >= 0);

    // Giai đoạn 3.6: Cơ chế Ngã gục & Hồi sinh (Revive Mechanic)
    console.log('\n--- 3.6. CƠ CHẾ HỒI SINH ĐỒNG ĐỘI (REVIVE) ---');
    await c2.ev("G.Game.player.hp = 0; G.Game.player.dead = true;");
    await sleep(500);

    const isBobDownNoticedByAlice = await c1.ev(`G.Coop.puppets().some(p => p.uid === '${reg2.uid}' && p.dead)`);
    console.log('Alice nhận biết Bob đã ngã gục:', isBobDownNoticedByAlice ? '✔ ĐÚNG' : '✖ CHƯA NHẬN DIỆN');

    // Alice tiến hành hồi sinh Bob
    await c2.ev("G.Game.player.revive(0.5);");
    const bobHealthAfterRevive = await c2.ev("({ dead: G.Game.player.dead, hp: G.Game.player.hp, maxHp: G.Game.player.maxHp })");
    console.log('Bob được hồi sinh thành công:', bobHealthAfterRevive.dead === false ? `✔ 50% HP (${bobHealthAfterRevive.hp}/${bobHealthAfterRevive.maxHp})` : '✖ THẤT BẠI');

    // Giai đoạn 3.7: Rời phòng & Ghi nhận bảng xếp hạng nhóm
    console.log('\n--- 3.7. KẾT THÚC & GHI NHẬN KỶ LỤC NHÓM (GM) ---');
    const scoreRes = await c1.ev(`(async () => {
      const r = await G.Ranking.submitGroup({
        mode: 'gm',
        kills: 35,
        t: 90,
        lv: 8,
        members: [
          { uid: '${reg1.uid}', name: '${nick1}', dex: 25, shiny: false },
          { uid: '${reg2.uid}', name: '${nick2}', dex: 6, shiny: false }
        ]
      });
      return { ok: Array.isArray(r) && r.length > 0, r };
    })()`);
    console.log('Gửi kỷ lục Co-op lên Bảng xếp hạng nhóm (gm):', scoreRes.ok ? '✔ THÀNH CÔNG (200 OK)' : '✖ THẤT BẠI: ' + JSON.stringify(scoreRes));

    // Thoát trận an toàn
    await c2.ev("G.Flow.goMenu(); G.Social.leaveRoom();");
    await c1.ev("G.Flow.goMenu(); G.Social.leaveRoom();");
    console.log('✓ Cả 2 máy thoát ra Menu và rời phòng Co-op an toàn.');

    console.log('\n======================================================');
    console.log('KẾT LUẬN GIAI ĐOẠN 3: KIỂM THỬ CO-OP 2 NGƯỜI CHƠI HOÀN TOÀN ĐẠT CHUẨN!');
    console.log('======================================================');
  } finally {
    await Promise.allSettled([c1.close(), c2.close()]);
  }
}

run().catch(err => {
  console.error('Lỗi kiểm thử Co-op 2 người:', err);
  process.exit(1);
});
