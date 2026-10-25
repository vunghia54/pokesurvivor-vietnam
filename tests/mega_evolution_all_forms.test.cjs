'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function setupTestEnv() {
  const mockStorage = {};
  global.localStorage = {
    getItem: k => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: k => { delete mockStorage[k]; }
  };
  global.window = global;
  global.addEventListener = () => {};
  global.removeEventListener = () => {};
  global.document = {
    hidden: false,
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => []
  };
  global.performance = { now: () => Date.now() };

  global.G = {
    U: { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) },
    Audio: { sfx: () => {}, music: () => {}, unlock: () => {}, canPlay: () => true },
    Camera: { kick: () => {} },
    FX: { ring: () => {}, text: () => {} },
    Touch: { addButton: () => {} },
    Sprites: {
      playerScale: () => 1,
      playerRadius: () => 18,
      bodyHeight: () => 24,
      hasShiny: () => true,
      preload: () => Promise.resolve(),
      dirFromAngle: () => 0,
      Animator: class {
        constructor(dex, scale, shiny) {
          this.dex = dex;
          this.scale = scale;
          this.shiny = shiny;
          this.cur = 'Idle';
          this.dir = 0;
        }
        loop() {}
        play() {}
        update() {}
        draw() {}
        busy() { return false; }
        progress() { return 1; }
      }
    },
    Stats: {
      fit: () => 1,
      taken: () => 1
    },
    Weather: {
      speedFor: () => 1
    },
    World: {
      liquidEffect: () => ({ slow: 1 })
    },
    Judgment: {
      active: false
    },
    Game: {
      st: { time: 0 }
    },
    Moves: {
      instance: (id, lvl) => ({ id, lvl, cd: 1, t: 0, kind: 'projectile', cat: 'special' })
    }
  };

  const pokedexCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'pokedex.js'), 'utf8');
  eval(pokedexCode);
  const megaSpritesCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'mega-sprites-meta.js'), 'utf8');
  eval(megaSpritesCode);
  const megaCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'systems', 'mega.js'), 'utf8');
  eval(megaCode);
  const playerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'entities', 'player.js'), 'utf8');
  eval(playerCode);

  return global.G;
}

test('1. Kiểm kê toàn bộ Mega Evolution: Tổng số 93 dạng, ID duy nhất, không trùng lặp', () => {
  const G = setupTestEnv();
  const forms = Object.values(G.Mega.FORMS);
  assert.equal(forms.length, 93, 'Tổng số dạng Mega chính thức được cấu hình đầy đủ');

  const ids = new Set();
  for (const f of forms) {
    assert.ok(!ids.has(f.id), `ID không được trùng: ${f.id}`);
    ids.add(f.id);
    assert.ok(f.baseDex > 0, `Base Dex phải hợp lệ: ${f.id}`);
    assert.ok(Array.isArray(f.types) && f.types.length >= 1, `Hệ phải hợp lệ: ${f.id}`);
    assert.ok(typeof f.name === 'string' && f.name.length > 0, `Tên phải hợp lệ: ${f.id}`);
  }
});

test('2. Phân định chính xác: 36 dạng hoàn chỉnh có sprite và 57 dạng khóa an toàn', () => {
  const G = setupTestEnv();
  const forms = Object.values(G.Mega.FORMS);
  const ready = forms.filter(f => f.spriteAvailable);
  const locked = forms.filter(f => !f.spriteAvailable);

  assert.equal(ready.length, 36, 'Đúng 36 dạng có đầy đủ tài nguyên sprite');
  assert.equal(locked.length, 57, 'Đúng 57 dạng chưa có sprite được khóa an toàn');

  for (const r of ready) {
    assert.ok(r.spriteId, `Dạng sẵn sàng phải có spriteId: ${r.id}`);
    assert.ok(G.MEGA_SPRITE_META[r.spriteId], `Metadata sprite phải tồn tại: ${r.spriteId}`);
  }

  for (const l of locked) {
    assert.equal(l.spriteId, null, `Dạng khóa không được gán spriteId: ${l.id}`);
    assert.ok(l.missingReason === 'THIẾU SPRITE' || l.missingReason === 'THIẾU POKÉMON GỐC', `Lý do thiếu rõ ràng: ${l.missingReason}`);
  }
});

test('3. Ghi nhận rõ các dạng thiếu Pokémon gốc trong Pokédex 966 loài hiện có', () => {
  const G = setupTestEnv();
  const pyroar = G.Mega.FORMS['mega_pyroar'];
  const falinks = G.Mega.FORMS['mega_falinks'];

  assert.ok(pyroar, 'Mega Pyroar phải có trong danh mục');
  assert.equal(pyroar.missingReason, 'THIẾU POKÉMON GỐC');
  assert.equal(G.DEX_BY[pyroar.baseDex], undefined, 'Pyroar không có trong G.DEX');

  assert.ok(falinks, 'Mega Falinks phải có trong danh mục');
  assert.equal(falinks.missingReason, 'THIẾU POKÉMON GỐC');
  assert.equal(G.DEX_BY[falinks.baseDex], undefined, 'Falinks không có trong G.DEX');
});

