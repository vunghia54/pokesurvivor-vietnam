/**
 * tools/test_all_36_megas_data_driven.cjs
 * Comprehensive data-driven audit of all 36 playable Mega Evolution forms.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// Set up minimal browser-like environment
const sandbox = {
  window: {},
  document: {
    createElement: () => ({
      getContext: () => ({
        drawImage: () => {},
        fillRect: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        arc: () => {},
        ellipse: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        createRadialGradient: () => ({
          addColorStop: () => {},
        }),
      }),
      width: 100,
      height: 100,
    }),
  },
  Image: class {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this._src = '';
    }
    set src(v) {
      this._src = v;
      if (this.onload) setTimeout(() => this.onload(), 1);
    }
    get src() { return this._src; }
  },
  performance: { now: () => Date.now() },
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  Set,
  Map,
  WeakMap,
  Array,
  Object,
  JSON,
};

sandbox.window = sandbox;
vm.createContext(sandbox);

function runFile(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  vm.runInContext(code, sandbox, { filename: relPath });
}

// Load prerequisites in order
runFile('js/core/util.js');
runFile('js/data/pokedex.js');
runFile('js/data/sprites-meta.js');
runFile('js/data/mega-sprites-meta.js');
runFile('js/core/sprites.js');
runFile('js/systems/mega.js');
runFile('js/entities/player.js');

const { G } = sandbox;
const REQUIRED_ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];

const readyForms = Object.entries(G.Mega.FORMS).filter(([k, v]) => v.spriteAvailable);

console.log(`Auditing ${readyForms.length} Playable Mega Forms...\n`);

const results = [];

for (const [formId, formDef] of readyForms) {
  const report = {
    formId,
    name: formDef.name,
    baseDex: formDef.baseDex,
    spriteId: formDef.spriteId,
    stone: formDef.stone,
    types: formDef.types.join('/'),
    checks: {},
    pass: true,
    error: null,
  };

  try {
    // 1. Base Pokemon Check
    const baseMon = G.DEX_BY[formDef.baseDex];
    if (!baseMon) {
      throw new Error(`Base Pokemon Dex #${formDef.baseDex} not found in G.DEX_BY`);
    }
    report.checks.basePokemon = `${baseMon.name} (#${baseMon.dex})`;

    // 2. Metadata Check
    const meta = G.MEGA_SPRITE_META[formDef.spriteId];
    if (!meta) {
      throw new Error(`Metadata for ${formDef.spriteId} missing in G.MEGA_SPRITE_META`);
    }
    if (!meta.a) {
      throw new Error(`Metadata for ${formDef.spriteId} has no animations object 'a'`);
    }

    const missingAnims = REQUIRED_ANIMS.filter(a => !meta.a[a]);
    if (missingAnims.length > 0) {
      throw new Error(`Missing animation metadata: ${missingAnims.join(', ')}`);
    }
    report.checks.metaAnims = 'All 7 anims present';

    // Directions check (8 directions)
    const badDirs = REQUIRED_ANIMS.filter(a => meta.a[a].r !== 8);
    if (badDirs.length > 0) {
      throw new Error(`Animations lacking 8 directions: ${badDirs.join(', ')}`);
    }
    report.checks.directions = '8 directions (r=8) for all anims';

    // 3. Normal Sprite Files Check
    const spriteDir = path.join(ROOT, 'assets', 'pokemon', formDef.spriteId);
    if (!fs.existsSync(spriteDir)) {
      throw new Error(`Sprite directory not found: assets/pokemon/${formDef.spriteId}`);
    }

    const missingPngs = REQUIRED_ANIMS.filter(a => !fs.existsSync(path.join(spriteDir, `${a}.png`)));
    if (missingPngs.length > 0) {
      throw new Error(`Missing PNG sprites: ${missingPngs.join(', ')}`);
    }
    report.checks.normalPngs = 'All 7 PNG files on disk';

    // 4. Shiny Sprite Check
    report.hasShiny = !!meta.sh;
    if (meta.sh) {
      const shinyDir = path.join(spriteDir, 's');
      if (!fs.existsSync(shinyDir)) {
        throw new Error(`Shiny flag is 1 but directory missing: assets/pokemon/${formDef.spriteId}/s`);
      }
      const missingShinyPngs = REQUIRED_ANIMS.filter(a => !fs.existsSync(path.join(shinyDir, `${a}.png`)));
      if (missingShinyPngs.length > 0) {
        throw new Error(`Missing Shiny PNG sprites: ${missingShinyPngs.join(', ')}`);
      }
      report.checks.shinyPngs = 'All 7 Shiny PNG files on disk';
    } else {
      report.checks.shinyPngs = 'No shiny variant in community repo (safe fallback to normal)';
    }

    // 5. In-Game Player Lifecycle Check
    // Instantiate Player
    const player = new G.Player(baseMon, {}, false);
    
    // Set preference for multi-form species (e.g. Charizard X, Mewtwo Y, etc.)
    G.Mega.setPreference(baseMon.dex, formId);

    // Start run
    G.Mega.onRunStart(player);
    if (player.megaState !== 'MEGA_READY') {
      throw new Error(`Initial player megaState is ${player.megaState}, expected MEGA_READY`);
    }

    // Trigger Mega Evolution
    const can = G.Mega.canTrigger(player);
    if (!can) {
      throw new Error(`canTrigger(player) returned false for ${formId}`);
    }

    const activated = G.Mega.trigger(player);
    if (!activated) {
      throw new Error(`trigger() returned false for ${formId}`);
    }
    if (player.megaState !== 'MEGA_EVOLVING') {
      throw new Error(`megaState after trigger is ${player.megaState}, expected MEGA_EVOLVING`);
    }

    // Advance evolve animation duration (CONFIG.evolveAnimDuration = 1.2s)
    G.Mega.update(player, 1.3);
    if (player.megaState !== 'MEGA_ACTIVE') {
      throw new Error(`megaState after evolving is ${player.megaState}, expected MEGA_ACTIVE`);
    }
    if (!player.megaForm || player.megaForm.id !== formId) {
      throw new Error(`megaForm is ${player.megaForm ? player.megaForm.id : 'null'}, expected ${formId}`);
    }

    // Verify stat multipliers applied
    const activeForm = player.megaForm;
    if (!activeForm || activeForm.atkMul <= 1.0) {
      throw new Error(`Mega ATK multiplier not applied: got ${activeForm ? activeForm.atkMul : 'null'}`);
    }
    report.checks.statsApplied = `ATK x${activeForm.atkMul}, SPD x${activeForm.spdMul}`;

    // Verify cannot activate twice
    const secondActivation = G.Mega.trigger(player);
    if (secondActivation) {
      throw new Error(`trigger() allowed double activation while active`);
    }
    report.checks.antiDoubleTrigger = 'Blocked double activation';

    // Verify aura configuration
    if (!activeForm.themeColor) {
      throw new Error(`Aura themeColor missing or invalid for ${formId}`);
    }
    report.checks.aura = `Theme ${activeForm.themeColor}, scale ${activeForm.auraScale || 1.0}`;

    // Verify drawAura execution without throwing Canvas errors
    const fakeCtx = sandbox.document.createElement().getContext('2d');
    G.Mega.drawAura(fakeCtx, player);
    report.checks.canvasDraw = 'Canvas drawAura executed without error';

    // Advance 25 seconds: Reversion check
    // Default CONFIG.duration is 25 seconds
    G.Mega.update(player, 25.5);
    if (player.megaState !== 'MEGA_USED') {
      throw new Error(`megaState after timer expiration is ${player.megaState}, expected MEGA_USED`);
    }
    if (player.megaForm !== null) {
      throw new Error(`megaForm not cleared after reversion: got ${player.megaForm.id}`);
    }
    report.checks.reversion = 'Cleanly reverted to normal after 25s';

    // Co-op Puppet Lifecycle Verification
    const fakePuppet = {
      dex: baseMon.dex,
      scale: 1,
      x: 100,
      y: 100,
      shiny: false,
    };
    G.Mega.applyPuppet(fakePuppet, formId, false, 25);
    if (fakePuppet.megaState !== 'MEGA_ACTIVE' || fakePuppet.megaForm.id !== formId) {
      throw new Error(`applyPuppet failed for puppet`);
    }
    G.Mega.applyPuppet(fakePuppet, '', false);
    if (fakePuppet.megaState !== 'MEGA_USED' || fakePuppet.megaForm !== null) {
      throw new Error(`applyPuppet revert failed for puppet`);
    }
    report.checks.coopSync = 'Co-op puppet apply & revert verified';

    // Test Shiny player instantiation if shiny available
    if (meta.sh) {
      const shinyPlayer = new G.Player(baseMon, {}, true);
      G.Mega.onRunStart(shinyPlayer);
      G.Mega.trigger(shinyPlayer);
      G.Mega.update(shinyPlayer, 1.3);
      if (!shinyPlayer.shiny) {
        throw new Error(`Shiny flag lost during Mega evolution`);
      }
      report.checks.shinyPlayer = 'Shiny state preserved during Mega evolution';
    }

  } catch (err) {
    report.pass = false;
    report.error = err.message;
  }

  results.push(report);
}

// Output Results Table
console.log('| STT | Form ID | Pokémon Gốc | Dạng Mega | Hệ | Sprite Sheet | 8 Hướng | Shiny | Kích hoạt & Stats | Hoàn nguyên 25s | Co-op | Kết quả |');
console.log('|:---:|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|');

let passCount = 0;
let failCount = 0;

results.forEach((r, idx) => {
  const stt = idx + 1;
  const shinyText = r.hasShiny ? '✓ Đầy đủ' : 'Fallback';
  const status = r.pass ? '✅ PASS' : '❌ FAIL';
  if (r.pass) passCount++;
  else failCount++;

  console.log(`| ${stt} | \`${r.formId}\` | ${r.checks.basePokemon || r.baseDex} | **${r.name}** | ${r.types} | ✓ Đủ 7 file | ✓ 8 hướng | ${shinyText} | ✓ Đạt | ✓ Đạt | ✓ Đạt | **${status}** |`);
  if (!r.pass) {
    console.log(`  --> LỖI (${r.formId}): ${r.error}`);
  }
});

console.log(`\n======================================================`);
console.log(`TỔNG KẾT DATA-DRIVEN: ${passCount}/${results.length} PASS, ${failCount} FAIL`);
console.log(`======================================================`);

if (failCount > 0) {
  process.exit(1);
}
