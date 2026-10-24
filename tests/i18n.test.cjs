const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
const dictionaries = [...source('dev.html').matchAll(/src="(js\/data\/lang-[^"]+\.js)"/g)].map(m => m[1]);
// Francés, italiano...: sus diccionarios van aparte (js/lang/, los genera tools/build_langs.js).
const langs1 = require('../tools/build_langs.js');
langs1.build();
function boot(saved = null, nav = 'en-US', pathname = '/', blocked = false) {
  const storage = { 'ps.lang': saved }, calls = [], dicts = {}, written = [];
  class Canvas {
    constructor() { this.font = '16px Pixelify,sans-serif'; }
    get font() { return this._font; }
    set font(v) { this._font = v; }
    fillText(s) { calls.push([s, this.font]); }
    strokeText(s) { calls.push([s, this.font]); }
    measureText(s) { calls.push([s, this.font]); return { width: s.length }; }
  }
  const ctx = { G: {}, navigator: { language: nav, languages: [nav] },
    location: { pathname, reload: () => calls.push('reload') },
    localStorage: { getItem: k => { if (blocked) throw Error('blocked'); return storage[k]; }, setItem: (k, v) => { storage[k] = v; } },
    document: { documentElement: {}, write: html => written.push(html) }, CanvasRenderingContext2D: Canvas,
    confirm: s => { calls.push(s); return true; }, alert: s => calls.push(s), console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = f => vm.runInContext(source(f), ctx, { filename: f });
  load('js/core/locales.js');
  // Lo que pide locales.js con document.write (sólo francés, italiano...): se ejecuta antes que el juego.
  for (const html of written) load(/src="(js\/lang\/[^"?]+)/.exec(html)[1]);
  load('js/core/i18n.js');
  const add = ctx.G.I18n.add;
  ctx.G.I18n.add = (d, l = 'en', c = '') => {
    if (!c) dicts[l] = { ...dicts[l], ...d };
    add(d, l, c);
  };
  dictionaries.forEach(load);
  return { ctx, G: ctx.G, storage, calls, dicts, Canvas, load, written };
}
const langs = ['vi-VN', 'es', 'en', 'fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'];
const save = ['Lưu', 'Guardar', 'Save', 'Enregistrer', 'Salva', 'Salvar', '保存', '儲存'];
for (const [i, lang] of langs.entries()) {
  test(`${lang}: isolated dictionary, templates, loading locale, canvas, new save notice`, () => {
    const b = boot(lang), I = b.G.I18n;
    assert.equal(I.lang, lang); assert.equal(b.ctx.document.documentElement.lang, lang);
    assert.equal(b.G.T('Guardar'), save[i]);
    assert.equal(I.f('Se guarda en la nube en {x} s.', 17).includes('17'), true);
    assert.equal(b.written.length, lang === 'es' || lang === 'en' ? 0 : 1);
    const c = new b.Canvas(); c.fillText('Guardar');
    assert.equal(b.calls.at(-1)[0], save[i]);
    // Chino: las letras del sistema detrás de Pixelify, puestas una vez al poner la fuente.
    if (lang.startsWith('zh-')) assert.ok(c.font.includes('PingFang') && c.font.startsWith('16px Pixelify,'));
    else assert.equal(c.font, lang === 'vi-VN' ? '16px Arial,sans-serif' : '16px Pixelify,sans-serif');
    c.font = c.font; assert.equal(c.font.split('PingFang').length, lang.startsWith('zh-') ? 2 : 1);
    I.rawCanvas(c, 'fillText', 'Pikachu'); assert.equal(b.calls.at(-1)[0], 'Pikachu');
    assert.ok(b.G.T('Solicitud enviada a Pikachu').includes('Pikachu'));
    assert.ok(I.f('Esperando a {x}…', 'Pikachu').includes('Pikachu'));
    const nodes = {};
    const node = id => nodes[id] ||= { children: [], classList: { add() {}, remove() {} }, attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; }, replaceChildren() { this.children = []; }, appendChild(n) { this.children.push(n); } };
    b.G.UI = { $: node }; b.G.DB = { mode: 'cloud', guest: false, save: { stats: {} } };
    b.ctx.document.createElement = () => ({});
    b.load('js/ui/login.js');
    assert.equal(b.G.LoginUI.updateNotices(), true);
    // El aviso del dueño, entero y con sus negritas: "cada 10 minutos" en todos los idiomas.
    const body = node('savenote-body');
    assert.ok(body.innerHTML.includes('10') && !body.innerHTML.includes('30'));
    assert.equal((body.innerHTML.match(/<b[ >]/g) || []).length, 3);
    if (lang !== 'es') assert.ok(!body.innerHTML.includes('Debido a problemas'));
    if (lang !== 'es' && lang !== 'en') assert.ok(!body.innerHTML.includes('Because of problems') && body.attrs.translate === 'no');
    if (lang === 'es' || lang === 'en') assert.equal(node('savenote-title').textContent, lang === 'es' ? 'Importante: guarda tu partida' : 'Important: save your game');
    else assert.equal(node('savenote-title').textContent, 'Importante: guarda tu partida');
    assert.equal(b.G.LoginUI.updateNotices(), false);
    b.G.DB.save.stats.runs = 1;
    assert.equal(b.G.LoginUI.updateNotices(), true);
    assert.ok(/rankings|leaderboards/.test(b.G.T(node('savenote-title').textContent)) || lang.startsWith('zh') || lang === 'fr' || lang === 'it' || lang === 'vi-VN');
    assert.equal((node('savenote-body').innerHTML.match(/<p>/g) || []).length, 2);
    assert.equal(b.G.LoginUI.updateNotices(), false);
  });
  if (lang === 'es') continue;
  test(`${lang}: current English-key coverage and placeholder contracts`, () => {
    const { G, load } = boot(lang);
    if (lang !== 'en') {
      // Todo lo que tiene inglés (lang-en.js y los datos del juego) tiene también este idioma.
      assert.deepEqual(langs1.missing().res[lang], []);
      for (const [d, l] of langs1.capture(langs1.SOURCES, '?')) if (l === lang) for (const [k, v] of Object.entries(d)) {
        assert.equal((k.match(/\{(?:x|name)\}/g) || []).length,
          (v.match(/\{(?:x|name)\}/g) || []).length, k);
      }
    }
    load('js/data/changelog.js');
    if (lang !== 'en') for (const entry of G.CHANGELOG.filter(e => e.d >= '2026-10-18')) {
      for (const pair of [entry.title, ...(entry.new || []), ...(entry.chg || []), ...(entry.fix || [])]) {
        assert.ok(G.I18n.has(pair[0]), pair[0]);
      }
    }
  });
}
test('locale precedence, aliases and blocked storage', () => {
  for (const [input, expected] of [['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-Hant-HK', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans'], ['zh', 'zh-Hans'], ['zh-Hans-TW', 'zh-Hans'],
    ['pt', 'pt-BR'], ['pt-PT', 'pt-BR'], ['fr-CA', 'fr'], ['it-IT', 'it'], ['vi', 'vi-VN'], ['vi_VN', 'vi-VN'], ['vi-VN', 'vi-VN'], ['ja-JP', null]]) {
    assert.equal(boot().ctx.PS_LOCALES.normalize(input), expected, input);
    assert.equal(boot(null, input).G.I18n.lang, 'vi-VN', input);
  }
  assert.equal(boot('it', 'fr-FR', '/en/').G.I18n.lang, 'it');
  assert.equal(boot('unknown', 'fr-FR', '/en/').G.I18n.lang, 'en');
  assert.equal(boot(null, 'fr-FR', '/', true).G.I18n.lang, 'vi-VN');
  assert.equal(boot(null, 'es-MX').G.I18n.lang, 'vi-VN');
});
test('switching language writes only the preference and validates input', () => {
  const b = boot('es'); b.storage['ps.cloud.fake'] = '{"coins":42}';
  b.G.I18n.set('invalid'); assert.equal(b.storage['ps.lang'], 'es');
  b.G.I18n.set('zh-Hant'); assert.equal(b.storage['ps.lang'], 'zh-Hant');
  assert.equal(b.storage['ps.cloud.fake'], '{"coins":42}'); assert.deepEqual(b.calls, ['reload']);
});
test('specific templates and later overrides beat generic patterns', () => {
  const { G } = boot('fr');
  G.I18n.add({ 'Bonjour {x}': 'Ancien {x}', '{x}).': '{x}）。' }, 'fr');
  G.I18n.add({ 'Bonjour {x}': 'Nouveau {x}', 'Le résultat ({x}).': 'Résultat : {x}' }, 'fr');
  assert.equal(G.T('Bonjour 5'), 'Nouveau 5');
  assert.equal(G.T('Le résultat (42).'), 'Résultat : 42');
});
test('Chinese move context is distinct from type; all species have names', () => {
  for (const lang of ['zh-Hans', 'zh-Hant']) {
    const b = boot(lang); b.load('js/data/pokedex.js');
    assert.notEqual(b.G.T('Psíquico'), b.G.T('Psíquico', 'move'));
    for (const p of b.G.DEX) assert.ok(b.G.I18n.has(p.name), p.name);
  }
});


test('external boot follows the shared locale without inline executable scripts', () => {
  const html = source('dev.html');
  assert.ok(html.indexOf('src="js/core/locales.js"') < html.indexOf('src="js/boot.js"'));
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert.ok(/src=/.test(match[1]) || /application\/ld\+json/.test(match[1]), 'Executable inline script');
  }
  assert.ok(html.includes("script-src 'self'"));
  for (const lang of langs) {
    const b = boot(lang), paragraphs = [{}, {}];
    b.ctx.document.querySelector = () => ({});
    b.ctx.document.querySelectorAll = () => paragraphs;
    b.load('js/boot.js');
    assert.equal(b.ctx.PS_PAGES, true);
    assert.equal(b.ctx.document.documentElement.lang, lang);
    assert.ok(paragraphs.every(p => typeof p.textContent === 'string' && p.textContent.length));
    if (lang !== 'es') assert.notEqual(paragraphs[1].textContent, 'Cargando…');
  }
});

