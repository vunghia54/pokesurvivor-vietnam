'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
// Explicitly emulator-only. No deploy command, production URL or data import.
let cli=process.env.FIREBASE_CLI_PATH;
if(!cli){try{cli=require.resolve('firebase-tools/lib/bin/firebase.js');}catch(_){}}
if(!cli){
  const npxFallback='C:/Users/vutru/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/bin/firebase.js';
  if(fs.existsSync(npxFallback))cli=npxFallback;
}
if(!cli||!fs.existsSync(cli)){
  console.error('Set FIREBASE_CLI_PATH to the installed firebase-tools/lib/bin/firebase.js, then rerun npm run test:emulators.');
  process.exitCode=1;
}else{
  const mode = process.argv[2] || 'rules';
  const p=spawn(process.execPath,[cli,'emulators:exec','--only','firestore,auth,database','--project','plucky-courier-365002',`node tools/test.cjs ${mode}`],{cwd:path.join(__dirname,'..'),stdio:'inherit',windowsHide:true});
  p.on('error',e=>{console.error(e.message);process.exitCode=1;});
  p.on('exit',code=>{process.exitCode=code===null?1:code;});
}
