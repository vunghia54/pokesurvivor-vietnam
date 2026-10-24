'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const styleCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const settingsUiJs = fs.readFileSync(path.join(root, 'js', 'ui', 'settings-ui.js'), 'utf8');
const devHtml = fs.readFileSync(path.join(root, 'dev.html'), 'utf8');

test('Landscape & Modal: CSS includes multi-factor landscape & coarse-pointer breakpoints', () => {
  assert.ok(
    styleCss.includes('(orientation: landscape) and (max-height: 540px)'),
    'Matches mobile landscape by orientation and height'
  );
  assert.ok(
    styleCss.includes('(hover: none) and (pointer: coarse) and (max-height: 600px)'),
    'Matches touch devices via coarse pointer detection'
  );
  assert.ok(
    styleCss.includes('(max-height: 520px) and (max-width: 1024px)'),
    'Safety fallback for small landscape devices'
  );
});

test('Landscape & Modal: Topbar hides standalone logout and anchors cleanly to safe-area', () => {
  assert.ok(
    styleCss.includes('.topbar-actions #btn-logout {\n    display: none !important;'),
    'Hides logout button from topbar in mobile & landscape'
  );
  assert.ok(
    styleCss.includes('left: max(8px, env(safe-area-inset-left, 8px));'),
    'Anchors topbar to left safe area to prevent left info from being pushed offscreen'
  );
  assert.ok(
    styleCss.includes('right: max(8px, env(safe-area-inset-right, 8px));'),
    'Anchors topbar to right safe area'
  );
  assert.ok(
    styleCss.includes('.topbar-info {\n    order: 1;\n    justify-content: flex-start;'),
    'Aligns player info row to the left safe-area so online, coins, tickets are never clipped'
  );
  assert.ok(
    styleCss.includes('.topbar-actions {\n    order: 2;\n    justify-content: flex-end;'),
    'Aligns action buttons row to the right safe-area'
  );
});

test('Landscape & Modal: Responsive modal system uses dynamic viewport units (dvh/vh) and safe-area', () => {
  assert.ok(
    styleCss.includes('max-height: calc(100vh - 24px)'),
    'Base modal box has vh fallback'
  );
  assert.ok(
    styleCss.includes('max-height: calc(100dvh - 24px)'),
    'Base modal box has dvh dynamic viewport unit'
  );
  assert.ok(
    styleCss.includes('overscroll-behavior: contain'),
    'Modal box contains touch scroll to prevent background scrolling'
  );
  assert.ok(
    styleCss.includes('-webkit-overflow-scrolling: touch'),
    'Smooth momentum scrolling on iOS and Android touch screens'
  );
});

test('Landscape & Modal: Landscape modals fit within short screen height without bottom clipping', () => {
  assert.ok(
    styleCss.includes('max-height: calc(100dvh - 12px) !important;'),
    'Landscape modal box has 12px margin limit to fit in 300px-400px heights'
  );
  assert.ok(
    styleCss.includes('padding: 10px 14px !important;'),
    'Compact modal padding in landscape'
  );
});

test('Landscape & Modal: Menu is row layout in landscape and column in portrait', () => {
  assert.ok(
    styleCss.includes('#scr-menu {\n    flex-direction: row !important;'),
    'Landscape menu uses row layout so partner card is visible alongside menu'
  );
  assert.ok(
    styleCss.includes('#scr-menu {\n    flex-direction: column !important;'),
    'Portrait menu uses column layout for vertical stacking'
  );
  assert.ok(
    styleCss.includes('#menu-partner {\n    height: min(28vh, 120px) !important;'),
    'Partner sprite sized appropriately in landscape'
  );
});

test('Landscape & Modal: Fullscreen event listeners and lifecycle handling', () => {
  assert.ok(
    settingsUiJs.includes("document.addEventListener(ev, () => {"),
    'Registers fullscreenchange and webkitfullscreenchange listeners'
  );
  assert.ok(
    settingsUiJs.includes('updateFullBtn'),
    'Updates btn-full label, icon and active class'
  );
  assert.ok(
    settingsUiJs.includes('let fullPending = false;'),
    'Protects against rapid or repeated requestFullscreen invocations'
  );
  assert.ok(
    settingsUiJs.includes('screen.orientation.lock'),
    'Attempts landscape orientation lock safely with try/catch'
  );
});

test('Landscape & Modal: Account recovery modal structure is compliant', () => {
  assert.ok(devHtml.includes('id="scr-recover"'), 'dev.html contains #scr-recover');
  assert.ok(devHtml.includes('id="rec-link"'), 'Contains Vincular / Link button');
  assert.ok(devHtml.includes('id="rec-later"'), 'Contains Ahora no / Cancel button');
  assert.ok(devHtml.includes('id="rec-never"'), 'Contains Never ask again button');
});
