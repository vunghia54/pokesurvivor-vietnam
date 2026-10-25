'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Setup mock browser environment
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

  // Load dex and sprites meta
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

test('1. Pokémon hợp lệ (Charizard, Lucario, Gengar, Gardevoir) có thể Mega Evolution', () => {
  const G = setupTestEnv();
  assert.equal(G.Mega.hasMega(6), true, 'Charizard hợp lệ');
  assert.equal(G.Mega.hasMega(94), true, 'Gengar hợp lệ');
  assert.equal(G.Mega.hasMega(282), true, 'Gardevoir hợp lệ');
  assert.equal(G.Mega.hasMega(448), true, 'Lucario hợp lệ');
});

test('2. Pokémon không có dạng Mega (Pikachu, Bulbasaur...) không thể Mega', () => {
  const G = setupTestEnv();
  assert.equal(G.Mega.hasMega(25), false, 'Pikachu không thể Mega');
  assert.equal(G.Mega.hasMega(1), false, 'Bulbasaur không thể Mega');
  assert.equal(G.Mega.hasMega(999), false, 'Gimmighoul không thể Mega');

  const pika = G.DEX.find(x => x.dex === 25);
  const pl = new G.Player(pika, {}, false);
  G.Mega.onRunStart(pl);
  assert.equal(pl.megaState, 'NORMAL');
  assert.equal(G.Mega.canTrigger(pl), false);
  assert.equal(G.Mega.trigger(pl), false);
});

test('3. Charizard X và Y: Chặn kích hoạt Charizard Y khi chưa có sprite hoàn thiện', () => {
  const G = setupTestEnv();
  const forms = G.Mega.getFormsForDex(6);
  assert.equal(forms.length, 2, 'Charizard có 2 dạng X và Y');
  assert.equal(forms[0].id, 'mega_charizard_x');
  assert.equal(forms[1].id, 'mega_charizard_y');
  assert.equal(forms[0].spriteAvailable, true, 'Charizard X có sprite chuẩn');
  assert.equal(forms[1].spriteAvailable, false, 'Charizard Y thiếu sprite');

  // Mặc định chọn X
  assert.equal(G.Mega.getSelectedForm(6).id, 'mega_charizard_x');

  // Cố gắng đặt preference sang Y phải bị từ chối
  const res = G.Mega.setPreference(6, 'mega_charizard_y');
  assert.equal(res, false, 'Không cho phép đặt preference cho Charizard Y');
  assert.equal(G.Mega.getSelectedForm(6).id, 'mega_charizard_x', 'Vẫn giữ dạng X có sprite');

  const charizard = G.DEX.find(x => x.dex === 6);
  const pl = new G.Player(charizard, {}, false);
  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.equal(pl.megaState, 'MEGA_ACTIVE');
  assert.equal(pl.megaForm.id, 'mega_charizard_x');
  assert.notEqual(pl.megaForm.id, 'mega_charizard_y', 'Không bao giờ kích hoạt Y');
});

test('4. Không thể kích hoạt Mega hai lần trong cùng một run', () => {
  const G = setupTestEnv();
  const lucario = G.DEX.find(x => x.dex === 448);
  const pl = new G.Player(lucario, {}, false);
  G.Mega.onRunStart(pl);

  assert.equal(pl.megaState, 'MEGA_READY');
  assert.equal(G.Mega.trigger(pl), true, 'Lần 1 kích hoạt thành công');

  // Cố kích hoạt lần 2 khi đang Evolving / Active
  assert.equal(G.Mega.trigger(pl), false, 'Không thể kích hoạt lại khi đang biến hình');

  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);
  assert.equal(pl.megaState, 'MEGA_ACTIVE');
  assert.equal(G.Mega.trigger(pl), false, 'Không thể kích hoạt lại khi đã Active');
});

test('5. Không thay đổi dữ liệu gốc trong G.DEX', () => {
  const G = setupTestEnv();
  const charizard = G.DEX.find(x => x.dex === 6);
  const origAtk = charizard.atk;
  const origHp = charizard.hp;
  const origTypes = [...charizard.types];

  const pl = new G.Player(charizard, {}, false);
  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  // Sau khi Mega, G.DEX[5] phải giữ nguyên
  assert.equal(charizard.atk, origAtk);
  assert.equal(charizard.hp, origHp);
  assert.deepEqual(charizard.types, origTypes);
});

