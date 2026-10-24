const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
// Client-contract tests execute the actual modules. These mocks do NOT evaluate Security Rules.
function social(uid='guest',initial={}){
 const tree=structuredClone(initial),calls=[],listeners=new Map();
 const get=p=>p.split('/').filter(Boolean).reduce((v,k)=>v&&v[k],tree)??null;
 function put(p,v){const keys=p.split('/').filter(Boolean);let node=tree;for(const k of keys.slice(0,-1))node=node[k]||(node[k]={});if(v===null)delete node[keys.at(-1)];else node[keys.at(-1)]=structuredClone(v);}
 function ref(p){return {key:'new-room',child:k=>ref(p+'/'+k),get:async()=>({val:()=>get(p)}),push:()=>({key:'new-room'}),set:async v=>{calls.push(['set',p,v]);put(p,v);},update:async patch=>{calls.push(['update',p,patch]);for(const [k,v]of Object.entries(patch))put(p+'/'+k,v);},remove:async()=>{calls.push(['remove',p]);put(p,null);},on(ev,fn){listeners.set(p,fn);},off(ev,fn){calls.push(['off',p,ev,fn]);listeners.delete(p);},onDisconnect:()=>({remove:async()=>{calls.push(['disconnect-remove',p]);},cancel:async()=>{calls.push(['disconnect-cancel',p]);}})};}
 const db={ref,goOnline(){calls.push(['online']);},goOffline(){calls.push(['offline']);}};
 const G={DB:{fb:{uid,rtdb:db},online:true,user:'Trainer',save:{partner:25},ownsShiny:()=>false,setName(){},onLeave(){}},Presence:{usesDatabase:()=>true}};
 new Function('G','window','firebase','localStorage','fetch','setTimeout','clearTimeout',source('js/net/social.js'))(G,{PS_LOCALES:{lang:'vi-VN'}},{database:{ServerValue:{TIMESTAMP:123}}},{getItem:k=>k.startsWith('ps.nick.')?'Trainer':null,setItem(){},removeItem(){}},async()=>({headers:{get:()=>null}}),()=>0,()=>{});
 return {S:G.Social,G,tree,calls,db,emit:(p,v)=>listeners.get(p)?.({val:()=>v})};
}
const initial=()=>({rooms:{r:{host:'host',open:true,m:{host:{slot:'0',name:'Host',dex:25}},slots:{0:'host'}}}});
test('room creation includes only host and matching seat; presence connection stays online',async()=>{
 const x=social('host');await x.S.start();await x.S.createRoom();
 const r=x.tree.rooms['new-room'];assert.deepEqual(Object.keys(r.m),['host']);assert.equal(r.m.host.slot,'0');assert.equal(r.slots[0],'host');assert.ok(!x.calls.some(c=>c[0]==='offline'));
});
test('join uses a single atomic membership/reservation update',async()=>{
 const x=social('guest',initial());await x.S.start();assert.equal((await x.S.joinRoom('r')).ok,true);
 const writes=x.calls.filter(c=>c[0]==='update');assert.equal(writes.length,1);assert.equal(writes[0][2]['m/guest'].slot,'1');assert.equal(writes[0][2]['slots/1'],'guest');
});
test('full room refuses join without writing or deleting someone else',async()=>{
 const state=initial();state.rooms.r.slots={0:'host',1:'a',2:'b',3:'c'};
 const x=social('fifth',state);await x.S.start();assert.equal((await x.S.joinRoom('r')).ok,false);assert.ok(!x.calls.some(c=>['set','update','remove'].includes(c[0])));
});
test('roster UID is authoritative even when legacy data contains a forged uid field',async()=>{
 const x=social('guest',initial());await x.S.start();await x.S.joinRoom('r');
 x.emit('rooms/r/m',{host:{name:'Host',dex:25},guest:{name:'Guest',dex:25,uid:'host'}});
 assert.deepEqual(x.S.room.members.map(m=>m.uid),['host','guest']);
});
test('leaving releases membership and reserved seat together; shared listeners survive',async()=>{
 const x=social('guest',initial());await x.S.start();await x.S.joinRoom('r');await x.S.leaveRoom();
 const patch=x.calls.filter(c=>c[0]==='update').at(-1)[2];assert.deepEqual(patch,{'m/guest':null,'slots/1':null});
 const off=x.calls.find(c=>c[0]==='off'&&c[1]==='.info/connected');assert.equal(off[2],'value');assert.equal(typeof off[3],'function');assert.ok(!x.calls.some(c=>c[0]==='offline'));
});
test('playing host cancels room deletion and never writes another member during recovery',async()=>{
 const x=social('host');await x.S.start();await x.S.createRoom();x.S.setPlaying(true);
 assert.ok(x.calls.some(c=>c[0]==='disconnect-cancel'&&c[1]==='rooms/new-room'));
 x.emit('rooms/new-room/m',{host:{name:'Host',dex:25},guest:{name:'Guest',dex:6}});
 x.emit('rooms/new-room/m',{host:{name:'Host',dex:25}});
 assert.ok(!x.calls.some(c=>['set','update'].includes(c[0])&&c[1].includes('/m/guest')));
});

