const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

global.window = {};
global.G = {};
require('../js/systems/mega.js');
const ref = require('../tools/official_mega_reference.json');

test('1. Kiểm định quy mô danh mục: Đúng 93 dạng Mega chính thức và 87 loài nền', () => {
  const forms = Object.values(G.Mega.FORMS);
  assert.equal(forms.length, 93, 'Tổng số dạng Mega trong project phải đúng bằng 93');
  assert.equal(ref.meta.primaryFormsCount, 93, 'Danh sách tham chiếu chính thức có đúng 93 dạng');

  const species = new Set(forms.map(f => f.baseDex));
  assert.equal(species.size, 87, 'Tổng số loài nền có Mega Evolution phải đúng bằng 87 theo Bulbapedia');
  assert.equal(ref.meta.officialSpeciesCount, 87, 'Danh sách tham chiếu chính thức có đúng 87 loài');
});

test('2. Không bỏ sót, không có dạng thừa và không có trùng lặp Form ID', () => {
  const refIds = ref.primaryForms.map(f => f.id);
  const projIds = Object.keys(G.Mega.FORMS);

  // Kiểm tra trùng lặp
  const uniqueProjIds = new Set(projIds);
  assert.equal(uniqueProjIds.size, projIds.length, 'Không được có Form ID trùng lặp trong G.Mega.FORMS');

  // So khớp 1:1
  const missing = refIds.filter(id => !G.Mega.FORMS[id]);
  const extra = projIds.filter(id => !refIds.includes(id));

  assert.deepEqual(missing, [], 'Không được bỏ sót bất kỳ dạng Mega chính thức nào');
  assert.deepEqual(extra, [], 'Không được có dạng thừa hoặc không chính thức trong G.Mega.FORMS');
});

test('3. Tách biệt hoàn toàn Primal Reversion (Kyogre & Groudon không nằm trong Mega)', () => {
  assert.equal(G.Mega.FORMS['primal_kyogre'], undefined, 'Primal Kyogre không được nằm trong Mega Evolution');
  assert.equal(G.Mega.FORMS['primal_groudon'], undefined, 'Primal Groudon không được nằm trong Mega Evolution');
  assert.equal(G.Mega.FORMS['mega_kyogre'], undefined, 'Không tồn tại Mega Kyogre');
  assert.equal(G.Mega.FORMS['mega_groudon'], undefined, 'Không tồn tại Mega Groudon');

  // Đảm bảo được ghi nhận riêng trong bảng Primal Reversion
  assert.equal(ref.primalReversions.length, 2, 'Có 2 dạng Primal Reversion được quản lý riêng');
});

test('4. Không có dạng không chính thức (Darkrai Z không được tồn tại như một form riêng)', () => {
  assert.equal(G.Mega.FORMS['mega_darkrai_z'], undefined, 'Không được có form mega_darkrai_z không chính thức');
  assert.ok(G.Mega.FORMS['mega_darkrai'], 'Dạng chính thức duy nhất là Mega Darkrai');
  assert.equal(G.Mega.FORMS['mega_darkrai'].baseDex, 491);
});

test('5. Kiểm tra metadata Latios (#381) và Latias (#380)', () => {
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

test('6. Đối chiếu 1:1 National Dex ID và Types của toàn bộ 93 dạng với official reference', () => {
  for (const rf of ref.primaryForms) {
    const pf = G.Mega.FORMS[rf.id];
    assert.ok(pf, `Form ${rf.id} phải có trong G.Mega.FORMS`);
    assert.equal(pf.baseDex, rf.baseDex, `Dex ID khớp cho ${rf.id}`);
    assert.deepEqual(pf.types, rf.types, `Types khớp cho ${rf.id}`);
  }
});

test('7. Phân loại tài nguyên chính xác: Đúng 36 Playable và đúng 57 Locked an toàn', () => {
  const forms = Object.values(G.Mega.FORMS);
  const playable = forms.filter(f => f.spriteAvailable);
  const locked = forms.filter(f => !f.spriteAvailable);

  assert.equal(playable.length, 36, 'Đúng 36 dạng Mega Playable có tài nguyên sprite hoàn chỉnh');
  assert.equal(locked.length, 57, 'Đúng 57 dạng Mega bị khóa an toàn do thiếu sprite');

  for (const p of playable) {
    assert.ok(p.spriteId, `Dạng playable phải có spriteId: ${p.id}`);
    assert.equal(p.spriteAvailable, true);
  }

  for (const l of locked) {
    assert.equal(l.spriteId, null, `Dạng locked phải có spriteId là null: ${l.id}`);
    assert.equal(l.spriteAvailable, false);
    assert.equal(l.missingReason, 'THIẾU SPRITE', `Lý do thiếu là THIẾU SPRITE: ${l.id}`);
  }
});