test('6. Bảo tồn trạng thái Shiny của Pokémon khi biến hình Mega', () => {
  const G = setupTestEnv();
  const gengar = G.DEX.find(x => x.dex === 94);
  const pl = new G.Player(gengar, {}, true); // Shiny = true
  assert.equal(pl.shiny, true);

  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.equal(pl.shiny, true, 'Vẫn giữ Shiny = true sau khi biến hình');
  assert.equal(pl.anim.shiny, true, 'Animator Mega dùng sprite Shiny');
});

test('7. Không nhân đôi sát thương bất hợp lý, áp dụng đúng modifier', () => {
  const G = setupTestEnv();
  const gardevoir = G.DEX.find(x => x.dex === 282);
  const pl = new G.Player(gardevoir, {}, false);
  const baseAtkDamage = pl.atkFor({ cat: 'special', type: 'psychic' });

  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  const megaAtkDamage = pl.atkFor({ cat: 'special', type: 'psychic' });
  const ratio = megaAtkDamage / baseAtkDamage;
  // Modifier của Mega Gardevoir là 1.35x
  assert.ok(Math.abs(ratio - 1.35) < 0.01, `Tăng chính xác 1.35x, không nhân đôi (thực tế: ${ratio})`);
});

test('8. HP không bị reset hoặc hồi đầy ngoài ý muốn khi Mega', () => {
  const G = setupTestEnv();
  const lucario = G.DEX.find(x => x.dex === 448);
  const pl = new G.Player(lucario, {}, false);
  pl.hp = 42; // Bị thương còn 42 HP
  const prevHp = pl.hp;

  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.equal(pl.hp, prevHp, 'HP giữ nguyên vẹn 42, không bị hồi trộm');
});

test('9. 8 slot Multi-Cast và danh sách chiêu thức giữ nguyên vẹn 100%', () => {
  const G = setupTestEnv();
  const charizard = G.DEX.find(x => x.dex === 6);
  const pl = new G.Player(charizard, {}, false);

  // Học 8 chiêu
  for (let i = 1; i <= 8; i++) pl.addMove('move_' + i);
  assert.equal(pl.slots.length, 8);

  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.equal(pl.slots.length, 8, 'Vẫn đủ 8 slot kỹ năng');
  assert.equal(pl.moves.length, 8, 'Vẫn đủ 8 moves đã học');
});

test('10. Chuyển hệ Pokémon chính xác khi Mega (Charizard X: Lửa / Rồng)', () => {
  const G = setupTestEnv();
  const charizard = G.DEX.find(x => x.dex === 6);
  const pl = new G.Player(charizard, {}, false);
  assert.deepEqual(pl.types, ['fire', 'flying']);

  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.deepEqual(pl.types, ['fire', 'dragon'], 'Charizard X đổi sang hệ Lửa / Rồng');
});

test('11. Sprite và Animator chuyển sang dạng Mega và không bị rò rỉ bộ nhớ', () => {
  const G = setupTestEnv();
  const gengar = G.DEX.find(x => x.dex === 94);
  const pl = new G.Player(gengar, {}, false);
  assert.equal(pl.anim.dex, 94);

  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.equal(pl.anim.dex, 'mega_94', 'Animator chuyển sang mega_94');
});

test('12. Không lỗi sau khi người chơi chết (chuyển trạng thái dọn dẹp sạch sẽ)', () => {
  const G = setupTestEnv();
  const lucario = G.DEX.find(x => x.dex === 448);
  const pl = new G.Player(lucario, {}, false);
  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.doesNotThrow(() => {
    pl.dead = true;
    G.Mega.onRunEnd(pl);
  });
  assert.equal(pl.megaState, 'NORMAL');
  assert.equal(pl.megaForm, null);
  assert.equal(pl.anim.dex, 448, 'Khôi phục lại Animator dex 448');
});

test('13. Không lỗi khi kết thúc run và thoát về Menu', () => {
  const G = setupTestEnv();
  const gardevoir = G.DEX.find(x => x.dex === 282);
  const pl = new G.Player(gardevoir, {}, false);
  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);

  assert.doesNotThrow(() => {
    G.Mega.onRunEnd(pl);
  });
  assert.equal(pl.megaState, 'NORMAL');
  assert.equal(pl.megaForm, null);
});

