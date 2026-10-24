'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const devHtml = fs.readFileSync(path.join(root, 'dev.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const settingsUiJs = fs.readFileSync(path.join(root, 'js', 'ui', 'settings-ui.js'), 'utf8');
const uiJs = fs.readFileSync(path.join(root, 'js', 'ui', 'ui.js'), 'utf8');

test('Mobile UI: Topbar markup contains responsive rows and all elements', () => {
  // Check topbar structure in dev.html and index.html
  assert.ok(devHtml.includes('class="topbar-row topbar-info"'), 'dev.html contains topbar-info row');
  assert.ok(devHtml.includes('class="topbar-row topbar-actions"'), 'dev.html contains topbar-actions row');
  assert.ok(indexHtml.includes('topbar-info'), 'index.html contains topbar-info row');
  assert.ok(indexHtml.includes('topbar-actions'), 'index.html contains topbar-actions row');

  // Verify all essential IDs exist
  const ids = ['online-pill', 'coins-pill', 'tickets-pill', 'user-pill', 'btn-save', 'btn-news', 'btn-yt', 'btn-sound', 'btn-full', 'btn-settings', 'btn-logout'];
  for (const id of ids) {
    assert.ok(devHtml.includes(`id="${id}"`), `dev.html contains #${id}`);
    assert.ok(indexHtml.includes(`id="${id}"`), `index.html contains #${id}`);
  }
});

test('Mobile UI: Anti-character-splitting rules prevent vertical word break', () => {
  // Style rules must ensure buttons do NOT wrap anywhere per-character
  assert.ok(!styleCss.includes('html:lang(vi) .btn, html:lang(vi) .chip, html:lang(vi) .tab { white-space: normal; overflow-wrap: anywhere;'), 'Removed anywhere word-break');
  assert.ok(styleCss.includes('overflow-wrap: break-word'), 'Uses break-word');
  assert.ok(styleCss.includes('html:lang(vi) .save-btn, html:lang(vi) .yt-btn, html:lang(vi) #btn-logout { white-space: nowrap !important; }'), 'Explicit nowrap group for action buttons');
  assert.ok(styleCss.includes('white-space: nowrap !important;'), 'Enforces nowrap on action buttons');
});

test('Mobile UI: Main menu uses 2-column grid and retains all 9 features', () => {
  assert.ok(styleCss.includes('grid-template-columns: repeat(2, 1fr) !important;'), 'Mobile menu uses 2-column grid');
  assert.ok(styleCss.includes('.menu-item.play'), 'Play button defined');
  assert.ok(styleCss.includes('grid-column: span 2 !important;'), 'Play button spans 2 columns');

  // Ensure all 9 menu items + play are preserved in dev.html
  const menuGoActions = ['play', 'dex', 'upgrades', 'shop', 'bag', 'gacha', 'goals', 'friends', 'rank', 'settings'];
  for (const go of menuGoActions) {
    assert.ok(devHtml.includes(`data-go="${go}"`), `Menu contains data-go="${go}"`);
    assert.ok(indexHtml.includes(`data-go="${go}"`), `Generated index.html contains data-go="${go}"`);
  }
});

test('Mobile UI: User pill wired to Account Settings with Logout modal', () => {
  // Check ui.js wiring
  assert.ok(uiJs.includes("open('acc')"), 'user-pill opens account settings tab');
  // Check settings-ui.js has account renderer and Vietnamese localization
  assert.ok(settingsUiJs.includes('renderAccount'), 'settings-ui has renderAccount');
  assert.ok(settingsUiJs.includes('set-logout'), 'Account settings has set-logout button');
  assert.ok(settingsUiJs.includes('set-delete'), 'Account settings has set-delete button');
  assert.ok(settingsUiJs.includes('Đăng xuất'), 'Account settings has Vietnamese logout label');
});

test('Mobile UI: Toast and popup safe area constraints', () => {
  assert.ok(styleCss.includes('max-width: min(92vw, 420px);'), 'Toast has mobile max-width constraint');
  assert.ok(styleCss.includes('overflow-wrap: break-word;'), 'Toast has word wrap constraint');
  assert.ok(styleCss.includes('.invite-pop'), 'Invite pop is styled');
  assert.ok(styleCss.includes('calc(100vw - 28px)'), 'Invite pop respects mobile viewport bounds');
});
