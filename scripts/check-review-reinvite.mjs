// Review-only integration test: one synthetic identity, two authorized invitation cycles.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {database,closeDatabase} from '../server/db.mjs';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw Error('Private review credentials and owner test ID required');
const id='qa_reinvite_'+randomBytes(7).toString('hex'),base='http://127.0.0.1:3000';
function token(user){const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);const value=enc({alg:'HS256',typ:'JWT'})+'.'+enc({appId:process.env.MANUS_PROJECT_ID,openId:user,iat:now,exp:now+900});return value+'.'+createHmac('sha256',process.env.MANUS_JWT_SECRET).update(value).digest('base64url');}
async function request(path,user,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:'webdev_app_session='+token(user),...(body?{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});return {status:response.status,data:(response.headers.get('content-type')||'').includes('json')?await response.json():await response.text()};}
const data={displayName:'QA repeat-deletion fixture',avatar:'none',preferredLanguage:'en',city:'',mosque:'',contact:'',contactPreference:'none',contactOptIn:false};
try{
 for(let cycle=1;cycle<=2;cycle++){
  assert.equal((await request('/api/admin/roles',owner,{userId:id,role:'reader'})).status,200,'owner invitation');
  assert.equal((await request('/api/member/register',id,data)).status,201,'repeat verified signup');
  assert.equal((await request('/api/member/delete',id,{confirm:'DELETE MY ACCOUNT'})).status,200,'repeat deletion');
  assert.equal((await request('/member',id)).status,403,'deleted invitation disabled');
 }
 const hash=createHmac('sha256',process.env.MANUS_JWT_SECRET).update('dragon-dawwa/member-deletion/v1\0').update(id).digest('hex');
 const db=database();
 const count=await db.prepare('SELECT COUNT(*) AS n FROM member_deletion_audit WHERE subject_hash=?').bind(hash).first();
 assert.equal(Number(count.n),2,'both keyed pseudonymous events preserved');
 for(const table of ['member_profiles','member_saves','member_progress'])assert.equal(Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).bind(id).first()).n),0,table+' still has rows');
 console.log('PASS managed MySQL: synthetic reader invited, registered and deleted twice; both pseudonymous audits retained, owned rows absent and invite denied after each deletion.');
}finally{
 try{await request('/api/admin/roles',owner,{userId:id,role:'revoke'});}catch{/* errors remain visible above */}
 await closeDatabase();
}
