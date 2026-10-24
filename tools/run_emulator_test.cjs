const { spawn } = require('child_process');
const path = require('path');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const batPath = path.join(__dirname, 'run_test.bat');
const args = [
  'firebase-tools',
  'emulators:exec',
  '--only', 'firestore,auth,database',
  '--project', 'plucky-courier-365002',
  batPath
];

console.log('Starting Firebase Emulators & running integration tests...');
const proc = spawn(npx, args, { stdio: 'inherit', shell: true });

proc.on('close', code => {
  console.log(`Firebase emulators process exited with code ${code}`);
  process.exit(code || 0);
});
