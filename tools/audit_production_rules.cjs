'use strict';
// READ-ONLY production audit. Never prints tokens, deploys rules or reads player data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const PROJECT='plucky-courier-365002';
const ROOT=path.join(__dirname,'..');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
 let token=process.env.FIREBASE_AUDIT_ACCESS_TOKEN;
 if(!token){
  const cfg=path.join(os.homedir(),'.config','configstore','firebase-tools.json');
  if(fs.existsSync(cfg)){const data=JSON.parse(fs.readFileSync(cfg,'utf8'));token=data.tokens&&data.tokens.access_token;}
 }
 if(!token)throw Error('No existing Firebase CLI access token. Production rules could not be verified.');
 const out=path.join(ROOT,'backups','production-codex-audit-'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(out,{recursive:true});
 async function get(url){
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error(`Read-only API request failed: HTTP ${res.status} (${new URL(url).hostname})`);
  return res.json();
 }
 const report={project:PROJECT,checkedAt:new Date().toISOString(),readOnly:true};
 try{
  const data=await get('https://'+PROJECT+'-default-rtdb.asia-southeast1.firebasedatabase.app/.settings/rules.json');
  fs.writeFileSync(path.join(out,'database.rules.json'),JSON.stringify(data,null,2)+'\n');
  const canonical=x=>JSON.stringify(x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
  report.database={verified:true,productionHash:hash(canonical(data)),localHash:hash(canonical(JSON.parse(fs.readFileSync(path.join(ROOT,'database.rules.json'),'utf8'))))};
  report.database.matches=report.database.productionHash===report.database.localHash;
 }catch(e){report.database={verified:false,error:e.cause?.code||e.message};}
 try{
  const release=await get('https://firebaserules.googleapis.com/v1/projects/'+PROJECT+'/releases/cloud.firestore');
  const ruleset=await get('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
  fs.writeFileSync(path.join(out,'firestore-release.json'),JSON.stringify(release,null,2)+'\n');
  fs.writeFileSync(path.join(out,'firestore-ruleset.json'),JSON.stringify(ruleset,null,2)+'\n');
  const file=ruleset.source.files.find(f=>f.name==='firestore.rules')||ruleset.source.files[0];
  if(!file)throw Error('Ruleset contains no source file');
  fs.writeFileSync(path.join(out,'firestore.rules'),file.content);
  report.firestore={verified:true,ruleset:release.rulesetName,productionHash:hash(file.content),localHash:hash(fs.readFileSync(path.join(ROOT,'firestore.rules')))};
  report.firestore.matches=report.firestore.productionHash===report.firestore.localHash;
 }catch(e){report.firestore={verified:false,error:e.cause?.code||e.message};}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(!report.database.verified||!report.firestore.verified)process.exitCode=1;
}
main().catch(e=>{console.error(e.cause?.code||e.message);process.exitCode=1;});
