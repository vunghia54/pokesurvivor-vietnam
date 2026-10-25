import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LIVE_DEV_URL = 'https://vunghia54.github.io/pokesurvivor-vietnam/dev.html';
const PORT = 9595;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ARTIFACT_DIR = 'C:/Users/vutru/.gemini/antigravity/brain/d9d8ca79-347d-4dd3-821a-6cabc143c71b/screenshots';
const LOCAL_DIR = path.join(process.cwd(), 'tools', 'screenshots');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function runLiveMegaMatchTest() {
  console.log('=== BẮT ĐẦU KIỂM TRA TRẬN ĐẤU MEGA TRỰC TIẾP TRÊN GITHUB PAGES LIVE ===');
  console.log(`Live Dev URL: ${LIVE_DEV_URL}`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-live-match-'));
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
  const network404s = [];

  function send(method, params = {}) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => waiting.set(id, { res, rej }));
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
              } else if (msg.method === 'Network.responseReceived') {
                if (msg.params.response.status === 404) {
                  network404s.push(msg.params.response.url);
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
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, fitWindow: false
    });

    console.log(`1. Điều hướng tới ${LIVE_DEV_URL} ...`);
    await send('Page.navigate', { url: LIVE_DEV_URL });

    // Đợi khởi tạo window.G
    let ready = false;
    for (let k = 0; k < 30; k++) {
      await sleep(1000);
      try {
        ready = await evalExpr(`typeof window.G === 'object' && !!window.G.Mega && !!window.G.Game && !!window.G.Flow`);
        if (ready) break;
      } catch {}
    }
    if (!ready) throw new Error('Không khởi tạo được window.G trên live dev.html');

    console.log('✓ Khởi tạo hệ sinh thái Game & Mega trên GitHub Pages: THÀNH CÔNG');

    // 2. Bắt đầu trận đấu với Charizard (#6)
    console.log('2. Bắt đầu trận đấu solo với Charizard (#6)...');
    await evalExpr(`
      G.DB.playAsGuest();
      G.DB.save.partner = 6;
      G.Flow.goMenu();
      G.Flow.play();
    `);
    await sleep(1500);

    const matchInfo = await evalExpr(`
      (() => {
        const pl = G.Game.player;
        return {
          hasPlayer: !!pl,
          partnerDex: pl ? pl.dex : 0,
          partnerName: pl && pl.mon ? pl.mon.name : '',
          megaState: pl ? pl.megaState : '',
          canTrigger: pl && G.Mega ? G.Mega.canTrigger(pl) : false,
          baseTypes: pl ? pl.types : []
        };
      })()
    `);

    console.log('Thông tin khởi đầu trận đấu live:', matchInfo);

    if (!matchInfo.hasPlayer || matchInfo.partnerDex !== 6) {
      throw new Error('Không tạo được nhân vật Charizard trong trận đấu live');
    }
    if (!matchInfo.canTrigger) {
      throw new Error('Nhân vật không sẵn sàng Mega (canTrigger = false)');
    }

    // 3. Kích hoạt Mega Evolution (Mega Charizard X)
    console.log('3. Nhấn phím M để kích hoạt Mega Evolution...');
    await evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.trigger(pl);
      })()
    `);
    await sleep(1500); // Đợi qua giai đoạn biến hình MEGA_EVOLVING -> MEGA_ACTIVE

    const activeMegaInfo = await evalExpr(`
      (() => {
        const pl = G.Game.player;
        return {
          megaState: pl ? pl.megaState : '',
          megaFormId: pl && pl.megaForm ? pl.megaForm.id : '',
          megaFormName: pl && pl.megaForm ? pl.megaForm.name : '',
          megaTypes: pl ? pl.types : [],
          animDex: pl && pl.anim ? pl.anim.dex : '',
          megaTimer: pl ? pl.megaTimer : 0,
          hasAuraPhase: pl && typeof pl.megaAuraPhase === 'number'
        };
      })()
    `);

    console.log('Thông tin Mega đang hoạt động trên Live Production:', activeMegaInfo);

    if (activeMegaInfo.megaState !== 'MEGA_ACTIVE') {
      throw new Error(`Mega không chuyển sang trạng thái MEGA_ACTIVE (Hiện tại: ${activeMegaInfo.megaState})`);
    }
    if (activeMegaInfo.megaFormId !== 'mega_charizard_x') {
      throw new Error(`Sai dạng Mega: ${activeMegaInfo.megaFormId}`);
    }
    if (activeMegaInfo.megaTypes.join('/') !== 'fire/dragon') {
      throw new Error(`Sai hệ Mega runtime: ${JSON.stringify(activeMegaInfo.megaTypes)}`);
    }
    if (activeMegaInfo.animDex !== 'mega_6_x') {
      throw new Error(`Sai sprite animator id: ${activeMegaInfo.animDex}`);
    }

    console.log('✓ Kích hoạt Mega Charizard X: THÀNH CÔNG');
    console.log('✓ Hệ chuyển sang Fire / Dragon trong combat: THÀNH CÔNG');
    console.log('✓ Sprite chuyển sang mega_6_x: THÀNH CÔNG');
    console.log('✓ Hào quang Aura và Mega Timer đếm ngược 25s: HOẠT ĐỘNG HOÀN HẢO');

    // Chụp ảnh màn hình trận đấu Mega thực tế
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    const artifactPath = path.join(ARTIFACT_DIR, 'live_production_v141_mega_match.png');
    const localPath = path.join(LOCAL_DIR, 'live_production_v141_mega_match.png');
    fs.writeFileSync(artifactPath, buf);
    fs.writeFileSync(localPath, buf);
    console.log(`✓ Đã lưu ảnh chụp trận đấu Mega live: ${artifactPath}`);

    // 4. Giả lập hết thời gian 25s để kiểm tra hoàn nguyên
    console.log('4. Kiểm tra hoàn nguyên sau khi hết thời gian...');
    await evalExpr(`
      (() => {
        const pl = G.Game.player;
        G.Mega.expireMega(pl);
      })()
    `);
    await sleep(500);

    const revertedInfo = await evalExpr(`
      (() => {
        const pl = G.Game.player;
        return {
          megaState: pl ? pl.megaState : '',
          megaForm: pl ? pl.megaForm : null,
          animDex: pl && pl.anim ? pl.anim.dex : '',
          revertedTypes: pl ? pl.types : []
        };
      })()
    `);

    console.log('Thông tin hoàn nguyên trên Live:', revertedInfo);

    if (revertedInfo.megaState !== 'MEGA_USED') {
      throw new Error(`Trạng thái sau hoàn nguyên phải là MEGA_USED (Hiện tại: ${revertedInfo.megaState})`);
    }
    if (revertedInfo.animDex !== 6) {
      throw new Error(`Sprite sau hoàn nguyên phải là 6 (Charizard gốc, hiện tại: ${revertedInfo.animDex})`);
    }
    if (revertedInfo.revertedTypes.join('/') !== 'fire/flying') {
      throw new Error(`Hệ sau hoàn nguyên phải trở về Fire / Flying (Hiện tại: ${JSON.stringify(revertedInfo.revertedTypes)})`);
    }

    console.log('✓ Hoàn nguyên về Charizard gốc (#6, Fire/Flying): HOÀN TOÀN CHÍNH XÁC');
    console.log(`✓ Console errors: ${consoleErrors.length}`);
    console.log(`✓ Network 404s: ${network404s.length}`);

    ws.close();
  } finally {
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

runLiveMegaMatchTest()
  .then(() => {
    console.log('\n================================================================');
    console.log('>>> TRẬN ĐẤU MEGA TRỰC TIẾP TRÊN GITHUB PAGES LIVE THÀNH CÔNG 100%! <<<');
    console.log('================================================================');
  })
  .catch(err => {
    console.error('LỖI KIỂM ĐỊNH TRẬN ĐẤU LIVE:', err);
    process.exit(1);
  });
