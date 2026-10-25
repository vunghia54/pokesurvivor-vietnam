const BASE = 'https://vunghia54.github.io/pokesurvivor-vietnam';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function testLiveProduction() {
  const ts = Date.now();
  console.log('=== TEST LIVE PRODUCTION VỚI CACHE-BUSTING ===\n');

  // 1. version.json
  const vRes = await fetch(`${BASE}/version.json?_t=${ts}`, { cache: 'no-store' });
  const vText = await vRes.text();
  console.log(`1. version.json (Status: ${vRes.status}, ETag: ${vRes.headers.get('etag')}, Last-Modified: ${vRes.headers.get('last-modified')})`);
  console.log('   Nội dung:', vText.trim());
  const vJson = JSON.parse(vText);

  // 2. index.html
  const idxRes = await fetch(`${BASE}/index.html?_t=${ts}`, { cache: 'no-store' });
  const idxText = await idxRes.text();
  const scriptTagMatch = idxText.match(/src="js\/app\.min\.js\?v=([a-f0-9]+)"/);
  const bundleVersionInHtml = scriptTagMatch ? scriptTagMatch[1] : 'NOT FOUND';
  console.log(`\n2. index.html (Status: ${idxRes.status}, ETag: ${idxRes.headers.get('etag')})`);
  console.log(`   Script tag trỏ tới: js/app.min.js?v=${bundleVersionInHtml}`);

  // 3. js/app.min.js?v=12819ab884
  const jsUrl = `${BASE}/js/app.min.js?v=${vJson.v}`;
  const jsRes = await fetch(jsUrl, { method: 'GET', cache: 'no-store' });
  const jsBuffer = Buffer.from(await jsRes.arrayBuffer());
  const jsSha1 = crypto.createHash('sha1').update(jsBuffer).digest('hex');
  console.log(`\n3. js/app.min.js?v=${vJson.v} (Status: ${jsRes.status}, Size: ${jsBuffer.length} bytes, SHA1: ${jsSha1})`);

  // Check if live app.min.js matches local
  const localJs = fs.readFileSync(path.join(__dirname, '../js/app.min.js'));
  const localSha1 = crypto.createHash('sha1').update(localJs).digest('hex');
  console.log(`   So sánh với file local: Local SHA1 = ${localSha1}`);
  console.log(`   -> Khớp 100%: ${jsSha1 === localSha1 ? 'ĐÚNG (100% IDENTICAL)' : 'KHÔNG KHỚP'}`);

  // 4. Test sprites for all 36 playable megas on live production
  console.log('\n4. Kiểm tra sprite của toàn bộ 36 dạng Mega trên production...');
  global.window = {}; global.G = {};
  require('../js/systems/mega.js');
  const playableForms = Object.values(G.Mega.FORMS).filter(f => f.spriteAvailable);
  console.log(`   Tổng số dạng Playable: ${playableForms.length}`);

  let successSprites = 0;
  let failedSprites = 0;

  for (const form of playableForms) {
    const spriteUrl = `${BASE}/assets/pokemon/${form.spriteId}/Idle.png?_t=${ts}`;
    try {
      const sRes = await fetch(spriteUrl, { method: 'HEAD', cache: 'no-store' });
      if (sRes.status === 200) {
        successSprites++;
      } else {
        console.log(`   [FAIL] ${form.id} (${form.spriteId}): HTTP ${sRes.status}`);
        failedSprites++;
      }
    } catch (e) {
      console.log(`   [ERR] ${form.id} (${form.spriteId}):`, e.message);
      failedSprites++;
    }
  }

  console.log(`   Kết quả kiểm tra sprite live: ${successSprites}/${playableForms.length} thành công (HTTP 200 OK), ${failedSprites} lỗi.`);
}

testLiveProduction().catch(console.error);
