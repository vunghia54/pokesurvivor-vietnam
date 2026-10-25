const fs = require('fs');
const path = require('path');

global.window = {};
global.G = {};
require('../js/systems/mega.js');

const tracker = require('./cache/pmdcollab_tracker.json');

const creditsRaw = fs.readFileSync(path.join(__dirname, 'cache', 'credit_names.txt'), 'utf8');
const creditNames = {};
for (const line of creditsRaw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes(':')) continue;
  const [uid, name] = trimmed.split(':');
  creditNames[uid.trim()] = name.trim();
}

function resolveArtist(uid) {
  if (!uid) return 'Chưa có artist đăng ký (Bounty mở)';
  const match = uid.match(/<@!?(\d+)>/);
  if (match) {
    const rawId = match[1];
    return creditNames[rawId] || `Discord UID ${rawId}`;
  }
  return creditNames[uid] || uid;
}

const REQUIRED_ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];

const lockedForms = Object.entries(G.Mega.FORMS)
  .filter(([k, v]) => !v.spriteAvailable && v.missingReason !== 'THIẾU POKÉMON GỐC')
  .map(([k, v]) => v);

console.log(`Analyzing ${lockedForms.length} locked forms...`);

const results = [];

for (const form of lockedForms) {
  const padDex = form.baseDex.toString().padStart(4, '0');
  const tEntry = tracker[padDex];

  let foundSubgroup = null;
  let subgroupId = '';
  let subgroupName = '';
  let isShinyAvailable = false;
  let animsPresent = [];
  let animsMissing = [...REQUIRED_ANIMS];
  let primaryArtist = '';
  let secondaryArtists = [];

  if (tEntry && tEntry.subgroups) {
    // 1. Try matching by form name or explicit Mega indicator
    for (const [sgId, sgData] of Object.entries(tEntry.subgroups)) {
      const sName = (sgData.name || '').toLowerCase();
      const formKey = form.id.toLowerCase();
      if (sName.includes('mega')) {
        // If form has X or Y, match specifically
        if (formKey.endsWith('_y') && !sName.includes('y')) continue;
        if (formKey.endsWith('_x') && !sName.includes('x')) continue;
        if (formKey.endsWith('_z') && !sName.includes('z')) continue;
        foundSubgroup = sgData;
        subgroupId = sgId;
        subgroupName = sgData.name;
        break;
      }
    }

    // 2. Fallback to subgroups 0001, 0002 if name contains Mega
    if (!foundSubgroup) {
      for (const [sgId, sgData] of Object.entries(tEntry.subgroups)) {
        if (sgId === '0001' || sgId === '0002') {
          foundSubgroup = sgData;
          subgroupId = sgId;
          subgroupName = sgData.name || sgId;
          break;
        }
      }
    }

    if (foundSubgroup) {
      const sFiles = foundSubgroup.sprite_files || {};
      animsPresent = Object.keys(sFiles).filter(a => sFiles[a]);
      animsMissing = REQUIRED_ANIMS.filter(a => !sFiles[a]);

      const cData = foundSubgroup.sprite_credit || {};
      primaryArtist = resolveArtist(cData.primary || '');
      secondaryArtists = (cData.secondary || []).map(sec => resolveArtist(sec));

      // Check shiny
      const childSubgroups = foundSubgroup.subgroups || {};
      for (const [cId, cDataChild] of Object.entries(childSubgroups)) {
        if ((cDataChild.name || '').toLowerCase().includes('shiny') || cId === '0001') {
          isShinyAvailable = cDataChild.sprite_complete === 1;
        }
      }
    }
  }

  let sourceStatus = '';
  let feasibility = '';
  let licenseNote = 'CC BY-NC 4.0 (PMDCollab)';

  if (!foundSubgroup) {
    sourceStatus = 'Chưa có mục Mega trong PMDCollab Tracker';
    feasibility = 'Cần cộng tác viên thiết kế mới từ đầu (8 hướng, đủ 7 hoạt ảnh)';
    licenseNote = 'CC BY-NC 4.0 (Quy chuẩn SpriteCollab)';
  } else {
    const sc = foundSubgroup.sprite_complete || 0;
    if (sc === 1) {
      sourceStatus = `PMDCollab (Subgroup ${subgroupId}: ${subgroupName}) - Có hoạt ảnh cơ bản nhưng thiếu sheet game`;
      feasibility = `Thiếu các hoạt ảnh chiến đấu/hành động: ${animsMissing.join(', ')}`;
    } else {
      sourceStatus = `PMDCollab (Subgroup ${subgroupId}: ${subgroupName}) - Đang vẽ dở / Bounty mở (sc=${sc})`;
      feasibility = `Chờ cộng tác viên hoàn thiện các animation còn thiếu: ${animsMissing.join(', ')}`;
    }
  }

  let artistStr = primaryArtist || 'Chưa có họa sĩ nhận vẽ';
  if (secondaryArtists.length > 0) {
    artistStr += ` (Cộng tác: ${secondaryArtists.join(', ')})`;
  }

  results.push({
    id: form.id,
    name: form.name,
    baseDex: form.baseDex,
    stone: form.stone,
    types: form.types.join('/'),
    sourceStatus,
    animsMissing,
    hasShiny: isShinyAvailable ? 'Có' : 'Chưa có',
    artist: artistStr,
    license: licenseNote,
    feasibility
  });
}

console.log(`Analyzed all ${results.length} forms.`);
fs.writeFileSync('./tools/cache/locked_55_analysis.json', JSON.stringify(results, null, 2), 'utf8');
console.log('Saved to tools/cache/locked_55_analysis.json');
