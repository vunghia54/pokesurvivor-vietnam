async function poll() {
  const target = 'e5bd636a6b';
  console.log(`Polling https://vunghia54.github.io/pokesurvivor-vietnam/version.json for target version ${target}...`);
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('https://vunghia54.github.io/pokesurvivor-vietnam/version.json?_=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      console.log(`Attempt ${i+1}: version = ${data.v} (target = ${target})`);
      if (data.v === target) {
        console.log(`\nSUCCESS: GitHub Pages is DEPLOYED and ACTIVE with v1.3.3 (${target})!`);
        return true;
      }
    } catch (e) {
      console.log('Error: ' + e.message);
    }
    await new Promise(r => setTimeout(r, 6000));
  }
  return false;
}

poll().then(ok => {
  if (!ok) {
    console.log('Timeout waiting for GitHub Pages deployment.');
    process.exit(1);
  }
});
