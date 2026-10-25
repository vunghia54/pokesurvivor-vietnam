const TARGET = '12819ab884';
const URL = 'https://vunghia54.github.io/pokesurvivor-vietnam/version.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function check() {
  console.log(`Checking GitHub Pages for version ${TARGET}...`);
  for (let i = 1; i <= 60; i++) {
    try {
      const res = await fetch(`${URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        console.log(`[Attempt ${i}] Live version.json:`, json);
        if (json.v === TARGET) {
          console.log(`>>> GITHUB PAGES DEPLOYED TARGET BUNDLE ${TARGET} SUCCESSFULLY! <<<`);
          process.exit(0);
        }
      } else {
        console.log(`[Attempt ${i}] HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`[Attempt ${i}] Fetch error:`, e.message);
    }
    await sleep(4000);
  }
  console.error(`Timeout waiting for GitHub Pages to deploy ${TARGET}`);
  process.exit(1);
}

check();
