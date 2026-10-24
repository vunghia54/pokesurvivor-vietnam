// Real browser smoke against local Firebase Emulators only. Fixture-driven, not a manual playtest.
import assert from 'node:assert/strict';
import { BrowserClient, waitForGameBoot } from './coop_browser.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(250);}throw Error('Timeout: '+label);}
const counts=process.argv[2]?[Number(process.argv[2])]:[2,3,4];
if(counts.some(n=>![2,3,4].includes(n)))throw Error('Player count must be 2, 3 or 4');
for(const count of counts){
 const clients=Array.from({length:count},(_,i)=>new BrowserClient(`Audit${count}P${i}`,9350+i));
 const accounts=[];
 try{
  // Fail early before launching browsers if the local static server is unreachable.
  assert.equal((await fetch('http://127.0.0.1:8766/dev.html',{signal:AbortSignal.timeout(5000)})).status,200);
  await Promise.all(clients.map(c=>c.launch()));
  for(const [i,c]of clients.entries()){
   await c.send('Page.navigate',{url:'http://127.0.0.1:8766/dev.html'});await waitForGameBoot(c);
   const name=`Audit${Date.now().toString(36)}${i}`;const pass='EmulatorOnly123!';
   const r=await c.ev(`(async()=>{if(!G.DB.fb.emulator)throw Error('Emulator required');const r=await G.DB.register(${JSON.stringify(name)},${JSON.stringify(pass)});if(!r.ok)return r;await G.Social.start();return {ok:true,uid:G.DB.fb.uid};})()`);
   assert.equal(r.ok,true,JSON.stringify(r));accounts.push({name,pass,uid:r.uid});
   await c.ev('document.getElementById("tap-start")?.click()');
  }
  // Persist the untouched initial account, then verify login and save identity.
  const before=await clients[0].ev('({uid:G.DB.fb.uid,coins:G.DB.save.coins,tickets:G.DB.save.tickets,owned:G.DB.save.owned,shiny:G.DB.save.shiny})');
  assert.equal((await clients[0].ev('G.DB.saveNow()')).ok,true);
  await clients[0].ev('G.DB.logout()');
  assert.equal((await clients[0].ev(`G.DB.login(${JSON.stringify(accounts[0].name)},${JSON.stringify(accounts[0].pass)})`)).ok,true);
  const after=await clients[0].ev('({uid:G.DB.fb.uid,coins:G.DB.save.coins,tickets:G.DB.save.tickets,owned:G.DB.save.owned,shiny:G.DB.save.shiny})');
  assert.deepEqual(after,before);await clients[0].ev('G.Social.start()');
  const id=await clients[0].ev('(async()=>{const r=await G.Social.createRoom();G.LobbyUI.open();return r.id;})()');
  for(const c of clients.slice(1))assert.equal((await c.ev(`(async()=>{const r=await G.Social.joinRoom(${JSON.stringify(id)});G.LobbyUI.open();return r;})()`)).ok,true);
  await until(async()=>{const states=await Promise.all(clients.map(c=>c.ev(`G.Social.room.members.length===${count} && G.Social.room.members.filter(m=>m.uid!==G.DB.fb.uid).every(m=>G.Social.room.isHost?G.Net.mode(m.uid)==='direct':G.Net.mode(G.Social.room.host)==='direct')`)));return states.every(Boolean);},'all peers connected over real WebRTC');
  await clients[0].screenshot(`audit-${count}p-lobby.png`);
  await clients[0].ev(`(()=>{const r=G.Social.room,cfg={k:'start',seed:12345,host:r.host,members:r.members};G.Social.setOpen(false);G.Net.broadcast(cfg);G.Flow.startCoop(cfg);})()`);
  await until(async()=>(await Promise.all(clients.map(c=>c.ev("G.Game.state==='playing'")))).every(Boolean),'all browsers playing');
  // Fill existing move slots through the game API, using valid definitions only.
  for(const c of clients){
   const result=await c.ev(`(()=>{const p=G.Game.player;for(const id of Object.keys(G.Moves.BY_ID)){if(p.slots.length>=8)break;if(!p.slots.some(s=>s.id===id))p.addMove(id);}return {max:p.maxMoves,slots:p.slots.length,mates:G.Coop.puppets().length};})()`);
   assert.equal(result.max,8);assert.equal(result.slots,8);assert.equal(result.mates,count-1);
  }
  // A real guest RTDB disconnect must retain its seat and reconnect while room.open is false.
  const guest=clients[1];await guest.ev('G.DB.fb.rtdb.goOffline()');await sleep(1500);await guest.ev('G.DB.fb.rtdb.goOnline()');
  await until(async()=>guest.ev(`!!G.Social.room && !G.Social.room.lost && G.Social.room.members.length===${count}`),'closed-room reconnect');
  await clients[0].screenshot(`audit-${count}p-battle.png`);
  console.log(`PASS ${count} browsers: login/save identity, lobby, direct WebRTC, match start, 8 move slots, reconnect. Combat balance/revive/mobile remain manual QA.`);
 }finally{
  await Promise.allSettled(clients.map(c=>c.ws?c.ev('G.Social.leaveRoom()'):Promise.resolve()));
  await Promise.allSettled(clients.map(c=>c.close()));
 }
}
