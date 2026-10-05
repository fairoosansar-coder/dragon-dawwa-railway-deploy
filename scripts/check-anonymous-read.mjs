// Read-only future-mode test: second server on 127.0.0.1. It never changes
// the protected Preview, Webdev publication settings or review database contents.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
const port=3119,base=`http://127.0.0.1:${port}`;
const processHandle=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:String(port),REVIEW_BIND_HOST:'127.0.0.1',REVIEW_PUBLIC_ORIGIN:base,DD_PUBLIC_READ_MODE:'approved-public-readonly',STUDY_LIVE_CANARY:'false'},stdio:'ignore'});
try {
  let ready=false;
  for(let attempts=0;attempts<60;attempts++) {
    if(processHandle.exitCode!==null) throw new Error('The isolated server did not start.');
    try{const response=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)});ready=response.status===200;if(ready)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(ready,true,'temporary local-only read server ready');
  const visitor=['/','/quran','/mosques','/mosques/97','/mosque','/resources','/library','/events','/api/content','/api/resources','/api/mosques','/api/events'];
  for(const path of visitor){const result=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(10000)});assert.equal(result.status,200,`public approved read ${path}`);}
  const mosque=await (await fetch(base+'/mosque')).text();
  assert.doesNotMatch(mosque,/id="correction-form"/,'future read-only mosque profile never offers a form it cannot accept');
  assert.match(mosque,/No public submission is stored/);
  const privatePaths=['/member','/staff','/admin','/operations','/study','/contact','/participate','/mosques/official-97','/api/member/me','/api/admin/dashboard','/api/admin/study-usage','/api/study/history','/api/study/audio/example','/api/participation'];
  for(const path of privatePaths){const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(10000)});assert.ok([302,401].includes(response.status),`private route ${path} status=${response.status}`);}
  for(const path of ['/api/study/generate','/api/study/narrate','/api/member/register','/api/participation','/api/corrections']){
    const response=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,401,`anonymous POST denied ${path}`);
  }
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const h=encode({alg:'HS256',typ:'JWT'}),p=encode({appId:process.env.MANUS_PROJECT_ID,openId:'qa_uninvited_public_reader',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
  const signed=`${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
  const options={headers:{Cookie:`webdev_app_session=${signed}`},redirect:'manual',signal:AbortSignal.timeout(10000)};
  for(const path of ['/library','/api/resources'])assert.equal((await fetch(base+path,options)).status,200,`signed uninvited public read ${path}`);
  assert.equal((await fetch(base+'/member',options)).status,403,'signed uninvited reader has no account privilege');
  console.log('PASS localhost-only published-read mode: 12 visitor GETs, 14 protected paths, 5 denied writes, safe mosque profile, and a signed uninvited reader with no account privilege. Main Preview unchanged.');
} finally {
  processHandle.kill('SIGTERM');
  await new Promise(resolve=>{if(processHandle.exitCode!==null)return resolve();processHandle.once('exit',resolve);setTimeout(resolve,1500);});
}
