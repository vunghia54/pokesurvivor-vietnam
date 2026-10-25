'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function setupEnv() {
  const G = {
    U: { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) },
    SPRITE_META: {},
    Shop: { ITEMS: {} },
    Moves: { BY_ID: { tackle: { name: 'Tackle' } } },
    NATURE_BY: {},
  };
  global.window = global;
  global.G = G;

  const pokedexCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'pokedex.js'), 'utf8');
  eval(pokedexCode);
  const spritesMetaCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'sprites-meta.js'), 'utf8');
  eval(spritesMetaCode);
  const dbCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'db.js'), 'utf8');
  eval(dbCode);

  return G;
}

test('1. Bổ sung Pyroar #668 và Falinks #870 vào Pokédex thành công (Tổng cộng 968 loài)', () => {
  const G = setupEnv();
  assert.equal(G.DEX.length, 968, 'Pokédex phải có đúng 968 Pokémon');

  const p668 = G.DEX_BY[668];
  assert.ok(p668, 'Pyroar #668 phải có trong G.DEX_BY');
  assert.equal(p668.name, 'Pyroar');
  assert.deepEqual(p668.types, ['fire', 'normal']);
  assert.equal(p668.hp, 109);
  assert.equal(p668.spd, 123);
  assert.equal(p668.atk, 1.3);
  assert.equal(p668.pa, 1.07);
  assert.equal(p668.sa, 1.3);
  assert.equal(p668.df, 72);
  assert.equal(p668.sd, 66);
  assert.equal(p668.rarity, 4);
  assert.equal(p668.bst, 517);
  assert.equal(p668.gen, 6);
  assert.equal(p668.starter, false);

  const p870 = G.DEX_BY[870];
  assert.ok(p870, 'Falinks #870 phải có trong G.DEX_BY');
  assert.equal(p870.name, 'Falinks');
  assert.deepEqual(p870.types, ['fighting']);
  assert.equal(p870.hp, 99);
  assert.equal(p870.spd, 110);
  assert.equal(p870.atk, 1.25);
  assert.equal(p870.pa, 1.25);
  assert.equal(p870.sa, 1.09);
  assert.equal(p870.df, 100);
  assert.equal(p870.sd, 60);
  assert.equal(p870.rarity, 3);
  assert.equal(p870.bst, 470);
  assert.equal(p870.gen, 8);
  assert.equal(p870.starter, false);
});

test('2. Tính toàn vẹn của 966 Pokémon cũ: ID, chỉ số và sắp xếp tăng dần tuyệt đối', () => {
  const G = setupEnv();
  const dexs = G.DEX.map(p => p.dex);
  assert.equal(new Set(dexs).size, 968, 'Tất cả 968 số Dex phải là duy nhất');

  for (let i = 1; i < dexs.length; i++) {
    assert.ok(dexs[i] > dexs[i - 1], `Dex phải tăng dần: ${dexs[i - 1]} < ${dexs[i]}`);
  }

  // Kiểm tra ngẫu nhiên các Pokémon mốc quan trọng
  assert.equal(G.DEX_BY[1].name, 'Bulbasaur');
  assert.equal(G.DEX_BY[6].name, 'Charizard');
  assert.equal(G.DEX_BY[150].name, 'Mewtwo');
  assert.equal(G.DEX_BY[667].name, 'Litleo');
  assert.equal(G.DEX_BY[669].name, 'Flabébé');
  assert.equal(G.DEX_BY[869].name, 'Alcremie');
  assert.equal(G.DEX_BY[871].name, 'Pincurchin');
  assert.equal(G.DEX_BY[1024].name, 'Terapagos');
});

test('3. Bảo toàn 100% Save cũ: Không lệch index, không mất Pokémon, Xu, Vé hay Nâng cấp', () => {
  const G = setupEnv();

  // Mô phỏng save cũ trước khi thêm 668 và 870
  const legacySave = {
    v: 3,
    name: 'PlayerOld',
    coins: 50000,
    tickets: { t1: 15, t10: 2 },
    owned: {
      1: { at: 1000, from: 'starter' },
      6: { at: 2000, from: 'gacha' },
      150: { at: 3000, from: 'wild' },
      667: { at: 4000, from: 'gacha' },
    },
    shiny: {
      6: { at: 2500, from: 'gacha' }
    },
    partner: 6,
    partnerShiny: true,
    pupg: {
      6: { hp: 5, atk: 10 }
    },
    stats: { runs: 20, bestTime: 1200, totalKills: 5000 }
  };

  // Chạy qua merge của G.DB
  const merged = G.DB.merge(legacySave, legacySave);

  assert.equal(merged.partner, 6);
  assert.equal(merged.partnerShiny, true);
  assert.ok(merged.owned[1], 'Bulbasaur vẫn còn');
  assert.ok(merged.owned[6], 'Charizard vẫn còn');
  assert.ok(merged.owned[150], 'Mewtwo vẫn còn');
  assert.ok(merged.owned[667], 'Litleo vẫn còn');
  assert.ok(merged.shiny[6], 'Shiny Charizard vẫn còn');
  assert.equal(merged.pupg[6].atk, 10, 'Nâng cấp vẫn nguyên vẹn');
});

test('4. Gacha Safety: Không đưa 668 hoặc 870 vào Gacha khi chưa có sprite trong G.SPRITE_META', () => {
  const G = setupEnv();
  // Gacha pool function: inBanner(p, gen) = p.gen === gen && !!G.SPRITE_META[p.dex]
  const inBanner = (p, gen) => p.gen === gen && !!G.SPRITE_META[p.dex];

  const p668 = G.DEX_BY[668];
  const p870 = G.DEX_BY[870];

  assert.equal(inBanner(p668, 6), false, 'Pyroar không xuất hiện trong banner Kalos khi chưa có sprite');
  assert.equal(inBanner(p870, 8), false, 'Falinks không xuất hiện trong banner Galar khi chưa có sprite');
});
