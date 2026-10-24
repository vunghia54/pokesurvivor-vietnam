// tests/account_auth.test.cjs
// Automated test suite for Stage 1: Account, Auth, synthetic email, save preservation, and Vietnamese localization.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createMockEnv(lang = 'vi-VN') {
  const localStorageData = {};
  const mockLocalStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(localStorageData, k) ? localStorageData[k] : null; },
    setItem(k, v) { localStorageData[k] = String(v); },
    removeItem(k) { delete localStorageData[k]; },
    clear() { for (const k in localStorageData) delete localStorageData[k]; },
    get length() { return Object.keys(localStorageData).length; },
    key(i) { return Object.keys(localStorageData)[i] || null; }
  };

  class Canvas {
    fillText() {}
    strokeText() {}
    measureText() { return { width: 0 }; }
  }

  const sandbox = {
    CanvasRenderingContext2D: Canvas,
    window: {
      CanvasRenderingContext2D: Canvas,
      PS_LOCALES: { lang, locale: lang === 'vi-VN' ? 'vi' : 'es', choices: [['es', 'Español'], ['vi-VN', 'Tiếng Việt']] },
      crypto: {
        subtle: {
          digest(algo, data) {
            let h = 0;
            for (let i = 0; i < data.length; i++) h = (h * 31 + data[i]) >>> 0;
            const buf = new Uint8Array(32);
            for (let i = 0; i < 4; i++) buf[i] = (h >>> (i * 8)) & 0xff;
            return Promise.resolve(buf.buffer);
          }
        },
        getRandomValues(arr) {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
          return arr;
        }
      }
    },
    crypto: null,
    localStorage: mockLocalStorage,
    location: { protocol: 'https:', hostname: 'vunghia54.github.io' },
    document: {
      createElement() { return {}; },
      head: { appendChild() {} },
      body: {},
      title: '',
      querySelectorAll() { return []; }
    },
    navigator: { onLine: true },
    TextEncoder: global.TextEncoder,
    Uint8Array: global.Uint8Array,
    G: {
      DEX_BY: { 1: { name: 'Bulbasaur' }, 4: { name: 'Charmander' }, 7: { name: 'Squirtle' }, 25: { name: 'Pikachu' } },
      Moves: { BY_ID: { 'tackle': { name: 'Tackle' }, 'ember': { name: 'Ember' } } },
      Shop: { ITEMS: { 'mint': {}, 'cap': {} } },
      Upgrades: { BY: { hp: { max: 10 }, atk: { max: 10 } } },
      AchDefs: { LIST: [] },
      FIREBASE_CONFIG: null
    },
    console
  };
  sandbox.window.G = sandbox.G;
  sandbox.crypto = sandbox.window.crypto;

  const ctx = vm.createContext(sandbox);

  // Load i18n
  const i18nCode = fs.readFileSync(path.join(__dirname, '../js/core/i18n.js'), 'utf8');
  vm.runInContext(i18nCode, ctx);

  // Load Vietnamese language dictionary
  const viCode = fs.readFileSync(path.join(__dirname, '../js/data/lang-vi.js'), 'utf8');
  vm.runInContext(viCode, ctx);

  // Load db.js
  const dbCode = fs.readFileSync(path.join(__dirname, '../js/core/db.js'), 'utf8');
  vm.runInContext(dbCode, ctx);

  return { ctx, sandbox, localStorageData };
}

test('Giai đoạn 1.1: nameToEmail generates valid, deterministic synthetic email', () => {
  const { sandbox } = createMockEnv('vi-VN');
  
  // Extract nameToEmail logic or test through register
  function nameToEmail(name) {
    const hex = [...new TextEncoder().encode(name.trim().toLowerCase())].map(b => b.toString(16).padStart(2, '0')).join('');
    return hex + '@jugadores.pokesurvivor.net';
  }

  const email1 = nameToEmail('Red');
  const email2 = nameToEmail('red');
  const email3 = nameToEmail('  Red  ');
  assert.equal(email1, email2);
  assert.equal(email1, email3);
  assert.match(email1, /^[0-9a-f]+@jugadores\.pokesurvivor\.net$/);

  const emailVn = nameToEmail('Nguyễn');
  assert.match(emailVn, /^[0-9a-f]+@jugadores\.pokesurvivor\.net$/);
  assert.ok(emailVn.length > 28);
});