function presence({loggedIn=true,disabled=false,reject=false}={}){
 const writes=[],removed=[],listeners=new Map();let guestInit=0;
 const makeDb=name=>({goOnline(){},goOffline(){},ref:p=>({on(ev,fn){listeners.set(name+':'+p,fn);},off(){},set:async v=>{if(reject)throw Error('PERMISSION_DENIED');writes.push([name,p,v]);},remove:async()=>{removed.push([name,p,mainAuth.currentUser && mainAuth.currentUser.uid]);},onDisconnect:()=>({remove:async()=>{},cancel:async()=>{}})})});
 const main=makeDb('main'),guest=makeDb('guest');
 const mainAuth={currentUser:loggedIn?{uid:'signed-user'}:null};
 const guestAuth={currentUser:null,setPersistence:async()=>{},signInAnonymously:async()=>{guestAuth.currentUser={uid:'anonymous-user'};return {user:guestAuth.currentUser};}};
 const firebase={apps:[],auth:{Auth:{Persistence:{LOCAL:'local'}}},database:{ServerValue:{TIMESTAMP:123}},initializeApp(){guestInit++;return {auth:()=>guestAuth,database:()=>guest};}};
 const G={FIREBASE_CONFIG:disabled?null:{databaseURL:'https://test.invalid'},FIREBASE_CONFIG_READY:{databaseURL:'https://never-use.invalid'},DB:{fb:{uid:'signed-user',auth:mainAuth,rtdb:main}}};
 new Function('G','window','console',source('js/net/presence.js'))(G,{firebase,addEventListener(){}},{warn(){}});
 return {P:G.Presence,G,writes,removed,main,mainAuth,guestInit:()=>guestInit,connect:which=>listeners.get(which+':.info/connected')?.({val:()=>true})};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('authenticated presence uses the matching main Firebase auth and database',async()=>{
 const x=presence();await x.P.init();x.connect('main');await settle();assert.equal(x.guestInit(),0);assert.ok(x.P.usesDatabase(x.main));assert.match(x.writes[0][1],/^\/presence\/signed-user\//);assert.equal(x.P.isConnected,true);
});
test('disabled Firebase never falls back to production READY config',async()=>{const x=presence({disabled:true});await x.P.init();assert.equal(x.guestInit(),0);assert.equal(x.writes.length,0);});
test('presence write denial never produces a false online state',async()=>{const x=presence({reject:true});await x.P.init();x.connect('main');await settle();assert.equal(x.P.isConnected,false);});
test('guest-to-account-to-guest switches databases without inventing an unauthenticated UID',async()=>{
 const x=presence({loggedIn:false});await x.P.init();x.connect('guest');await settle();assert.match(x.writes.at(-1)[1],/^\/presence\/anonymous-user\//);
 x.mainAuth.currentUser={uid:'signed-user'};await x.P.setUid('signed-user');x.connect('main');await settle();assert.match(x.writes.at(-1)[1],/^\/presence\/signed-user\//);
 await x.P.setUid('forged-user');assert.equal(x.P.usesDatabase(x.main),true);
 x.mainAuth.currentUser=null;await x.P.onLogout();x.connect('guest');await settle();assert.match(x.writes.at(-1)[1],/^\/presence\/anonymous-user\//);
});

test('logout removes signed-in presence before the main auth session is cleared',async()=>{
 const x=presence();await x.P.init();x.connect('main');await settle();await x.P.beforeLogout();
 assert.equal(x.removed.length,1);assert.equal(x.removed[0][2],'signed-user');assert.equal(x.P.isConnected,false);
});
