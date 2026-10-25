'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Mock Canvas 2D context tracking path commands
class MockCanvasContext {
  constructor() {
    this.commands = [];
    this.fillStyle = '';
  }
  beginPath() { this.commands.push({ type: 'beginPath' }); }
  moveTo(x, y) { this.commands.push({ type: 'moveTo', x: Math.round(x), y: Math.round(y) }); }
  ellipse(x, y, rx, ry, rot, sa, ea) {
    this.commands.push({
      type: 'ellipse',
      x: Math.round(x),
      y: Math.round(y),
      rx: Math.round(rx),
      ry: Math.round(ry)
    });
  }
  fill() { this.commands.push({ type: 'fill' }); }
  stroke() { this.commands.push({ type: 'stroke' }); }
  save() { this.commands.push({ type: 'save' }); }
  restore() { this.commands.push({ type: 'restore' }); }
}

function setupProjectilesEnv() {
  global.window = global;
  global.G = {
    LIFT: 12,
    VFX: {
      forType: () => ({ proj: 'circle', pal: ['#fff'] }),
      isDir: () => false,
      spins: () => false,
      draw: () => {}
    }
  };

  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'entities', 'projectile.js'), 'utf8');
  eval(code);
  return global.G.Projectiles;
}

test('Hotfix v1.3.6.1: Projectile shadows do not connect into giant polygons', async (t) => {
  const Projectiles = setupProjectilesEnv();
  Projectiles.clear();

  await t.test('1. Single projectile: moveTo preceded ellipse', () => {
    Projectiles.clear();
    Projectiles.spawn({ x: 100, y: 100, r: 10, friendly: true, life: 2 });
    const ctx = new MockCanvasContext();
    Projectiles.draw(ctx);

    const moves = ctx.commands.filter(c => c.type === 'moveTo');
    const ellipses = ctx.commands.filter(c => c.type === 'ellipse');

    assert.equal(ellipses.length, 1);
    assert.equal(moves.length, 1);
    assert.equal(moves[0].x, 100 + Math.round(10 * 0.9));
    assert.equal(moves[0].y, 100);
  });

  await t.test('2. Two distant projectiles: each has its own independent subpath', () => {
    Projectiles.clear();
    Projectiles.spawn({ x: 50, y: 50, r: 10, friendly: true, life: 2 });
    Projectiles.spawn({ x: 500, y: 350, r: 10, friendly: true, life: 2 });
    const ctx = new MockCanvasContext();
    Projectiles.draw(ctx);

    const moves = ctx.commands.filter(c => c.type === 'moveTo');
    const ellipses = ctx.commands.filter(c => c.type === 'ellipse');

    assert.equal(ellipses.length, 2);
    assert.equal(moves.length, 2, 'Each ellipse must have a preceding moveTo to prevent line bridging');
    // First ellipse
    assert.equal(moves[0].x, 50 + Math.round(10 * 0.9));
    assert.equal(moves[0].y, 50);
    // Second ellipse
    assert.equal(moves[1].x, 500 + Math.round(10 * 0.9));
    assert.equal(moves[1].y, 350);
  });

  await t.test('3. Three projectiles in triangle: no connecting lines between vertices', () => {
    Projectiles.clear();
    Projectiles.spawn({ x: 100, y: 100, r: 15, friendly: true, life: 2 });
    Projectiles.spawn({ x: 500, y: 100, r: 15, friendly: true, life: 2 });
    Projectiles.spawn({ x: 300, y: 400, r: 15, friendly: true, life: 2 });
    const ctx = new MockCanvasContext();
    Projectiles.draw(ctx);

    // Verify ordering: moveTo must strictly precede each ellipse
    const pathCmds = ctx.commands.filter(c => c.type === 'moveTo' || c.type === 'ellipse');
    assert.equal(pathCmds.length, 6);
    for (let i = 0; i < 3; i++) {
      assert.equal(pathCmds[i * 2].type, 'moveTo');
      assert.equal(pathCmds[i * 2 + 1].type, 'ellipse');
    }
  });

  await t.test('4. Enemy projectiles warning circles: moveTo preceded for each red warning circle', () => {
    Projectiles.clear();
    Projectiles.spawn({ x: 80, y: 80, r: 10, friendly: false, life: 2 });
    Projectiles.spawn({ x: 400, y: 250, r: 12, friendly: false, life: 2 });
    const ctx = new MockCanvasContext();
    Projectiles.draw(ctx);

    const moves = ctx.commands.filter(c => c.type === 'moveTo');
    const ellipses = ctx.commands.filter(c => c.type === 'ellipse');

    // 2 shadows + 2 enemy warning circles = 4 ellipses
    assert.equal(ellipses.length, 4);
    assert.equal(moves.length, 4, 'All 4 ellipses (shadows + enemy circles) must have moveTo');
  });

  await t.test('5. Multi-Cast (8 skills simultaneous) and scattered projectiles', () => {
    Projectiles.clear();
    for (let i = 0; i < 8; i++) {
      Projectiles.spawn({
        x: 100 + i * 50,
        y: 150 + (i % 2) * 60,
        r: 10,
        friendly: true,
        life: 2
      });
    }
    const ctx = new MockCanvasContext();
    Projectiles.draw(ctx);

    const moves = ctx.commands.filter(c => c.type === 'moveTo');
    const ellipses = ctx.commands.filter(c => c.type === 'ellipse');

    assert.equal(ellipses.length, 8);
    assert.equal(moves.length, 8);
  });
});
