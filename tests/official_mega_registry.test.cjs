const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

global.window = {};
global.G = {};
require('../js/systems/mega.js');
const ref = require('../tools/official_mega_reference.json');

test('1. Quy mô danh mục & loài nền: Đúng 93 dạng Mega chính thức và 87 loài theo Bulbapedia/Serebii', () => {
  const forms = Object.values(G.Mega.FORMS);
  assert.equal(forms.length, 93, 'Tổng số dạng Mega trong G.Mega.FORMS phải đúng 93');
  assert.equal(ref.meta.primaryFormsCount, 93, 'Tham chiếu chính thức có đúng 93 dạng chính');

  const species = new Set(forms.map(f => f.baseDex));
  assert.equal(species.size, 87, 'Tổng số loài nền có Mega Evolution phải đúng bằng 87 theo Bulbapedia');
  assert.equal(ref.meta.officialSpeciesCount, 87, 'Tham chiếu chính thức có đúng 87 loài nền');
});

test('2. Quy tắc 96 hình thức: 93 dạng chính + đúng 3 biến thể hình thức chính thức', () => {
  assert.equal(ref.formVariations.length, 3, 'Chính xác 3 biến thể hình thức bổ sung');
  const total = ref.meta.primaryFormsCount + ref.formVariations.length;
  assert.equal(total, 96, 'Tổng cộng đúng 96 hình thức khi tính biến thể hình thức chính thức');

  const variationIds = ref.formVariations.map(v => v.id);
  assert.ok(variationIds.includes('mega_magearna_original'), 'Biến thể Mega Magearna Original Color phải có mặt');
  assert.ok(variationIds.includes('mega_tatsugiri_droopy'), 'Biến thể Mega Tatsugiri Droopy Form phải có mặt');
  assert.ok(variationIds.includes('mega_tatsugiri_stretchy'), 'Biến thể Mega Tatsugiri Stretchy Form phải có mặt');

  // Tatsugiri Curly Form nằm trong 93 dạng cơ bản
  assert.ok(G.Mega.FORMS['mega_tatsugiri'], 'Mega Tatsugiri cơ bản (Curly Form) nằm trong 93 dạng');
  assert.equal(G.Mega.FORMS['mega_tatsugiri'].baseDex, 978);

  // Không tạo dạng Mega riêng theo giới tính cho Pyroar (#668) và Meowstic (#678)
  assert.equal(G.Mega.FORMS['mega_pyroar_female'], undefined, 'Không được tạo mega_pyroar_female riêng trong G.Mega.FORMS');
  assert.equal(G.Mega.FORMS['mega_meowstic_female'], undefined, 'Không được tạo mega_meowstic_female riêng trong G.Mega.FORMS');
  assert.ok(G.Mega.FORMS['mega_pyroar'], 'Dạng chính thức duy nhất là Mega Pyroar');
  assert.ok(G.Mega.FORMS['mega_meowstic'], 'Dạng chính thức duy nhất là Mega Meowstic');
});

test('3. Thống kê theo thế hệ tính toán động từ National Pokédex ID', () => {
  const GEN_SPECS = [
    { gen: 1, min: 1, max: 151, expSpecies: 18, expForms: 21 },
    { gen: 2, min: 152, max: 251, expSpecies: 9, expForms: 9 },
    { gen: 3, min: 252, max: 386, expSpecies: 21, expForms: 22 },
    { gen: 4, min: 387, max: 493, expSpecies: 9, expForms: 11 },
    { gen: 5, min: 494, max: 649, expSpecies: 8, expForms: 8 },
    { gen: 6, min: 650, max: 721, expSpecies: 12, expForms: 12 },
    { gen: 7, min: 722, max: 809, expSpecies: 5, expForms: 5 },
    { gen: 8, min: 810, max: 905, expSpecies: 1, expForms: 1 },
    { gen: 9, min: 906, max: 1025, expSpecies: 4, expForms: 4 },
  ];

  const forms = Object.values(G.Mega.FORMS);
  let totalCalculatedSpecies = 0;
  let totalCalculatedForms = 0;

  for (const s of GEN_SPECS) {
    const genForms = forms.filter(f => f.baseDex >= s.min && f.baseDex <= s.max);
    const genSpecies = new Set(genForms.map(f => f.baseDex));

    assert.equal(genSpecies.size, s.expSpecies, `Gen ${s.gen} (${s.min}-${s.max}) phải có đúng ${s.expSpecies} loài`);
    assert.equal(genForms.length, s.expForms, `Gen ${s.gen} (${s.min}-${s.max}) phải có đúng ${s.expForms} dạng`);

    // So khớp với breakdown trong reference metadata
    const refGen = ref.meta.generationBreakdown['gen' + s.gen];
    assert.ok(refGen, `Metadata phải có breakdown cho Gen ${s.gen}`);
    assert.equal(refGen.speciesCount, s.expSpecies);
    assert.equal(refGen.formsCount, s.expForms);

    totalCalculatedSpecies += genSpecies.size;
    totalCalculatedForms += genForms.length;
  }

  assert.equal(totalCalculatedSpecies, 87, 'Tổng số loài tính qua các thế hệ phải đúng 87');
  assert.equal(totalCalculatedForms, 93, 'Tổng số dạng tính qua các thế hệ phải đúng 93');
});

