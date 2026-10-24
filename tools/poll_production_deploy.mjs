async function poll() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('https://vunghia54.github.io/pokesurvivor-vietnam/version.json?_=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      console.log('Attempt ' + (i+1) + ': version = ' + data.v);
      if (data.v === '580607caed') {
        console.log('DEPLOYED: GitHub Pages updated to v1.3.2 (580607caed)!');
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
    console.log('Timeout waiting for GitHub Pages');
  }
});