test('4. Kiểm tra toàn bộ 36 dạng khả dụng: file sprite thật trên ổ đĩa và animation metadata', () => {
  const G = setupTestEnv();
  const ready = Object.values(G.Mega.FORMS).filter(f => f.spriteAvailable);
  const root = path.join(__dirname, '..');

  for (const r of ready) {
    const meta = G.MEGA_SPRITE_META[r.spriteId];
    assert.ok(meta, `Metadata tồn tại cho ${r.spriteId}`);
    assert.ok(meta.a.Idle && meta.a.Walk && meta.a.Attack, `Đủ 3 hoạt ảnh cốt lõi cho ${r.spriteId}`);

    const dir = path.join(root, 'assets', 'pokemon', r.spriteId);
    assert.ok(fs.existsSync(path.join(dir, 'Idle.png')), `Idle.png tồn tại: ${r.spriteId}`);
    assert.ok(fs.existsSync(path.join(dir, 'Walk.png')), `Walk.png tồn tại: ${r.spriteId}`);
    assert.ok(fs.existsSync(path.join(dir, 'Attack.png')), `Attack.png tồn tại: ${r.spriteId}`);
  }
});

test('5. Tùy chọn đa hình thái (Charizard X/Y, Mewtwo X/Y, Lucario/Z, Absol/Z): Chặn tuyệt đối dạng chưa có sprite', () => {
  const G = setupTestEnv();

  // Charizard: X sẵn sàng, Y khóa
  assert.equal(G.Mega.setPreference(6, 'mega_charizard_x'), true, 'Cho phép chọn Charizard X');
  assert.equal(G.Mega.setPreference(6, 'mega_charizard_y'), false, 'Chặn chọn Charizard Y');

  // Mewtwo: Y sẵn sàng, X khóa
  assert.equal(G.Mega.setPreference(150, 'mega_mewtwo_y'), true, 'Cho phép chọn Mewtwo Y');
  assert.equal(G.Mega.setPreference(150, 'mega_mewtwo_x'), false, 'Chặn chọn Mewtwo X');

  // Lucario: Base Mega sẵn sàng, Z khóa
  assert.equal(G.Mega.setPreference(448, 'mega_lucario'), true, 'Cho phép chọn Mega Lucario');
  assert.equal(G.Mega.setPreference(448, 'mega_lucario_z'), false, 'Chặn chọn Mega Lucario Z');

  // Absol: Base Mega sẵn sàng, Z khóa
  assert.equal(G.Mega.setPreference(359, 'mega_absol'), true, 'Cho phép chọn Mega Absol');
  assert.equal(G.Mega.setPreference(359, 'mega_absol_z'), false, 'Chặn chọn Mega Absol Z');

  // Garchomp: cả 2 dạng đều chưa có sprite -> không thể chọn dạng nào
  assert.equal(G.Mega.setPreference(445, 'mega_garchomp'), false, 'Chặn chọn Mega Garchomp');
  assert.equal(G.Mega.setPreference(445, 'mega_garchomp_z'), false, 'Chặn chọn Mega Garchomp Z');
  assert.equal(G.Mega.hasMega(445), false, 'Garchomp chưa thể kích hoạt Mega');
});

test('6. Kiểm tra toàn bộ 36 dạng khả dụng: Player khởi tạo, biến hình, kích hoạt modifier và hoàn nguyên sau 25s', () => {
  const G = setupTestEnv();
  const ready = Object.values(G.Mega.FORMS).filter(f => f.spriteAvailable);

  for (const f of ready) {
    const mon = G.DEX_BY[f.baseDex];
    assert.ok(mon, `Base Pokémon phải tồn tại trong G.DEX: ${f.baseDex}`);
    const pl = new G.Player(mon, {}, false);
    assert.equal(G.Mega.hasMega(f.baseDex), true, `${f.name} có khả năng Mega`);

    G.Mega.onRunStart(pl);
    assert.equal(pl.megaState, 'MEGA_READY', `${f.name} sẵn sàng`);

    const triggerOk = G.Mega.trigger(pl);
    assert.equal(triggerOk, true, `${f.name} kích hoạt thành công`);
    assert.equal(pl.megaState, 'MEGA_EVOLVING', `${f.name} đang biến hình`);

    // Tua qua 1.2s biến hình
    G.Mega.update(pl, 1.25);
    assert.equal(pl.megaState, 'MEGA_ACTIVE', `${f.name} hoàn thành biến hình`);
    assert.equal(pl.megaForm.id, f.id, `Đúng form ID: ${f.id}`);
    assert.deepEqual(pl.types, f.types, `Hệ sau Mega đúng chuẩn: ${f.name}`);

    // Chỉ số tăng trưởng
    const baseAtk = pl.mon.atk;
    assert.ok(pl.atkFor({ cat: 'physical' }) >= baseAtk, `Sát thương tăng khi Mega: ${f.name}`);

    // Sau 25 giây -> tự động hoàn nguyên
    G.Mega.update(pl, 25.1);
    assert.equal(pl.megaState, 'MEGA_USED', `${f.name} đã dùng và trở về dạng thường`);
    assert.equal(pl.megaForm, null, `${f.name} giải phóng form`);

    // Không thể kích hoạt lần 2
    assert.equal(G.Mega.canTrigger(pl), false, `${f.name} không thể kích hoạt lần 2 trong run`);
  }
});

