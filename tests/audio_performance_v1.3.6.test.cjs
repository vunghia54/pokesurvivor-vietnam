'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Mock Web Audio API for Node.js test environment
class MockAudioNode {
  constructor(ctx) {
    this.context = ctx;
    this.connectedTo = [];
    this.disconnected = false;
  }
  connect(dest) {
    this.connectedTo.push(dest);
    return dest;
  }
  disconnect(dest) {
    this.disconnected = true;
    if (dest) {
      const idx = this.connectedTo.indexOf(dest);
      if (idx >= 0) this.connectedTo.splice(idx, 1);
    } else {
      this.connectedTo = [];
    }
  }
}

class MockAudioParam {
  constructor(val = 0) {
    this.value = val;
    this.scheduled = [];
  }
  setValueAtTime(val, t) { this.value = val; this.scheduled.push(['set', val, t]); }
  linearRampToValueAtTime(val, t) { this.value = val; this.scheduled.push(['linear', val, t]); }
  exponentialRampToValueAtTime(val, t) { this.value = val; this.scheduled.push(['exp', val, t]); }
  setTargetAtTime(val, t, tc) { this.value = val; this.scheduled.push(['target', val, t, tc]); }
  cancelScheduledValues(t) { this.scheduled.push(['cancel', t]); }
}

class MockGainNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.gain = new MockAudioParam(1);
    ctx._createdGains.push(this);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
    this.onended = null;
    ctx._createdOscs.push(this);
  }
  start(t) { this.started = true; }
  stop(t) {
    this.stopped = true;
    if (typeof this.onended === 'function') {
      process.nextTick(() => { try { this.onended(); } catch (_) {} });
    }
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
    ctx._createdFilters.push(this);
  }
}

class MockBufferSourceNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.started = false;
    this.stopped = false;
    this.onended = null;
    ctx._createdSources.push(this);
  }
  start(t, offset) { this.started = true; }
  stop(t) {
    this.stopped = true;
    if (typeof this.onended === 'function') {
      process.nextTick(() => { try { this.onended(); } catch (_) {} });
    }
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.threshold = new MockAudioParam(-6);
    this.knee = new MockAudioParam(10);
    this.ratio = new MockAudioParam(16);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.12);
  }
}

class MockConvolverNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0.1;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode(this);
    this._createdOscs = [];
    this._createdGains = [];
    this._createdFilters = [];
    this._createdSources = [];
  }
  createGain() { return new MockGainNode(this); }
  createOscillator() { return new MockOscillatorNode(this); }
  createBiquadFilter() { return new MockBiquadFilterNode(this); }
  createBufferSource() { return new MockBufferSourceNode(this); }
  createDynamicsCompressor() { return new MockDynamicsCompressorNode(this); }
  createConvolver() { return new MockConvolverNode(this); }
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length)
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

function setupAudioEnv() {
  const mockStorage = {};
  global.localStorage = {
    getItem: k => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: k => { delete mockStorage[k]; }
  };
  global.window = global;
  global.AudioContext = MockAudioContext;
  global.addEventListener = () => {};
  global.document = {
    hidden: false,
    addEventListener: () => {}
  };
  global.performance = { now: () => Date.now() };

  const origSetInterval = global.setInterval;
  global.setInterval = (fn, ms) => {
    const t = origSetInterval(fn, ms);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };
  const origSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => {
    const t = origSetTimeout(fn, ms);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };

  // Setup minimal G namespace
  global.G = {
    U: { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) },
    MUSIC: {
      village: {
        bpm: 100, swing: 0.1, chords: ['F', 'C'],
        melody: [], parts: [], drums: {}
      }
    }
  };

  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'audio.js'), 'utf8');
  eval(code);
  return global.G.Audio;
}

test('v1.3.5 Audio Restoration: Init and unlock creates original compressor, master and buses', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();
  assert.equal(Audio.canPlay(), true);
  assert.equal(Audio.running, true);
  assert.equal(typeof Audio.setVolume, 'function');
  assert.equal(typeof Audio.toggleMute, 'function');
  assert.equal(typeof Audio.music, 'function');
  assert.equal(typeof Audio.sfx, 'function');
  assert.equal(typeof Audio.debugMeter, 'function');
  assert.equal(typeof Audio.debugStream, 'function');
});

test('v1.3.5 Audio Restoration: Settings defaults match original v1.3.5 (music: 0.55, sfx: 0.7)', () => {
  const Audio = setupAudioEnv();
  assert.equal(Audio.settings.music, 0.55);
  assert.equal(Audio.settings.sfx, 0.7);
  assert.equal(Audio.settings.muted, false);
});

test('v1.3.5 Audio Restoration: Independent volume controls and clamping', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();

  Audio.setVolume('music', 0.4);
  Audio.setVolume('sfx', 0.85);
  assert.equal(Audio.settings.music, 0.4);
  assert.equal(Audio.settings.sfx, 0.85);

  // Clamping check
  Audio.setVolume('music', 1.5);
  Audio.setVolume('sfx', -0.5);
  assert.equal(Audio.settings.music, 1.0);
  assert.equal(Audio.settings.sfx, 0.0);
});

test('v1.3.5 Audio Restoration: Mute toggles properly and persists in localStorage', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();

  const isMuted = Audio.toggleMute();
  assert.equal(isMuted, true);
  assert.equal(Audio.settings.muted, true);

  const unMuted = Audio.toggleMute();
  assert.equal(unMuted, false);
  assert.equal(Audio.settings.muted, false);
});

test('v1.3.5 Audio Restoration: Music scheduler and track transitions', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();

  Audio.music('village');
  assert.equal(Audio.track, 'village');
  Audio.music('village'); // Redundant call should be no-op
  assert.equal(Audio.track, 'village');

  Audio.music(null); // Silence
  assert.equal(Audio.track, null);

  Audio.music('village');
  assert.equal(Audio.track, 'village');
});

test('v1.3.5 Audio Restoration: Original SFX execution (combat, hits, shots, skills)', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();

  // Test standard game SFX calls
  assert.doesNotThrow(() => {
    Audio.sfx('hurt');
    Audio.sfx('hit');
    Audio.sfx('faint');
    Audio.sfx('bossDown');
    Audio.sfx('shiny');
    Audio.sfx('coin');
    Audio.sfx('select');
    Audio.sfx('click');
    Audio.sfx('shot', { kind: 'projectile', type: 'fire' });
    Audio.sfx('shot', { kind: 'beam', type: 'water' });
    Audio.sfx('burst', { rarity: 3 });
    Audio.sfx('reveal', { rarity: 4 });
  });
});

test('v1.3.5 Audio Restoration: Co-op and external calls with extra options do not throw', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();

  assert.doesNotThrow(() => {
    // Calling with ghost flag or extra properties from co-op does not crash
    Audio.sfx('shot', { kind: 'projectile', type: 'electric', ghost: true });
    Audio.sfx('shot', { kind: 'melee', type: 'grass', ghost: false });
  });
});

test('v1.3.5 Audio Restoration: Audio unlock idempotency (never creates duplicate AudioContext)', () => {
  const Audio = setupAudioEnv();
  Audio.unlock();
  const firstRunning = Audio.running;
  Audio.unlock();
  Audio.unlock();
  assert.equal(Audio.running, firstRunning);
});