test('4. Kiểm toán hệ chính xác của 93 dạng Mega (Đặc biệt 8 dạng được chỉ định)', () => {
  // 8 dạng đặc biệt được chỉ định trong yêu cầu
  const audited8 = {
    mega_raichu_x: ['electric'],
    mega_raichu_y: ['electric'],
    mega_clefable: ['fairy', 'flying'],
    mega_feraligatr: ['water', 'dragon'],
    mega_chimecho: ['psychic', 'steel'],
    mega_staraptor: ['fighting', 'flying'],
    mega_garchomp_z: ['dragon'],
    mega_golisopod: ['bug', 'steel']
  };

  for (const [id, expectedTypes] of Object.entries(audited8)) {
    const f = G.Mega.FORMS[id];
    assert.ok(f, `Dạng ${id} phải tồn tại`);
    assert.deepEqual(f.types, expectedTypes, `Hệ của ${id} phải là ${expectedTypes.join('/')}`);
  }

  // Đối chiếu toàn bộ 93 dạng với official reference
  for (const rf of ref.primaryForms) {
    const pf = G.Mega.FORMS[rf.id];
    assert.ok(pf, `Dạng ${rf.id} phải có trong G.Mega.FORMS`);
    assert.equal(pf.baseDex, rf.baseDex, `Dex ID phải khớp cho ${rf.id}`);
    assert.deepEqual(pf.types, rf.types, `Hệ phải khớp chính thức cho ${rf.id}`);
  }
});

test('5. Mega Stones và điều kiện kích hoạt đặc biệt (Rayquaza, Floette, Zygarde, Branching)', () => {
  // Mega Rayquaza: Yêu cầu chiêu thức Dragon Ascent
  const rayquaza = G.Mega.FORMS['mega_rayquaza'];
  assert.ok(rayquaza, 'Mega Rayquaza tồn tại');
  assert.equal(rayquaza.stone, 'Dragon Ascent');
  assert.equal(rayquaza.requiresMove, 'Dragon Ascent', 'Phải ghi nhận yêu cầu chiêu thức Dragon Ascent');

  // Mega Floette: Yêu cầu dạng Eternal Flower Floette (#670)
  const floette = G.Mega.FORMS['mega_floette'];
  assert.ok(floette, 'Mega Floette tồn tại');
  assert.equal(floette.baseDex, 670);
  assert.equal(floette.baseForm, 'floette_eternal', 'Phải ghi nhận yêu cầu Eternal Flower form');

  // Mega Zygarde: Gắn với Complete Form / Core
  const zygarde = G.Mega.FORMS['mega_zygarde'];
  assert.ok(zygarde, 'Mega Zygarde tồn tại');
  assert.equal(zygarde.baseDex, 718);
  assert.equal(zygarde.baseForm, 'zygarde_complete', 'Phải ghi nhận yêu cầu Complete Form');

  // Branching X/Y/Z sử dụng đúng dạng
  const charX = G.Mega.FORMS['mega_charizard_x'];
  const charY = G.Mega.FORMS['mega_charizard_y'];
  assert.equal(charX.stone, 'Charizardite X');
  assert.equal(charY.stone, 'Charizardite Y');
  assert.deepEqual(charX.types, ['fire', 'dragon']);
  assert.deepEqual(charY.types, ['fire', 'flying']);

  const mewX = G.Mega.FORMS['mega_mewtwo_x'];
  const mewY = G.Mega.FORMS['mega_mewtwo_y'];
  assert.equal(mewX.stone, 'Mewtwonite X');
  assert.equal(mewY.stone, 'Mewtwonite Y');
  assert.deepEqual(mewX.types, ['psychic', 'fighting']);
  assert.deepEqual(mewY.types, ['psychic']);

  const luc = G.Mega.FORMS['mega_lucario'];
  const lucZ = G.Mega.FORMS['mega_lucario_z'];
  assert.equal(luc.stone, 'Lucarionite');
  assert.equal(lucZ.stone, 'Lucarionite Z');

  const garch = G.Mega.FORMS['mega_garchomp'];
  const garchZ = G.Mega.FORMS['mega_garchomp_z'];
  assert.equal(garch.stone, 'Garchompite');
  assert.equal(garchZ.stone, 'Garchompite Z');
  assert.deepEqual(garch.types, ['dragon', 'ground']);
  assert.deepEqual(garchZ.types, ['dragon']);

  const abBase = G.Mega.FORMS['mega_absol'];
  const abZ = G.Mega.FORMS['mega_absol_z'];
  assert.equal(abBase.stone, 'Absolite');
  assert.equal(abZ.stone, 'Absolite Z');
  assert.deepEqual(abBase.types, ['dark']);
  assert.deepEqual(abZ.types, ['dark', 'ghost'], 'Mega Absol Z phải có hệ Dark/Ghost theo chuẩn DLC Mega Dimension');
  assert.equal(abZ.spriteAvailable, false, 'Mega Absol Z vẫn thiếu sprite nên phải khóa an toàn');

  const raiX = G.Mega.FORMS['mega_raichu_x'];
  const raiY = G.Mega.FORMS['mega_raichu_y'];
  assert.equal(raiX.stone, 'Raichunite X');
  assert.equal(raiY.stone, 'Raichunite Y');
  assert.deepEqual(raiX.types, ['electric']);
  assert.deepEqual(raiY.types, ['electric']);
});

