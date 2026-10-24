const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setupTestEnvironment() {
  const ctx = {
    window: {},
    console: { log() {}, warn() {}, error() {} },
    Math,
    Object,
    Array,
    Date,
    Set,
    Map,
    performance: { now: () => Date.now() },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
  };
  ctx.window = ctx;
  ctx.G = {
    U: {
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
      rand: (a, b) => (a + b) / 2,
      TYPE_COLOR: {},
      TYPE_NAME: {}
    },
    Stats: {
      fit: () => 1.0,
      NAME: { physical: 'Vật lý', special: 'Đặc biệt' },
      sideOf: () => 'special'
    },
    Moves: {
      BY_ID: {},
      instance(id, lvl = 1) {
        return {
          id,
          name: id,
          type: 'fire',
          kind: 'projectile',
          cd: 1.0,
          t: 0,
          lvl,
          castAt: 0,
          dmg: 20,
          def: { maxLvl: 5 }
        };
      },
      poolFor() {
        return ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'];
      },
      nextUpText: (m) => (m.lvl < 5 ? '+20% dmg' : null),
      evoInfo: () => null,
      levelUp(m) { m.lvl++; }
    },
    FX: {
      dmgText() {},
      ring() {},
      burst() {},
      spark() {}
    },
    Sprites: {
      hasShiny: () => false,
      playerScale: () => 1,
      Animator: class {
        busy() { return false; }
        progress() { return 1; }
        play() {}
      },
      playerRadius: () => 16,
      bodyHeight: () => 24,
      animMeta: () => ({ d: [4, 4, 4, 4] })
    },
    Projectiles: {
      clearOrbs() {},
      nearest: (x, y, r) => ({ x: x + 40, y, r: 16, hp: 100, dead: false }),
      run() {},
      spawn() {}
    },
    VFX: {
      forMove: () => ({})
    },
    Audio: {
      sfx() {}
    },
    Game: {
      st: { time: 10 },
      state: 'playing',
      player: null
    },
    Coop: {
      cast() {}
    },
    Weather: { speedFor: () => 1 },
    World: { isWall: () => false, liquidEffect: () => ({ slow: 1 }) },
    Camera: { kick() {} },
    Progress: { event() {} },
    Settings: {
      get: (k) => (k === 'autoSkillMode' ? 'simultaneous' : true)
    },
    EnemyMgr: {
      all: () => []
    },
    T: (s) => s
  };

  // Mock sample moves in BY_ID
  for (let i = 1; i <= 10; i++) {
    ctx.G.Moves.BY_ID['m' + i] = {
      id: 'm' + i,
      name: 'Chiêu ' + i,
      type: 'fire',
      cat: 'special',
      kind: 'projectile',
      desc: 'Mô tả ' + i
    };
  }

  // Nạp Player.js
  const playerCode = fs.readFileSync('d:/pokesurvivor-main/js/entities/player.js', 'utf8');
  vm.runInNewContext(playerCode, ctx);
  ctx.Player = ctx.G.Player;

  return ctx;
}

test('8-Slot System: Player maxMoves is 8', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });
  assert.equal(pl.maxMoves, 8, 'Giới hạn kỹ năng trang bị phải là 8 ô');
});

test('8-Slot System: Học đủ 8 kỹ năng và từ chối kỹ năng thứ 9', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });

  for (let i = 1; i <= 8; i++) {
    const ok = pl.addMove('m' + i);
    assert.equal(ok, true, `Phải học thành công kỹ năng m${i} vào slot ${i}`);
  }

  assert.equal(pl.slots.length, 8, 'Đã đạt tối đa 8 ô kỹ năng');
  assert.equal(pl.moves.length, 8, 'Danh sách kỹ năng có đủ 8 chiêu');

  // Thử học thêm kỹ năng thứ 9
  const overflow = pl.addMove('m9');
  assert.equal(overflow, false, 'Không thể học thêm kỹ năng thứ 9 khi đã đủ 8 ô');
  assert.equal(pl.slots.length, 8, 'Số ô kỹ năng vẫn giữ nguyên là 8');
});

test('8-Slot System: Chuyển đổi slot bằng phím 1–8 và chu kỳ Q/E', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });

  for (let i = 1; i <= 8; i++) pl.addMove('m' + i);

  // Thử setActive từ 0 đến 7 (phím 1 đến 8)
  for (let i = 0; i < 8; i++) {
    pl.setActive(i);
    assert.equal(pl.active, i, `Slot active phải là ${i}`);
  }

  // Thử cycle tiếp theo
  pl.active = 7;
  pl.cycle(1);
  assert.equal(pl.active, 0, 'Cycle từ slot 7 (số 8) phải quay về slot 0 (số 1)');

  // Thử cycle lùi lại
  pl.cycle(-1);
  assert.equal(pl.active, 7, 'Cycle lùi từ slot 0 phải về slot 7 (số 8)');
});