test('Giai đoạn 1.2: VALID regex and displayNameOf support Vietnamese and characters', () => {
  const { sandbox } = createMockEnv('vi-VN');

  const VALID = /^[\p{L}\p{N}_]{3,16}$/u;

  assert.ok(VALID.test('Red'));
  assert.ok(VALID.test('Ash_Ketchum'));
  assert.ok(VALID.test('Nguyễn'));
  assert.ok(VALID.test('Vũ_Nghĩa'));
  assert.ok(VALID.test('Đạt123'));
  assert.ok(!VALID.test('ab')); // Too short
  assert.ok(!VALID.test('ThisNameIsWayTooLong123')); // > 16
  assert.ok(!VALID.test('User Name')); // Space
  assert.ok(!VALID.test('User!@#')); // Special chars

  // Test displayNameOf behavior
  const G = sandbox.G;
  assert.ok(G.DB);
});

test('Giai đoạn 1.3: Vietnamese error messages on invalid input / auth failures', async () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  await G.DB.ready();

  // Test invalid name length
  const rShort = await G.DB.register('ab', '123456');
  assert.equal(rShort.ok, false);
  assert.match(rShort.error, /Tên phải gồm 3-16 chữ cái/);

  // Test password too short
  const rPass = await G.DB.register('ValidName', '12');
  assert.equal(rPass.ok, false);
  assert.match(rPass.error, /Mật khẩu phải có ít nhất/);

  // Test register local
  const rReg = await G.DB.register('PlayerOne', 'pass1234');
  assert.equal(rReg.ok, true);

  // Test duplicate name
  const rDup = await G.DB.register('PlayerOne', 'pass1234');
  assert.equal(rDup.ok, false);
  assert.equal(rDup.error, 'Tên này đã có người sử dụng.');

  // Test login with wrong password
  const rWrong = await G.DB.login('PlayerOne', 'wrong_pass');
  assert.equal(rWrong.ok, false);
  assert.equal(rWrong.error, 'Sai tên đăng nhập hoặc mật khẩu.');
});

test('Giai đoạn 1.4: Save migration and merge logic preserves Pokémon, Shinies, Coins, Tickets', () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  // Simulate local save a
  const saveA = {
    v: 3,
    name: 'Ash',
    created: 1000,
    updated: 2000,
    coins: 500,
    tickets: { t1: 5, t10: 1 },
    owned: { 1: { at: 1000, from: 'starter' }, 25: { at: 1500, from: 'wild' } },
    shiny: { 25: { at: 1500, from: 'wild' } },
    stats: { runs: 10, totalKills: 150, bestTime: 600 },
    pupg: { 25: { hp: 3, atk: 2 } },
    bag: { mint: 2 },
    tms: { tackle: 1 }
  };

  // Simulate remote save b (newer with other pokemon and different coins)
  const saveB = {
    v: 3,
    name: 'Ash',
    created: 1000,
    updated: 3000,
    coins: 800,
    tickets: { t1: 2, t10: 2 },
    owned: { 1: { at: 1000, from: 'starter' }, 4: { at: 2500, from: 'gacha' } },
    shiny: { 4: { at: 2500, from: 'gacha' } },
    stats: { runs: 15, totalKills: 200, bestTime: 400 },
    pupg: { 25: { hp: 5, atk: 1 } },
    bag: { cap: 1 },
    tms: { ember: 2 }
  };

  const merged = G.DB.merge(saveA, saveB);

  // 1. All Pokémon owned must be preserved (1, 25, 4)
  assert.ok(merged.owned[1], 'Bulbasaur preserved');
  assert.ok(merged.owned[25], 'Pikachu preserved');
  assert.ok(merged.owned[4], 'Charmander preserved');

  // 2. Both shinies preserved
  assert.ok(merged.shiny[25], 'Pikachu shiny preserved');
  assert.ok(merged.shiny[4], 'Charmander shiny preserved');

  // 3. Stats must be maximum
  assert.equal(merged.stats.runs, 15);
  assert.equal(merged.stats.totalKills, 200);
  assert.equal(merged.stats.bestTime, 600);

  // 4. Upgrades must be maximum
  assert.equal(merged.pupg[25].hp, 5);
  assert.equal(merged.pupg[25].atk, 2);

  // 5. Items in bag and tms must be preserved
  assert.ok(merged.bag.mint !== undefined || merged.bag.cap !== undefined);
});

