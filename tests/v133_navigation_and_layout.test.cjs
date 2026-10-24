'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const devHtml = fs.readFileSync(path.join(root, 'dev.html'), 'utf8').replace(/\r\n/g, '\n');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const styleCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8').replace(/\r\n/g, '\n');
const uiJs = fs.readFileSync(path.join(root, 'js', 'ui', 'ui.js'), 'utf8').replace(/\r\n/g, '\n');
const settingsUiJs = fs.readFileSync(path.join(root, 'js', 'ui', 'settings-ui.js'), 'utf8').replace(/\r\n/g, '\n');
const newsUiJs = fs.readFileSync(path.join(root, 'js', 'ui', 'news-ui.js'), 'utf8').replace(/\r\n/g, '\n');

test('v1.3.3 Navigation: Subscreen markup standardization in dev.html & index.html', () => {
  const screens = ['scr-upgrades', 'scr-dex', 'scr-shop', 'scr-bag', 'scr-gacha', 'scr-friends', 'scr-lobby', 'scr-rank', 'scr-goals'];
  for (const s of screens) {
    assert.ok(
      devHtml.includes(`id="${s}" class="scr dim hidden subscreen-view"`),
      `dev.html has subscreen-view class on #${s}`
    );
    assert.ok(
      indexHtml.includes(`id="${s}" class="scr dim hidden subscreen-view"`),
      `index.html has subscreen-view class on #${s}`
    );
  }
});

test('v1.3.3 Navigation: Header, back button and subscreen-body architecture', () => {
  // Upgrades
  assert.ok(devHtml.includes('class="box wide subscreen-box upgrades-box"'), 'Upgrades uses subscreen-box upgrades-box');
  assert.ok(devHtml.includes('class="subscreen-header upgrades-header"'), 'Upgrades has subscreen-header');
  assert.ok(devHtml.includes('class="btn small ghost back-btn" data-back'), 'Upgrades has dedicated back-btn with data-back');
  assert.ok(devHtml.includes('id="upg-coins"'), 'Upgrades header displays player coins');
  assert.ok(devHtml.includes('class="subscreen-body upgrades-body"'), 'Upgrades has independently scrollable body');

  // Shop
  assert.ok(devHtml.includes('id="shop-coins"'), 'Shop header displays player coins');

  // Gacha
  assert.ok(devHtml.includes('id="gacha-tickets-pill"'), 'Gacha header displays tickets pill');
  assert.ok(devHtml.includes('id="gacha-coins"'), 'Gacha header displays coins');

  // Rank
  assert.ok(devHtml.includes('id="rk-refresh"'), 'Rank header displays refresh button');
});

test('v1.3.3 Navigation: Topbar isolation in Mode B (subscreens and modals)', () => {
  assert.ok(
    styleCss.includes('body.in-subscreen #topbar') && styleCss.includes('display: none !important;'),
    'Topbar is completely hidden with display: none !important in subscreen mode'
  );
  assert.ok(
    styleCss.includes('body.in-subscreen #topbar') && styleCss.includes('pointer-events: none !important;'),
    'Topbar pointer events disabled in subscreen mode'
  );
});

test('v1.3.3 Navigation: Unified Z-index hierarchy across UI stack', () => {
  assert.ok(styleCss.includes('#game { z-index: 1 !important; }'), 'Game canvas is base layer z=1');
  assert.ok(styleCss.includes('#scr-menu { z-index: 10 !important; }'), 'Main menu is z=10');
  assert.ok(styleCss.includes('.topbar { z-index: 25 !important; }'), 'Topbar is z=25');
  assert.ok(styleCss.includes('.subscreen-view { z-index: 30 !important; }'), 'Subscreens are z=30 (above topbar)');
  assert.ok(styleCss.includes('#scr-settings, #scr-news, #scr-recover'), 'Modals are z=40 (above subscreens)');
  assert.ok(styleCss.includes('.toast { z-index: 50 !important; }'), 'Toast notifications are top layer z=50');
});

test('v1.3.3 Navigation: Touch targets and hit areas comply with mobile HIG (>= 44x44px)', () => {
  assert.ok(
    styleCss.includes('.back-btn::before {\n  content: \'\';\n  position: absolute;'),
    'Back button has ::before pseudo-element hit area extension'
  );
  assert.ok(
    styleCss.includes('min-width: 44px;') && styleCss.includes('min-height: 44px;'),
    'Back button hitbox is at least 44x44px'
  );
});

test('v1.3.3 Navigation: Upgrades layout grid is responsive and non-overlapping', () => {
  assert.ok(
    styleCss.includes('grid-template-columns: repeat(2, 1fr);'),
    'Upgrades list uses 2 columns on wide screens'
  );
  assert.ok(
    styleCss.includes('@media (max-width: 680px) {\n  .upgrades-body .upg {\n    grid-template-columns: 1fr;'),
    'Upgrades list falls back to 1 column on narrow screens'
  );
  assert.ok(
    styleCss.includes('grid-template-columns: 36px 1fr auto !important;'),
    'Upgrades item uses strict 36px 1fr auto layout to prevent price overlap'
  );
});

test('v1.3.3 Navigation: js/ui/ui.js handles show/chrome transitions cleanly', () => {
  assert.ok(
    uiJs.includes("const isMenuOnly = id === 'scr-menu' && !hasActiveSubscreen();"),
    'Identifies whether active screen is strictly main menu without active subscreens'
  );
  assert.ok(
    uiJs.includes('chrome(isMenuOnly);'),
    'Toggles chrome according to menu state'
  );
  assert.ok(
    uiJs.includes("document.body.classList.toggle('in-subscreen', !isMenuOnly);"),
    'Toggles in-subscreen body class'
  );
  assert.ok(
    uiJs.includes('function hasActiveSubscreen()'),
    'Provides hasActiveSubscreen checker for nested modals'
  );
  assert.ok(
    uiJs.includes('function refreshSubscreenResources()'),
    'Provides subscreen resource sync function'
  );
});

test('v1.3.3 Navigation: Modals (settings, news) cleanly toggle subscreen state', () => {
  assert.ok(
    settingsUiJs.includes("G.UI.chrome(false);") && settingsUiJs.includes("document.body.classList.add('in-subscreen');"),
    'SettingsUI.open hides chrome and adds in-subscreen'
  );
  assert.ok(
    newsUiJs.includes("G.UI.chrome(false);") && newsUiJs.includes("document.body.classList.add('in-subscreen');"),
    'NewsUI.open hides chrome and adds in-subscreen'
  );
});

test('v1.3.3 Navigation: Nested modals check hasActiveSubscreen before restoring topbar', () => {
  assert.ok(
    settingsUiJs.includes("!(G.UI.hasActiveSubscreen && G.UI.hasActiveSubscreen())"),
    'SettingsUI respects underlying active subscreen before showing topbar'
  );
  assert.ok(
    newsUiJs.includes("!(G.UI.hasActiveSubscreen && G.UI.hasActiveSubscreen())"),
    'NewsUI respects underlying active subscreen before showing topbar'
  );
});