test('7. Đồng bộ Co-op cho toàn bộ 36 dạng: Puppet nhận đúng Animator, Aura và hoàn nguyên đồng thời', () => {
  const G = setupTestEnv();
  const ready = Object.values(G.Mega.FORMS).filter(f => f.spriteAvailable);

  for (const f of ready) {
    const mon = G.DEX_BY[f.baseDex];
    assert.ok(mon, `Base Pokémon phải tồn tại trong G.DEX: ${f.baseDex}`);
    const puppet = new G.Player(mon, {}, false);
    puppet.remote = true;

    // Nhận sự kiện Mega từ đồng đội với thời gian còn lại 18 giây
    G.Mega.applyPuppet(puppet, f.id, false, 18);
    assert.equal(puppet.megaState, 'MEGA_ACTIVE');
    assert.equal(puppet.megaForm.id, f.id);
    assert.equal(puppet.megaTimer, 18, 'Nhận đúng thời gian còn lại (Late Joiner)');
    assert.equal(puppet.anim.dex, f.spriteId, 'Puppet nạp đúng Mega Sprite');

    // Nhận sự kiện hoàn nguyên
    G.Mega.applyPuppet(puppet, '', false);
    assert.equal(puppet.megaState, 'MEGA_USED');
    assert.equal(puppet.megaForm, null);
    assert.equal(puppet.anim.dex, f.baseDex, 'Puppet trở về base Dex');
  }
});

test('8. Kiểm tra toàn bộ 7 file hoạt ảnh và biến thể Shiny trên ổ đĩa cho 36 dạng', () => {
  const G = setupTestEnv();
  const ready = Object.values(G.Mega.FORMS).filter(f => f.spriteAvailable);
  const root = path.join(__dirname, '..');
  const REQUIRED = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];

  for (const r of ready) {
    const meta = G.MEGA_SPRITE_META[r.spriteId];
    assert.ok(meta, `Metadata tồn tại cho ${r.spriteId}`);
    
    // Kiểm tra metadata có đủ 7 hoạt ảnh và đều có 8 hướng
    for (const a of REQUIRED) {
      assert.ok(meta.a[a], `${r.spriteId} phải có anim ${a} trong metadata`);
      assert.equal(meta.a[a].r, 8, `${r.spriteId} anim ${a} phải có đủ 8 hướng`);
    }

    const dir = path.join(root, 'assets', 'pokemon', r.spriteId);
    assert.ok(fs.existsSync(dir), `Thư mục assets/pokemon/${r.spriteId} phải tồn tại`);

    for (const a of REQUIRED) {
      assert.ok(fs.existsSync(path.join(dir, `${a}.png`)), `assets/pokemon/${r.spriteId}/${a}.png phải tồn tại`);
    }

    if (meta.sh) {
      const sDir = path.join(dir, 's');
      assert.ok(fs.existsSync(sDir), `Thư mục shiny s/ phải tồn tại cho ${r.spriteId}`);
      for (const a of REQUIRED) {
        assert.ok(fs.existsSync(path.join(sDir, `${a}.png`)), `assets/pokemon/${r.spriteId}/s/${a}.png phải tồn tại`);
      }
    }
  }
});

test('9. Kiểm định an toàn chống kích hoạt lặp và Aura Canvas rendering không lỗi', () => {
  const G = setupTestEnv();
  const ready = Object.values(G.Mega.FORMS).filter(f => f.spriteAvailable);

  const fakeCtx = {
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
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };

  for (const f of ready) {
    const mon = G.DEX_BY[f.baseDex];
    const pl = new G.Player(mon, {}, false);
    G.Mega.setPreference(f.baseDex, f.id);
    G.Mega.onRunStart(pl);
    G.Mega.trigger(pl);
    G.Mega.update(pl, 1.25);

    // Kiểm tra chống kích hoạt 2 lần
    assert.equal(G.Mega.canTrigger(pl), false, 'Không thể kích hoạt khi đang active');
    assert.equal(G.Mega.trigger(pl), false, 'trigger trả về false khi đã active');

    // Kiểm tra drawAura chạy mượt mà không văng exception
    assert.doesNotThrow(() => {
      G.Mega.drawAura(fakeCtx, pl);
    }, `drawAura không được gây lỗi cho ${f.id}`);
  }
});

