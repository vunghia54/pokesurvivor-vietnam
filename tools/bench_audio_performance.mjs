import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9580;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runBenchmark(label = 'baseline') {
  console.log(`\n=================== STARTING BENCHMARK: ${label.toUpperCase()} ===================`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `ps-bench-${label}-`));
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

    console.log('Navigating to http://localhost:8766/dev.html...');
    await send('Page.navigate', { url: 'http://localhost:8766/dev.html' });
    
    // Wait for bundle to load and tap-start to be available
    console.log('Waiting for game to boot...');
    await sleep(1500);
    for (let i = 0; i < 40; i++) {
      const ready = await evalExpr(`typeof window.G !== 'undefined' && !!window.G.Flow`);
      if (ready) break;
      await sleep(200);
    }

    // Boot and enter guest mode
    await evalExpr(`
      (() => {
        const tap = document.getElementById('tap-start');
        if (tap && !tap.classList.contains('hidden')) tap.click();
        const bg = document.getElementById('btn-guest');
        if (bg) bg.click();
      })()
    `);
    await sleep(600);

    // Answer quiz or setup starter partner directly
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
      })()
    `);
    await sleep(600);

    // Transition cleanly to main menu
    await evalExpr(`
      (() => {
        const resOk = document.getElementById('res-ok');
        if (resOk && !document.getElementById('scr-result')?.classList.contains('hidden')) resOk.click();
        document.querySelectorAll('.scr').forEach(s => s.classList.add('hidden'));
        document.getElementById('scr-menu')?.classList.remove('hidden');
        document.body.classList.remove('in-subscreen');
        document.getElementById('topbar')?.classList.remove('hidden');
        if (window.G?.Flow?.goMenu) window.G.Flow.goMenu();
      })()
    `);
    await sleep(500);

    // Unlock audio
    const audioState = await evalExpr(`
      (() => {
        if (window.G?.Audio?.unlock) window.G.Audio.unlock();
        return {
          canPlay: window.G?.Audio?.canPlay(),
          running: window.G?.Audio?.running,
          track: window.G?.Audio?.track
        };
      })()
    `);
    console.log('Audio state after unlock:', audioState);
    await sleep(300);

    console.log('Setting up Audio & Performance hooks in browser...');
    // Hook Web Audio node creation and Analyser probe
    await evalExpr(`
      (() => {
        window.__audioMetrics = {
          oscillatorsCreated: 0,
          gainsCreated: 0,
          filtersCreated: 0,
          bufferSourcesCreated: 0,
          nodesActiveEstimate: 0,
          sfxCalls: {},
          sfxThrottled: {},
          peak: 0,
          clippingCount: 0,
          sumSquares: 0,
          samplesCount: 0
        };

        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const origOsc = AC.prototype.createOscillator;
          AC.prototype.createOscillator = function(...args) {
            window.__audioMetrics.oscillatorsCreated++;
            const node = origOsc.apply(this, args);
            return node;
          };

          const origGain = AC.prototype.createGain;
          AC.prototype.createGain = function(...args) {
            window.__audioMetrics.gainsCreated++;
            const node = origGain.apply(this, args);
            return node;
          };

          const origFilt = AC.prototype.createBiquadFilter;
          AC.prototype.createBiquadFilter = function(...args) {
            window.__audioMetrics.filtersCreated++;
            const node = origFilt.apply(this, args);
            return node;
          };

          const origBufSrc = AC.prototype.createBufferSource;
          AC.prototype.createBufferSource = function(...args) {
            window.__audioMetrics.bufferSourcesCreated++;
            const node = origBufSrc.apply(this, args);
            return node;
          };
        }

        // Hook G.Audio.sfx to count calls
        const G = window.G;
        const origSfx = G.Audio.sfx;
        G.Audio.sfx = function(name, opts) {
          window.__audioMetrics.sfxCalls[name] = (window.__audioMetrics.sfxCalls[name] || 0) + 1;
          return origSfx.apply(this, arguments);
        };
      })()
    `);

    console.log('Starting Run with 8 Multi-Cast skills and 80 enemies...');
    await evalExpr(`
      (() => {
        window.G.Flow.play();
      })()
    `);
    await sleep(800);

    // Configure 8 distinct skills and spawn dense enemies
    await evalExpr(`
      (() => {
        const G = window.G;
        const pl = G.Game.everyone()[0];
        // Give 8 skills of different kinds
        const moveIds = ['flamethrower', 'hydro-pump', 'thunderbolt', 'psychic', 'vine-whip', 'ice-beam', 'fire-spin', 'discharge'];
        pl.moves = [];
        pl.slots = [];
        for (const id of moveIds) {
          pl.addMove(id);
        }
        pl.setActive(0);
        // Set simultaneous casting mode
        if (G.Settings) G.Settings.set('autoSkillMode', 'simultaneous');
        pl.hp = pl.maxHp = 99999; // Don't die during benchmark
        
        // Spawn 80 enemies around player
        const def = G.Enemies.bagAt(0)[0];
        const bossDef = G.Enemies.BOSSES[0] || def;
        for (let i = 0; i < 80; i++) {
          const angle = (i / 80) * Math.PI * 2;
          const dist = 80 + (i % 5) * 40;
          const ex = pl.x + Math.cos(angle) * dist;
          const ey = pl.y + Math.sin(angle) * dist;
          const e = new G.Enemy(def, ex, ey, 1);
          e.hp = e.maxHp = 500;
          G.EnemyMgr.add(e);
        }
        // Spawn a boss
        const b = new G.Enemy(bossDef, pl.x + 150, pl.y, 3, true);
        b.hp = b.maxHp = 5000;
        G.EnemyMgr.add(b);
      })()
    `);

    // Attach real-time audio monitor to master compressor
    await evalExpr(`
      (() => {
        const an = window.__analyser = G.Audio.debugStream ? null : null;
        // Access AudioContext via G.Audio internal or hook
        // We can hook Analyser to master if accessible or measure via debugMeter
        window.__frameTimes = [];
        let lastT = performance.now();
        window.__fpsId = requestAnimationFrame(function loop(t) {
          const dt = t - lastT;
          lastT = t;
          window.__frameTimes.push(dt);
          window.__fpsId = requestAnimationFrame(loop);
        });
      })()
    `);

    console.log('Running combat simulation for 5000ms...');
    // While combat runs, run debugMeter to measure Peak and RMS
    const meterPromise = evalExpr(`G.Audio.debugMeter(4500)`);
    await sleep(4800);
    const meterResult = await meterPromise;
    console.log('DebugMeter Result:', meterResult);

    // Stop frame recording and collect data
    const combatData = await evalExpr(`
      (() => {
        cancelAnimationFrame(window.__fpsId);
        const fts = window.__frameTimes.slice(10); // omit first warmups
        const total = fts.length;
        fts.sort((a, b) => a - b);
        const sum = fts.reduce((a, b) => a + b, 0);
        const avgDt = sum / total;
        const avgFps = 1000 / avgDt;
        const p50 = fts[Math.floor(total * 0.50)];
        const p95 = fts[Math.floor(total * 0.95)];
        const p99 = fts[Math.floor(total * 0.99)];
        const maxDt = fts[total - 1];
        const minFps = 1000 / maxDt;

        const mem = window.performance?.memory ? {
          usedJSHeapSizeMB: +(window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
          totalJSHeapSizeMB: +(window.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2)
        } : null;

        const metrics = window.__audioMetrics;
        const totalNodesCreated = metrics.oscillatorsCreated + metrics.gainsCreated + metrics.filtersCreated + metrics.bufferSourcesCreated;

        return {
          totalFrames: total,
          avgFps: +avgFps.toFixed(1),
          minFps: +minFps.toFixed(1),
          frameTimeP50: +p50.toFixed(2),
          frameTimeP95: +p95.toFixed(2),
          frameTimeP99: +p99.toFixed(2),
          totalNodesCreated,
          oscillatorsCreated: metrics.oscillatorsCreated,
          gainsCreated: metrics.gainsCreated,
          filtersCreated: metrics.filtersCreated,
          bufferSourcesCreated: metrics.bufferSourcesCreated,
          sfxCalls: metrics.sfxCalls,
          memory: mem
        };
      })()
    `);

    // Now test Mute behavior:
    console.log('Testing Mute behavior: does scheduler keep creating nodes when muted?');
    await evalExpr(`
      (() => {
        G.Audio.toggleMute(); // Mute audio
        window.__audioMetrics.oscillatorsMuted = 0;
        window.__audioMetrics.gainsMuted = 0;
        window.__audioMetrics.filtersMuted = 0;
        
        const AC = window.AudioContext || window.webkitAudioContext;
        // Count during 1.5 seconds of mute
      })()
    `);
    const preMuteOsc = combatData.oscillatorsCreated;
    const preMuteGains = combatData.gainsCreated;
    await sleep(1500);
    const postMuteCounts = await evalExpr(`
      (() => {
        return {
          oscDiff: window.__audioMetrics.oscillatorsCreated - ${preMuteOsc},
          gainDiff: window.__audioMetrics.gainsCreated - ${preMuteGains}
        };
      })()
    `);
    console.log('Nodes created during 1500ms MUTE:', postMuteCounts);

    // Unmute
    await evalExpr(`G.Audio.toggleMute()`);

    // Test rapid music transitions:
    console.log('Testing rapid music transitions...');
    const rapidTransitionsResult = await evalExpr(`
      (() => {
        const tracks = ['forest', 'cave', 'volcano', 'boss', 'village'];
        for (const t of tracks) {
          G.Audio.music(t);
        }
        return {
          currentTrack: G.Audio.track
        };
      })()
    `);
    console.log('Rapid transitions result:', rapidTransitionsResult);

    const report = {
      label,
      timestamp: new Date().toISOString(),
      audio: {
        peak: meterResult?.peak ?? null,
        rms: meterResult?.rms ?? null,
        nodesCreatedIn5sCombat: combatData.totalNodesCreated,
        breakdown: {
          oscillators: combatData.oscillatorsCreated,
          gains: combatData.gainsCreated,
          filters: combatData.filtersCreated,
          bufferSources: combatData.bufferSourcesCreated
        },
        nodesCreatedWhileMuted1500ms: postMuteCounts,
        sfxCallsCount: Object.values(combatData.sfxCalls).reduce((a, b) => a + b, 0),
        sfxCallsBreakdown: combatData.sfxCalls
      },
      performance: {
        avgFps: combatData.avgFps,
        minFps: combatData.minFps,
        frameTimeP50: combatData.frameTimeP50,
        frameTimeP95: combatData.frameTimeP95,
        frameTimeP99: combatData.frameTimeP99,
        memory: combatData.memory
      },
      consoleErrors
    };

    console.log('\n=================== BENCHMARK REPORT: ' + label.toUpperCase() + ' ===================');
    console.log(JSON.stringify(report, null, 2));

    const outPath = `tools/benchmark_${label}.json`;
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Saved report to ${outPath}`);

    return report;
  } finally {
    try { chrome.kill(); } catch {}
  }
}

const label = process.argv[2] || 'baseline';
runBenchmark(label).catch(e => {
  console.error('Benchmark error:', e);
  process.exit(1);
});