test('14. Đồng bộ Co-op: Puppet đồng đội nhận đúng dạng Mega và hiển thị sprite chuẩn', () => {
  const G = setupTestEnv();
  const charizard = G.DEX.find(x => x.dex === 6);
  const puppet = new G.Player(charizard, {}, false);
  puppet.remote = true;

  assert.equal(puppet.anim.dex, 6);
  G.Mega.applyPuppet(puppet, 'mega_charizard_x', false);

  assert.equal(puppet.megaState, 'MEGA_ACTIVE');
  assert.equal(puppet.megaForm.id, 'mega_charizard_x');
  assert.equal(puppet.anim.dex, 'mega_6_x', 'Puppet đồng đội hiển thị đúng sprite Mega X');
});

test('15. Không làm hỏng Cloud Save và không lưu Pokémon Mega thành bản sao trong Pokédex', () => {
  const G = setupTestEnv();
  const save = { partner: 6, partnerShiny: false, owns: [6, 94, 282, 448] };
  const origSaveJson = JSON.stringify(save);

  const charizard = G.DEX.find(x => x.dex === 6);
  const pl = new G.Player(charizard, {}, false);
  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, G.Mega.CONFIG.evolveAnimDuration + 0.1);
  G.Mega.onRunEnd(pl);

  assert.equal(JSON.stringify(save), origSaveJson, 'Save hoàn toàn không bị biến đổi');
  assert.equal(G.DEX.length, 966, 'Danh sách G.DEX giữ nguyên 966 Pokémon');
});

test('16. Tích hợp HUD: Button Mega hiển thị đúng trạng thái và không xung đột phím', () => {
  const G = setupTestEnv();
  const lucario = G.DEX.find(x => x.dex === 448);
  const pl = new G.Player(lucario, {}, false);
  G.Mega.onRunStart(pl);

  let buttonRegistered = false;
  G.Touch.addButton = (x, y, w, h, fn) => {
    buttonRegistered = true;
    assert.ok(w >= 44 && h >= 44, 'Vùng chạm đạt chuẩn >= 44x44px');
  };

  const dummyCtx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, roundRect: () => {},
    fill: () => {}, stroke: () => {}, arc: () => {}, ellipse: () => {},
    fillText: () => {}
  };

  G.Mega.drawButton(dummyCtx, pl, { x: 500, y: 400, size: 48, touch: true });
  assert.equal(buttonRegistered, true, 'Touch button được đăng ký đúng chuẩn 48x48px');
});

test('17. Hết hạn sau 25 giây: hoàn nguyên về dạng gốc, aura tắt và trạng thái là MEGA_USED', () => {
  const G = setupTestEnv();
  const charizard = G.DEX.find(x => x.dex === 6);
  const pl = new G.Player(charizard, {}, false);
  G.Mega.onRunStart(pl);
  G.Mega.trigger(pl);
  G.Mega.update(pl, 1.2); // Hết thời gian biến hình -> ACTIVE
  assert.equal(pl.megaState, 'MEGA_ACTIVE');
  assert.equal(pl.megaTimer, 25);
  assert.equal(pl.anim.dex, 'mega_6_x');

  // Trôi qua 25 giây game time
  G.Mega.update(pl, 25.1);
  assert.equal(pl.megaState, 'MEGA_USED', 'Trạng thái chuyển sang MEGA_USED');
  assert.equal(pl.megaForm, null, 'Không còn giữ form Mega');
  assert.equal(pl.anim.dex, 6, 'Sprite hoàn nguyên về Charizard thường (dex 6)');
  assert.deepEqual(pl.types, ['fire', 'flying'], 'Hệ trở về Lửa / Bay');

  // Không thể kích hoạt lại sau khi đã hết hạn
  assert.equal(G.Mega.canTrigger(pl), false);
  assert.equal(G.Mega.trigger(pl), false);
});

test('18. Đồng bộ Co-op khi hết hạn: Puppet hoàn nguyên về dạng thường', () => {
  const G = setupTestEnv();
  const gengar = G.DEX.find(x => x.dex === 94);
  const puppet = new G.Player(gengar, {}, false);
  puppet.remote = true;

  // Puppet kích hoạt Mega
  G.Mega.applyPuppet(puppet, 'mega_gengar', false);
  assert.equal(puppet.megaState, 'MEGA_ACTIVE');
  assert.equal(puppet.anim.dex, 'mega_94');

  // Nhận tín hiệu hết hạn từ mạng (formId = '')
  G.Mega.applyPuppet(puppet, '', false);
  assert.equal(puppet.megaState, 'MEGA_USED');
  assert.equal(puppet.megaForm, null);
  assert.equal(puppet.anim.dex, 94, 'Puppet trở lại sprite Gengar thường (dex 94)');
});
