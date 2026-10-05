// Operator-only review test: one disposable signed QA reader; never mutates the owner account.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID,id='qa_revocation_'+randomUUID().slice(0,12);
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw new Error('Private Preview and owner config required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(user){const now=Date.now(),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:user,iat:Math.floor(now/1000),ddIat:now,exp:Math.floor(now/1000)+900});return `${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;}
async function call(path,stamp,body,options={}){const method=options.method||(body===undefined?'GET':'POST'),headers={Cookie:`webdev_app_session=${stamp}`,...(method==='POST'?{Origin:options.crossSite?'https://external.invalid':origin,'Sec-Fetch-Site':options.crossSite?'cross-site':'same-origin',...(options.form?{}:{'Content-Type':'application/json'})}:{})};return fetch(origin+path,{method,headers,body:method==='POST'?(options.form?'':JSON.stringify(body)):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});}
let invited=false,registered=false,active=token(id);
try{
 const ownerToken=token(owner);
 let r=await call('/api/admin/roles',ownerToken,{userId:id,role:'reader'});assert.equal(r.status,200);invited=true;
 r=await call('/api/member/register',active,{displayName:'Synthetic session QA',avatar:'rosette',preferredLanguage:'en',city:'',mosque:'',contact:'',contactPreference:'none',contactOptIn:false});assert.equal(r.status,201);registered=true;
 r=await call('/api/member/me',active);assert.equal(r.status,200);
 r=await call('/auth/logout',active,undefined,{method:'GET'});assert.equal(r.status,405);
 r=await call('/auth/logout',active,{}, {crossSite:true});assert.ok([403,405].includes(r.status),`cross-site logout must be denied, got ${r.status}`);
 r=await call('/api/member/me',active);assert.equal(r.status,200,'GET and cross-site POST must not revoke session');
 r=await call('/auth/logout',active,{}, {form:true});assert.equal(r.status,303);
 r=await call('/api/member/me',active);assert.equal(r.status,401,'copied JWT must be blacklisted by managed MySQL');
 active=token(id);r=await call('/api/member/me',active);assert.equal(r.status,200,'single-session logout should not disable account');
 r=await call('/auth/logout-all',active,{}, {form:true});assert.equal(r.status,303);
 r=await call('/api/member/me',active);assert.equal(r.status,401,'logout-all epoch must invalidate all old tokens');
 await new Promise(resolve=>setTimeout(resolve,30));active=token(id);
 r=await call('/api/member/me',active);assert.equal(r.status,200,'fresh token after logout-all remains usable');
 r=await call('/api/member/delete',active,{confirm:'DELETE MY ACCOUNT'});assert.equal(r.status,200);registered=false;
 r=await call('/api/admin/roles',ownerToken,{userId:id,role:'revoke'});assert.equal(r.status,200);invited=false;
 r=await call('/api/review/session',active);assert.equal(r.status,403,'role revoke denies even a previously valid copied cookie');
 console.log('PASS real managed MySQL/HTTPS Preview: GET logout 405, cross-site POST denied (app 403 or gateway 405), copied-token blacklist 401, logout-all epoch 401, new token valid, role revoke immediately 403; owner account untouched.');
}finally{
 if(invited||registered){const ownerToken=token(owner);
  if(registered&&!invited){const x=await call('/api/admin/roles',ownerToken,{userId:id,role:'reader'}).catch(()=>({status:0}));invited=x.status===200;await new Promise(resolve=>setTimeout(resolve,30));}
  if(registered&&invited){const x=await call('/api/member/delete',token(id),{confirm:'DELETE MY ACCOUNT'}).catch(()=>({status:0}));console.log('qa_profile_delete_http',x.status);}
  if(invited){const x=await call('/api/admin/roles',ownerToken,{userId:id,role:'revoke'}).catch(()=>({status:0}));console.log('qa_role_revoke_http',x.status);}
 }
}