test('6. Tách biệt hoàn toàn Primal Reversion (Kyogre & Groudon không nằm trong Mega Evolution)', () => {
  assert.equal(G.Mega.FORMS['primal_kyogre'], undefined, 'Primal Kyogre không được nằm trong Mega Evolution');
  assert.equal(G.Mega.FORMS['primal_groudon'], undefined, 'Primal Groudon không được nằm trong Mega Evolution');
  assert.equal(G.Mega.FORMS['mega_kyogre'], undefined, 'Không tồn tại Mega Kyogre');
  assert.equal(G.Mega.FORMS['mega_groudon'], undefined, 'Không tồn tại Mega Groudon');

  assert.equal(ref.primalReversions.length, 2, 'Có 2 dạng Primal Reversion quản lý riêng biệt');
  assert.equal(ref.primalReversions[0].id, 'primal_kyogre');
  assert.equal(ref.primalReversions[1].id, 'primal_groudon');
});

test('7. 0 dạng không chính thức (Darkrai Z, fan-made forms bị loại trừ)', () => {
  assert.equal(G.Mega.FORMS['mega_darkrai_z'], undefined, 'Không được có form mega_darkrai_z không chính thức');
  assert.ok(G.Mega.FORMS['mega_darkrai'], 'Dạng chính thức duy nhất là Mega Darkrai');
  assert.equal(G.Mega.FORMS['mega_darkrai'].baseDex, 491);

  // Không có Form ID nào nằm ngoài 93 dạng tham chiếu chính thức
  const refIdSet = new Set(ref.primaryForms.map(f => f.id));
  for (const id of Object.keys(G.Mega.FORMS)) {
    assert.ok(refIdSet.has(id), `Form ID ${id} phải nằm trong danh mục chính thức`);
  }
});

test('8. Phân loại tài nguyên an toàn: Đúng 36 Playable và 57 Locked an toàn', () => {
  const forms = Object.values(G.Mega.FORMS);
  const playable = forms.filter(f => f.spriteAvailable);
  const locked = forms.filter(f => !f.spriteAvailable);

  assert.equal(playable.length, 36, 'Đúng 36 dạng Mega Playable có tài nguyên sprite hoàn chỉnh');
  assert.equal(locked.length, 57, 'Đúng 57 dạng Mega bị khóa an toàn do thiếu sprite');

  for (const p of playable) {
    assert.ok(p.spriteId, `Dạng playable phải có spriteId hợp lệ: ${p.id}`);
    assert.equal(p.spriteAvailable, true);
  }

  for (const l of locked) {
    assert.equal(l.spriteId, null, `Dạng locked phải có spriteId là null: ${l.id}`);
    assert.equal(l.spriteAvailable, false);
    assert.equal(l.missingReason, 'THIẾU SPRITE', `Lý do thiếu là THIẾU SPRITE: ${l.id}`);
  }
});

test('9. Đảm bảo tính toàn vẹn của Latios (#381) và Latias (#380)', () => {
  const latias = G.Mega.FORMS['mega_latias'];
  const latios = G.Mega.FORMS['mega_latios'];

  assert.ok(latias, 'Mega Latias tồn tại');
  assert.equal(latias.baseDex, 380, 'Mega Latias phải có baseDex 380');
  assert.equal(latias.name, 'Mega Latias');
  assert.equal(latias.stone, 'Latiasite');

  assert.ok(latios, 'Mega Latios tồn tại');
  assert.equal(latios.baseDex, 381, 'Mega Latios phải có baseDex 381 (Latios, không phải Latias)');
  assert.equal(latios.name, 'Mega Latios');
  assert.equal(latios.stone, 'Latiosite');
});

test('10. Kiểm tra tính toàn vẹn hệ của Barbaracle (#689): Base là Rock/Water trong Pokédex, Mega là Rock/Fighting trong G.Mega', () => {
  require('../js/data/pokedex.js');
  const base = G.DEX.find(p => p.dex === 689);
  assert.ok(base, 'Barbaracle phải tồn tại trong Pokédex');
  assert.deepEqual(base.types, ['rock', 'water'], 'Barbaracle dạng thường trong Pokédex phải có hệ Rock/Water');

  const mega = G.Mega.FORMS['mega_barbaracle'];
  assert.ok(mega, 'Mega Barbaracle phải tồn tại trong G.Mega.FORMS');
  assert.deepEqual(mega.types, ['rock', 'fighting'], 'Mega Barbaracle phải có hệ Rock/Fighting theo canon');
});