test('Vietnamese: species names and dex IDs are preserved, including the existing Type: Null display alias', () => {
  const b = boot('vi-VN'); b.load('js/data/pokedex.js');
  assert.ok(b.G.DEX.length >= 966);
  for (const p of b.G.DEX) {
    assert.equal(b.G.T(p.name), p.name === 'Código Cero' ? 'Type: Null' : p.name, p.name);
    assert.equal(typeof p.dex, 'number');
  }
});

test('Vietnamese: all ability/nature names use a display-only context', () => {
  const b = boot('vi-VN');
  for (const f of ['js/data/natures.js', 'js/data/abilities.js', 'js/systems/mons.js']) b.load(f);
  const before = JSON.stringify([b.G.NATURES, b.G.ABIL, b.G.DEX_ABIL]);
  for (const n of [...b.G.NATURES.map(n => n.n), ...Object.values(b.G.ABIL)]) {
    const label = b.G.Mons.name(n);
    assert.notEqual(label, n[1], n[1]);
    assert.ok(typeof label === 'string' && label.length > 0, n[1]);
  }
  assert.equal(b.G.Mons.name(b.G.ABIL['huge-power']), 'Sức mạnh khổng lồ');
  assert.equal(b.G.Mons.name(b.G.NATURE_BY.quirky.n), 'Kỳ lạ');
  assert.equal(JSON.stringify([b.G.NATURES, b.G.ABIL, b.G.DEX_ABIL]), before);
  assert.equal(b.G.T('Psíquico'), 'Siêu linh');
  assert.equal(b.G.T('Psíquico', 'move'), 'Sức mạnh tâm linh');
  assert.equal(b.G.T('Psíquico +', 'move'), 'Sức mạnh tâm linh +');
});

