const { execSync } = require('child_process');
const crypto = require('crypto');
const run = cmd => execSync(cmd, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).trim();

const refs = ['main', 'gh-pages', 'origin/main', 'origin/gh-pages', 'v1.4.1-vi^{commit}'];

console.log('=== SO SÁNH VERSION.JSON, INDEX.HTML, APP.MIN.JS TRÊN CÁC REFS ===');

for (const r of refs) {
  try {
    const commitSha = run(`git rev-parse "${r}"`);
    const vJson = run(`git show "${r}:version.json"`);
    const idxHtml = run(`git show "${r}:index.html"`);
    const appMin = execSync(`git show "${r}:js/app.min.js"`, { maxBuffer: 20 * 1024 * 1024 });
    
    const vMatch = idxHtml.match(/app\.min\.js\?v=([a-f0-9]+)/);
    const scriptTagV = vMatch ? vMatch[1] : 'NOT FOUND';
    const shaAppMin = crypto.createHash('sha1').update(appMin).digest('hex');

    console.log(`Ref: ${r}`);
    console.log(`  Commit SHA: ${commitSha}`);
    console.log(`  version.json: ${vJson.replace(/\s+/g, ' ')}`);
    console.log(`  index.html script tag: app.min.js?v=${scriptTagV}`);
    console.log(`  js/app.min.js size: ${appMin.length} bytes, SHA1: ${shaAppMin}`);
  } catch (e) {
    console.log(`Ref ${r} error:`, e.message);
  }
}
