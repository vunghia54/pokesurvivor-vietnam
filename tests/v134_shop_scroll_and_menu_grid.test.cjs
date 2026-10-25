'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const devHtml = fs.readFileSync(path.join(root, 'dev.html'), 'utf8').replace(/\r\n/g, '\n');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const styleCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8').replace(/\r\n/g, '\n');

test('v1.3.4 Shop: Markup hierarchy places subscreen-header as first child and scrollable body as second child', () => {
  for (const [name, html] of [['dev.html', devHtml], ['index.html', indexHtml]]) {
    const shopSection = html.substring(html.indexOf('id="scr-shop"'), html.indexOf('</section>', html.indexOf('id="scr-shop"')));
    
    // Subscreen box contains header before body
    const headerIdx = shopSection.indexOf('class="subscreen-header"');
    const bodyIdx = shopSection.indexOf('class="subscreen-body shop-body-scroll"');
    const stallIdx = shopSection.indexOf('id="shop-stall"');
    const innerIdx = shopSection.indexOf('class="shop-inner"');
    
    assert.ok(headerIdx > 0, `${name}: scr-shop contains subscreen-header`);
    assert.ok(bodyIdx > 0, `${name}: scr-shop contains subscreen-body shop-body-scroll`);
    assert.ok(stallIdx > 0, `${name}: scr-shop contains shop-stall`);
    assert.ok(innerIdx > 0, `${name}: scr-shop contains shop-inner`);
    
    assert.ok(headerIdx < bodyIdx, `${name}: subscreen-header is placed BEFORE subscreen-body`);
    assert.ok(bodyIdx < stallIdx, `${name}: subscreen-body contains shop-stall`);
    assert.ok(stallIdx < innerIdx, `${name}: shop-stall is placed before shop-inner inside scroll body`);
  }
});

test('v1.3.4 Shop: CSS ensures independent body scrolling and responsive stall dimensions', () => {
  assert.ok(
    styleCss.includes('.shop-body-scroll') && styleCss.includes('overflow-y: auto') && styleCss.includes('min-height: 0'),
    'shop-body-scroll has overflow-y: auto and min-height: 0'
  );
  assert.ok(
    styleCss.includes('.shop-stall') && styleCss.includes('flex-shrink: 0'),
    'shop-stall has flex-shrink: 0 to prevent collapsing'
  );
  assert.ok(
    styleCss.includes('@media (max-height: 540px)') && styleCss.includes('.shop-stall { height: 180px;'),
    'shop-stall has compact height 180px on landscape mobile'
  );
  assert.ok(
    styleCss.includes('@media (max-height: 400px)') && styleCss.includes('.shop-stall { height: 150px;'),
    'shop-stall has compact height 150px on ultra-low landscape'
  );
});

test('v1.3.4 Menu Grid: 2-column balanced grid with equal-height rows and responsive stretch', () => {
  assert.ok(
    styleCss.includes('grid-template-columns: repeat(2, 1fr) !important;'),
    'Menu list uses 2 equal columns'
  );
  assert.ok(
    styleCss.includes('grid-template-rows: auto repeat(5, 1fr) !important;'),
    'Menu list uses auto for Play and equal 1fr for rows 2-6'
  );
  assert.ok(
    styleCss.includes('.menu-item.play {\n    grid-column: span 2 !important;'),
    'Play button spans 2 columns at the top'
  );
  assert.ok(
    styleCss.includes('.menu-item[data-go="settings"] {\n    grid-column: span 2 !important;'),
    'Settings button spans 2 columns at the bottom'
  );
  assert.ok(
    styleCss.includes('.menu-item') && styleCss.includes('height: 100% !important;'),
    'Menu items have height: 100% to fill row height equally'
  );
  assert.ok(
    styleCss.includes('.menu-right') && styleCss.includes('overflow-y: auto !important;'),
    'Menu right side has internal vertical scroll capability'
  );
  assert.ok(
    styleCss.includes('.menu-right .box') && styleCss.includes('flex: 1 1 auto !important;') && styleCss.includes('min-height: 0 !important;'),
    'Menu box stretches dynamically to utilize available height'
  );
});