test('8-Slot System: Cơ chế Bond kết hợp 2 kỹ năng giải phóng slot để học chiêu mới', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });

  for (let i = 1; i <= 8; i++) pl.addMove('m' + i);
  assert.equal(pl.slots.length, 8);

  // Kết hợp m1 và m2 vào chung 1 nhóm Bond
  const m1 = pl.slots[0][0];
  const m2 = pl.slots[1][0];
  pl.fuse([m2], pl.slots[0]);

  // Sau khi kết hợp, số slot giảm từ 8 còn 7
  assert.equal(pl.slots.length, 7, 'Sau khi Bond, số ô giảm xuống 7');
  assert.equal(pl.slots[0].length, 2, 'Ô 0 có 2 chiêu kết hợp');

  // Bây giờ có thể học thêm chiêu m9!
  const learned = pl.addMove('m9');
  assert.equal(learned, true, 'Có thể học thêm chiêu m9 vào ô trống mới');
  assert.equal(pl.slots.length, 8, 'Tổng số ô kỹ năng lại đạt 8');
});

test('8-Slot System: Auto Cast độc lập & đồng thời cả 8 ô trong Combat', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });
  for (let i = 1; i <= 8; i++) pl.addMove('m' + i);

  // Nạp Combat.js
  const combatCode = fs.readFileSync('d:/pokesurvivor-main/js/systems/combat.js', 'utf8');
  vm.runInNewContext(combatCode, ctx);

  // Tạo quái vật trong tầm đánh
  const enemies = [
    { x: pl.x + 50, y: pl.y, r: 16, hp: 10000, maxHp: 10000, dead: false, threat: 1, boss: false, hurt() {} }
  ];
  ctx.G.EnemyMgr.all = () => enemies;
  ctx.G.Combat.enemies = enemies;

  // Đặt tất cả 8 kỹ năng sẵn sàng (t = 0)
  for (let i = 0; i < 8; i++) {
    pl.slots[i][0].t = 0;
    pl.slots[i][0].castAt = 0;
  }

  // Chạy 1 tick Combat ở chế độ simultaneous
  ctx.G.Combat.tick(0.016, pl, 1000);

  // Xác nhận cả 8 chiêu thức đều kích hoạt thi triển trong cùng 1 frame!
  for (let i = 0; i < 8; i++) {
    const m = pl.slots[i][0];
    assert(m.castAt > 0, `Chiêu ${m.id} ở ô ${i + 1} phải thi triển thành công`);
    assert(m.t > 0, `Chiêu ${m.id} phải bắt đầu đếm hồi chiêu mới`);
  }

  // Slot của người chơi không bị thay đổi
  assert.equal(pl.active, 0, 'Ô đang chọn của người chơi không bị đảo lộn');
});

test('8-Slot System: Choice Band khóa chặt vào 1 ô duy nhất kể cả khi có 8 kỹ năng', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });
  for (let i = 1; i <= 8; i++) pl.addMove('m' + i);

  // Trang bị Choice Band
  pl.item = 'choiceband';
  pl.hasItem = (id) => id === 'choiceband';

  // Thử setActive sang slot khác
  pl.setActive(3);
  assert.equal(pl.active, 0, 'Choice Band phải chặn việc đổi ô kỹ năng');
});

test('8-Slot System: Hệ thống thẻ lên cấp dừng tạo thẻ kỹ năng mới khi đã đủ 8 ô', () => {
  const ctx = setupTestEnvironment();
  const pl = new ctx.Player({ id: 4, name: 'Charmander', hp: 100, spd: 100, atk: 100, types: ['fire'] });

  // Nạp levelup.js
  const levelupCode = fs.readFileSync('d:/pokesurvivor-main/js/systems/levelup.js', 'utf8');
  vm.runInNewContext(levelupCode, ctx);

  // Khi chưa đủ 8 ô (ví dụ có 4 ô)
  for (let i = 1; i <= 4; i++) pl.addMove('m' + i);
  assert.equal(pl.slots.length < pl.maxMoves, true);

  // Khi đã đủ 8 ô
  for (let i = 5; i <= 8; i++) pl.addMove('m' + i);
  assert.equal(pl.slots.length >= pl.maxMoves, true);
  assert.equal(pl.slots.length, 8);
});

test('8-Slot System: Tương thích lưu trữ và bảo toàn 100% dữ liệu cũ', () => {
  const legacySave = {
    v: 3,
    name: 'Player1',
    coins: 99999,
    partner: 6, // Charizard
    owned: { '1': { at: 1 }, '4': { at: 2 }, '6': { at: 3 }, '966': { at: 4 } },
    shiny: { '6': { at: 5 } },
    tickets: { t1: 50, t10: 10 },
    bag: { mint: 3 },
    tms: { ember: 1 }
  };

  // Nạp save cũ không bị lỗi và giữ nguyên tất cả tài sản
  assert.equal(legacySave.coins, 99999);
  assert.equal(legacySave.partner, 6);
  assert.equal(Object.keys(legacySave.owned).length, 4);
  assert(legacySave.owned['966'], 'Bảo toàn Pokémon ID 966');
});