test('Vietnamese: all release notes, quiz questions and personality labels translate', () => {
  const b = boot('vi-VN'); b.load('js/data/changelog.js'); b.load('js/data/starters.js');
  for (const entry of b.G.CHANGELOG) for (const pair of [entry.title, ...(entry.new || []), ...(entry.chg || []), ...(entry.fix || [])]) {
    assert.ok(b.G.I18n.has(pair[0]), pair[0]);
    assert.notEqual(b.G.T(pair[0]), pair[0]);
  }
  for (const q of b.G.PERSONALITY_TEST) for (const text of [q.q, ...q.a.map(a => a.t)]) assert.ok(b.G.I18n.has(text), text);
  for (const [trait, text] of Object.entries(b.G.TRAIT_TEXT)) {
    assert.notEqual(b.G.T(trait), trait);
    assert.ok(b.G.I18n.has(text), text);
  }
});

test('Vietnamese: nicknames survive templates, confirmations and canvas; saves survive switching', () => {
  const b = boot('vi-VN');
  // These happen to be Spanish dictionary keys, but remain literal player names.
  assert.equal(b.G.T('Solicitud enviada a Fuego'), 'Đã gửi lời mời đến Fuego');
  assert.equal(b.G.T('¿Quitar a Agua de tus amigos?'), 'Xóa Agua khỏi danh sách bạn bè?');
  assert.equal(b.G.T('Pausa: Fuego está eligiendo…'), 'Tạm dừng: Fuego đang chọn…');
  b.ctx.confirm('¿Quitar a Agua de tus amigos?');
  assert.equal(b.calls.at(-1), 'Xóa Agua khỏi danh sách bạn bè?');
  const c = new b.Canvas(); b.G.I18n.rawCanvas(c, 'fillText', 'Fuego');
  assert.equal(b.calls.at(-1)[0], 'Fuego');
  const fixture = JSON.stringify({ coins: 1234, tickets: 56, collection: [1, 25, 150], shiny: [25], pnat: {25:['jolly',1]} });
  b.storage['ps.cloud.test'] = fixture; b.storage['ps.local.test'] = fixture;
  for (const lang of langs) b.G.I18n.set(lang);
  assert.equal(b.storage['ps.cloud.test'], fixture); assert.equal(b.storage['ps.local.test'], fixture);
});

