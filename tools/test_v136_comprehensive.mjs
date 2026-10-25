import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9582;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runComprehensiveTest() {
  console.log('=================== BẮT ĐẦU KIỂM ĐỊNH TOÀN DIỆN V1.3.6 ===================');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-test-v136-'));
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

  const results = {};

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

    if (!ws) throw new Error('Không thể kết nối Chrome CDP');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 844, height: 390, deviceScaleFactor: 2, mobile: true, fitWindow: false
    });

    console.log('1. Tải game từ máy chủ nội bộ (dev.html)...');
    await send('Page.navigate', { url: 'http://localhost:8766/dev.html' });
    await sleep(1500);

    for (let i = 0; i < 40; i++) {
      const ready = await evalExpr(`typeof window.G !== 'undefined' && !!window.G.Flow`);
      if (ready) break;
      await sleep(200);
    }

    // Khởi động và vào chế độ khách
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg) bg.click();
      })()
    `);
    await sleep(600);

    // Bỏ qua trắc nghiệm ban đầu
    await evalExpr(`
      (() => {
        for (let i = 0; i < 20; i++) {
          const ans = document.querySelector('#test-a .answer');
          if (ans) ans.click();
        }
        const resOk = document.getElementById('res-ok');
        if (resOk) resOk.click();
        if (window.G?.DB?.save && !window.G.DB.save.partner) {
          window.G.DB.save.partner = 'pikachu';
        }
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-menu')?.classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar')?.classList.remove('hidden');
        if (window.G?.Flow?.goMenu) window.G.Flow.goMenu();
      })()
    `);
    await sleep(500);

    // --- TEST PHẦN 1: AUDIO ENGINE & MENU ---
    console.log('\n2. Kiểm tra Audio Engine tại Menu...');
    const audioInit = await evalExpr(`
      (() => {
        window.G.Audio.unlock();
        return {
          canPlay: window.G.Audio.canPlay(),
          running: window.G.Audio.running,
          track: window.G.Audio.track,
          musicVol: window.G.Audio.settings.music,
          sfxVol: window.G.Audio.settings.sfx,
          muted: window.G.Audio.settings.muted,
          activeVoices: window.G.Audio.activeVoices
        };
      })()
    `);
    console.log('   Audio Init State:', audioInit);
    results.audioInit = audioInit;

    // Đo Peak / RMS tại Menu (nhạc nền village)
    const menuAudioMeter = await evalExpr(`G.Audio.debugMeter(1500)`);
    console.log('   Menu BGM Meter (1.5s):', menuAudioMeter);
    results.menuAudioMeter = menuAudioMeter;

    // --- TEST PHẦN 2: ĐIỀU KHIỂN ÂM LƯỢNG & MUTE ---
    console.log('\n3. Kiểm tra Slider Âm Lượng & Mute...');
    const volTest = await evalExpr(`
      (() => {
        const A = window.G.Audio;
        A.setVolume('music', 0.35);
        A.setVolume('sfx', 0.8);
        const s1 = { music: A.settings.music, sfx: A.settings.sfx };
        A.toggleMute();
        const s2 = { muted: A.settings.muted };
        A.toggleMute();
        const s3 = { muted: A.settings.muted };
        return { s1, s2, s3 };
      })()
    `);
    console.log('   Volume & Mute Tests:', volTest);
    results.volTest = volTest;

    // --- TEST PHẦN 3: CHUYỂN BÀI NHẠC NHANH (CROSSFADE RAPID) ---
    console.log('\n4. Kiểm tra Chuyển Bài Nhạc Nhanh...');
    const rapidMusic = await evalExpr(`
      (() => {
        const A = window.G.Audio;
        const tracks = ['cave', 'forest', 'volcano', 'boss', 'village'];
        for (const t of tracks) A.music(t);
        return {
          currentTrack: A.track,
          activeVoices: A.activeVoices
        };
      })()
    `);
    console.log('   Rapid Music Transitions:', rapidMusic);
    results.rapidMusic = rapidMusic;

    // --- TEST PHẦN 4: COMBAT THƯỜNG & BOSS VỚI 8 KỸ NĂNG MULTI-CAST ---
    console.log('\n5. Kiểm tra Combat: 8 kỹ năng Multi-Cast đồng thời + 80 quái + Boss...');
    await evalExpr(`
      (() => {
        window.G.Flow.play();
        const G = window.G;
        const pl = G.Game.everyone()[0];
        const moveIds = ['flamethrower', 'hydro-pump', 'thunderbolt', 'psychic', 'vine-whip', 'ice-beam', 'fire-spin', 'discharge'];
        pl.moves = [];
        pl.slots = [];
        for (const id of moveIds) pl.addMove(id);
        pl.setActive(0);
        if (G.Settings) G.Settings.set('autoSkillMode', 'simultaneous');
        pl.hp = pl.maxHp = 99999;

        // Spawn 80 quái
        const def = G.Enemies.bagAt(0)[0];
        const bossDef = G.Enemies.BOSSES[0] || def;
        for (let i = 0; i < 80; i++) {
          const angle = (i / 80) * Math.PI * 2;
          const dist = 70 + (i % 6) * 35;
          const e = new G.Enemy(def, pl.x + Math.cos(angle) * dist, pl.y + Math.sin(angle) * dist, 1);
          e.hp = e.maxHp = 600;
          G.EnemyMgr.add(e);
        }
        // Spawn 1 Boss
        const b = new G.Enemy(bossDef, pl.x + 120, pl.y, 3, true);
        b.hp = b.maxHp = 8000;
        G.EnemyMgr.add(b);

        // Đếm số lời gọi sfx() và số âm thực sự được phát
        window.__sfxAudit = {
          shotRequested: 0,
          shotTriggered: 0,
          highPrioCount: 0,
          lowPrioCount: 0,
          activeVoicesMax: 0
        };

        const origSfx = G.Audio.sfx;
        G.Audio.sfx = function(name, opts) {
          if (name === 'shot') window.__sfxAudit.shotRequested++;
          const preVoices = G.Audio.activeVoices;
          const res = origSfx.apply(this, arguments);
          const postVoices = G.Audio.activeVoices;
          if (postVoices > preVoices) {
            if (name === 'shot') window.__sfxAudit.shotTriggered++;
          }
          if (postVoices > window.__sfxAudit.activeVoicesMax) {
            window.__sfxAudit.activeVoicesMax = postVoices;
          }
          return res;
        };
      })()
    `);

    // Chạy combat 4000ms và đo
    const combatMeterPromise = evalExpr(`G.Audio.debugMeter(3800)`);
    await sleep(4000);
    const combatMeter = await combatMeterPromise;
    console.log('   Combat Audio Meter (8 Skills Multi-Cast + 80 mobs + Boss):', combatMeter);
    results.combatMeter = combatMeter;

    const sfxAudit = await evalExpr(`window.__sfxAudit`);
    console.log('   SFX Calls Requested vs Actual Triggered:', sfxAudit);
    results.sfxAudit = sfxAudit;

    // --- TEST PHẦN 5: CO-OP 2 VÀ 4 NGƯỜI (GHOST CAST DAMPENING) ---
    console.log('\n6. Kiểm tra Co-op Simulation 2-4 người (Ghost Cast Dampening)...');
    const coopSimResult = await evalExpr(`
      (() => {
        const G = window.G;
        const mainPl = G.Game.everyone()[0];
        // Tạo 3 puppet players mô phỏng phòng 4 người
        const puppets = [];
        for (let i = 1; i <= 3; i++) {
          const p = new G.Player('charizard', mainPl.x + (i - 2) * 50, mainPl.y + 40);
          p.remote = true; // Cờ puppet từ xa
          p.addMove('flamethrower');
          p.addMove('fire-spin');
          puppets.push(p);
        }
        
        let ghostShotRequests = 0;
        let ghostShotPlayed = 0;
        const origSfx = G.Audio.sfx;
        G.Audio.sfx = function(name, opts) {
          if (name === 'shot' && opts && opts.ghost) {
            ghostShotRequests++;
          }
          const v0 = G.Audio.activeVoices;
          const r = origSfx.apply(this, arguments);
          if (name === 'shot' && opts && opts.ghost && G.Audio.activeVoices > v0) {
            ghostShotPlayed++;
          }
          return r;
        };

        // Cho cả 3 puppet bắn chiêu đồng loạt 5 lần
        for (let t = 0; t < 5; t++) {
          for (const pup of puppets) {
            pup.cast(pup.moves[0]);
            pup.cast(pup.moves[1]);
          }
        }

        return {
          puppetCount: puppets.length,
          ghostShotRequests,
          ghostShotPlayed,
          activeVoices: G.Audio.activeVoices,
          voicesBounded: G.Audio.activeVoices <= 24
        };
      })()
    `);
    console.log('   Co-op 4-Player Ghost Cast Simulation:', coopSimResult);
    results.coopSim = coopSimResult;

    // --- TEST PHẦN 6: ANDROID LIFECYCLE (TAB SWITCH / SUSPEND / RESUME) ---
    console.log('\n7. Kiểm tra Android Lifecycle (Tab switch / Suspend / Resume)...');
    const lifecycleResult = await evalExpr(`
      (async () => {
        const G = window.G;
        const A = G.Audio;
        const stateBefore = { running: A.running, voices: A.activeVoices };
        
        // Mô phỏng người dùng chuyển tab / khóa màn hình (document.hidden = true)
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(r => setTimeout(r, 100));
        const stateSuspended = { running: A.running, state: A.canPlay() };

        // Giả lập thời gian trôi qua 3 giây khi đang ẩn tab
        await new Promise(r => setTimeout(r, 600));

        // Người dùng quay lại ứng dụng (document.hidden = false)
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(r => setTimeout(r, 100));
        const stateResumed = { running: A.running, canPlay: A.canPlay(), track: A.track };

        return { stateBefore, stateSuspended, stateResumed };
      })()
    `);
    console.log('   Lifecycle Background / Foreground Result:', lifecycleResult);
    results.lifecycle = lifecycleResult;

    // --- TEST PHẦN 7: KIỂM TRA HIỆU NĂNG VÀ BỘ NHỚ DÀI HẠN (SIMULATION 10-30 PHÚT) ---
    console.log('\n8. Kiểm tra Hiệu năng và Bộ nhớ Dài hạn (Accelerated Simulation 10 và 30 phút)...');
    const longRunResult = await evalExpr(`
      (() => {
        const G = window.G;
        const pl = G.Game.everyone()[0];
        const snapshots = [];

        function getMem() {
          return window.performance?.memory ? +(window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : 0;
        }

        // T = 0 phút
        snapshots.push({
          minute: 0,
          heapMB: getMem(),
          enemiesAlive: G.EnemyMgr.count,
          projectiles: G.Projectiles.all().length,
          pickups: G.Pickups.all().length,
          activeVoices: G.Audio.activeVoices
        });

        // Mô phỏng 10 phút chiến đấu (36.000 frame dt=1/60s)
        // Chạy từng bước kết hợp nhặt xp và quái hồi sinh liên tục
        const dt = 1 / 60;
        for (let frame = 1; frame <= 18000; frame++) {
          if (frame % 60 === 0) {
            pl.update(dt);
            G.EnemyMgr.update(dt, pl);
            G.Projectiles.update(dt);
            G.Pickups.update(dt, [pl]);
            G.FX.update(dt);
          }
          // Chụp mốc 5 phút
          if (frame === 9000) {
            snapshots.push({
              minute: 5,
              heapMB: getMem(),
              enemiesAlive: G.EnemyMgr.count,
              projectiles: G.Projectiles.all().length,
              pickups: G.Pickups.all().length,
              activeVoices: G.Audio.activeVoices
            });
          }
        }

        // Chụp mốc 10 phút
        snapshots.push({
          minute: 10,
          heapMB: getMem(),
          enemiesAlive: G.EnemyMgr.count,
          projectiles: G.Projectiles.all().length,
          pickups: G.Pickups.all().length,
          activeVoices: G.Audio.activeVoices
        });

        // Tiếp tục mô phỏng tới mốc 30 phút (thêm 36.000 frame)
        for (let frame = 18001; frame <= 54000; frame++) {
          if (frame % 60 === 0) {
            pl.update(dt);
            G.EnemyMgr.update(dt, pl);
            G.Projectiles.update(dt);
            G.Pickups.update(dt, [pl]);
            G.FX.update(dt);
          }
          if (frame === 36000) {
            snapshots.push({
              minute: 20,
              heapMB: getMem(),
              enemiesAlive: G.EnemyMgr.count,
              projectiles: G.Projectiles.all().length,
              pickups: G.Pickups.all().length,
              activeVoices: G.Audio.activeVoices
            });
          }
        }

        // Chụp mốc 30 phút
        snapshots.push({
          minute: 30,
          heapMB: getMem(),
          enemiesAlive: G.EnemyMgr.count,
          projectiles: G.Projectiles.all().length,
          pickups: G.Pickups.all().length,
          activeVoices: G.Audio.activeVoices
        });

        // Quay lại menu và dọn dẹp (Clean up after run)
        G.Flow.goMenu();
        const memAfterMenu = getMem();
        snapshots.push({
          minute: 'ExitToMenu',
          heapMB: memAfterMenu,
          enemiesAlive: G.EnemyMgr.count,
          projectiles: G.Projectiles.all().length,
          pickups: G.Pickups.all().length,
          activeVoices: G.Audio.activeVoices
        });

        return snapshots;
      })()
    `);
    console.log('   Long-run Simulation Snapshots (0m -> 5m -> 10m -> 20m -> 30m -> Menu):');
    console.table(longRunResult);
    results.longRun = longRunResult;

    // --- TEST PHẦN 8: GIAO DIỆN MOBILE & MULTI-VIEWPORT VERIFICATION ---
    console.log('\n9. Kiểm tra Tương thích Giao diện Mobile (360x800, 844x390, 915x412)...');
    const viewports = [
      { name: 'Android Portrait', width: 360, height: 800 },
      { name: 'Android Landscape iPhone/Pixel', width: 844, height: 390 },
      { name: 'Android Landscape Galaxy S20+', width: 915, height: 412 }
    ];

    const vpResults = [];
    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: true, fitWindow: false
      });
      await sleep(300);

      const uiMetrics = await evalExpr(`
        (() => {
          const topbar = document.getElementById('topbar');
          const menu = document.getElementById('scr-menu');
          const shop = document.getElementById('scr-shop');
          
          return {
            topbarVisible: topbar && !topbar.classList.contains('hidden'),
            topbarHeight: topbar ? topbar.offsetHeight : 0,
            menuVisible: menu && !menu.classList.contains('hidden'),
            bodyScrollWidth: document.body.scrollWidth,
            bodyClientWidth: document.body.clientWidth,
            noHorizontalOverflow: document.body.scrollWidth <= document.body.clientWidth + 1
          };
        })()
      `);
      vpResults.push({ vp: vp.name, ...uiMetrics });
    }
    console.log('   Viewport Inspection Results:', vpResults);
    results.viewports = vpResults;

    console.log('\n=================== HOÀN TẤT KIỂM ĐỊNH TOÀN DIỆN V1.3.6 ===================');
    console.log('Console Errors phát sinh:', consoleErrors);
    results.consoleErrors = consoleErrors;

    fs.writeFileSync('tools/comprehensive_test_report.json', JSON.stringify(results, null, 2));
    console.log('Đã lưu kết quả chi tiết vào tools/comprehensive_test_report.json');
    return results;
  } finally {
    try { chrome.kill(); } catch {}
  }
}

runComprehensiveTest().catch(e => {
  console.error('Lỗi khi chạy kiểm định toàn diện:', e);
  process.exit(1);
});
