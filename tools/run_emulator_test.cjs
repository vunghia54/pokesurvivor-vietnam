'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
// Explicitly emulator-only. No deploy command, production URL or data import.
let cli=process.env.FIREBASE_CLI_PATH;
if(!cli){try{cli=require.resolve('firebase-tools/lib/bin/firebase.js');}catch(_){}}
if(!cli||!fs.existsSync(cli)){
  console.error('Set FIREBASE_CLI_PATH to the installed firebase-tools/lib/bin/firebase.js, then rerun npm run test:emulators.');
  process.exitCode=1;
}else{
  const p=spawn(process.execPath,[cli,'emulators:exec','--only','firestore,auth,database','--project','plucky-courier-365002','node tools/test.cjs rules'],{cwd:path.join(__dirname,'..'),stdio:'inherit',windowsHide:true});
  p.on('error',e=>{console.error(e.message);process.exitCode=1;});
  p.on('exit',code=>{process.exitCode=code===null?1:code;});
}