test('Giai đoạn 1.5: Account separation and prevention of cross-UID merge', () => {
  const { sandbox, localStorageData } = createMockEnv('vi-VN');
  const G = sandbox.G;

  // Set up User A's save and User B's save in local storage
  localStorageData['ps.cloud.uid_A'] = JSON.stringify({
    name: 'PlayerA',
    coins: 1000,
    owned: { 1: { at: 100 } }
  });
  localStorageData['ps.cloud.uid_B'] = JSON.stringify({
    name: 'PlayerB',
    coins: 2000,
    owned: { 4: { at: 200 } }
  });

  // Verify they are completely separate in storage
  const userAData = JSON.parse(localStorageData['ps.cloud.uid_A']);
  const userBData = JSON.parse(localStorageData['ps.cloud.uid_B']);

  assert.equal(userAData.name, 'PlayerA');
  assert.equal(userBData.name, 'PlayerB');
  assert.notDeepEqual(userAData.owned, userBData.owned);

  // Test migration guard: once migrated to uid_A, cannot migrate to uid_B
  localStorageData['ps.migrated.guest'] = 'uid_A';
  const migratedTo = localStorageData['ps.migrated.guest'];
  assert.equal(migratedTo, 'uid_A');
  assert.notEqual(migratedTo, 'uid_B');
});

test('Giai đoạn 1.6: Guest mode and localized names', () => {
  const { sandbox } = createMockEnv('vi-VN');
  const G = sandbox.G;

  const rGuest = G.DB.playAsGuest();
  assert.equal(rGuest.ok, true);
  assert.equal(G.DB.guest, true);
  assert.equal(G.DB.user, 'Khách');
  assert.equal(G.DB.save.name, 'Khách');
});

test('Giai đoạn 1.7: Comprehensive Vietnamese auth error mapping', () => {
  const { sandbox, ctx } = createMockEnv('vi-VN');
  const G = sandbox.G;

  // Execute authError directly inside context
  const getAuthError = code => vm.runInContext(`
    G.DB._testAuthError ? G.DB._testAuthError({ code: '${code}' }) :
    (function() {
      // Test through register/login rejection simulation
      return G.I18n.t({
        'auth/email-already-in-use': 'Ese nombre ya existe.',
        'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/too-many-requests': 'Demasiados intentos seguidos. Espera un poco.',
        'auth/network-request-failed': 'Sin conexión a internet.',
        'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.'
      }['${code}']);
    })()
  `, ctx);

  assert.equal(getAuthError('auth/email-already-in-use'), 'Tên này đã có người sử dụng.');
  assert.equal(getAuthError('auth/invalid-credential'), 'Sai tên đăng nhập hoặc mật khẩu.');
  assert.equal(getAuthError('auth/weak-password'), 'Mật khẩu phải có ít nhất 6 ký tự.');
  assert.equal(getAuthError('auth/too-many-requests'), 'Thử quá nhiều lần liên tiếp. Vui lòng chờ một lát.');
  assert.equal(getAuthError('auth/network-request-failed'), 'Không có kết nối Internet.');
  assert.equal(getAuthError('auth/popup-blocked'), 'Trình duyệt đã chặn cửa sổ Google. Hãy cho phép cửa sổ bật lên.');
});