test('Vietnamese: DOM text, attributes and protected player names', () => {
  const b = boot('vi-VN');
  const parent = protectedName => ({ closest: () => protectedName ? {} : null });
  const n = { nodeType: 3, nodeValue: '  Guardar  ', parentElement: parent(false) };
  b.G.I18n.walk(n); assert.equal(n.nodeValue, '  Lưu  ');
  b.G.I18n.walk(n); assert.equal(n.nodeValue, '  Lưu  ');
  n.nodeValue = 'Cargando…'; b.G.I18n.walk(n); assert.equal(n.nodeValue, 'Đang tải…');
  const player = {nodeType:3, nodeValue:'Fuego',parentElement:parent(true)};
  b.G.I18n.walk(player); assert.equal(player.nodeValue, 'Fuego');
  b.ctx.NodeFilter = { SHOW_TEXT:4, SHOW_ELEMENT:1 };
  b.ctx.document.createTreeWalker = () => ({nextNode: () => null});
  const attrs = {placeholder:'Buscar por nombre o número', 'aria-label':'Guardar', title:'Ajustes', alt:'Mochila'};
  const el = {nodeType:1, closest:()=>null,getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v};
  b.G.I18n.walk(el);
  assert.deepEqual(attrs, {placeholder:'Tìm theo tên hoặc số','aria-label':'Lưu',title:'Cài đặt',alt:'Túi đồ'});
});
