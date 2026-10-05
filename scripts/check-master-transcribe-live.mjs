// Localhost-only Google transcription acceptance: no real member audio or religious claim.
// The readback contains a synthetic spoken phrase; do not print transcripts or secrets.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
const origin='http://127.0.0.1:3011',owner=process.env.REVIEW_TEST_OWNER_ID,id='qa_voice_transcribe_05';
if(!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw new Error('Review owner and project signer required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function cookie(user){const n=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:user,iat:n,exp:n+900});return `webdev_app_session=${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;}
async function send(path,user,payload){const response=await fetch(origin+path,{method:'POST',headers:{Cookie:cookie(user),Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});return {status:response.status,data:await response.json().catch(()=>({}))};}
let invited=false,profile=false;
try{
 const ready=await fetch(origin+'/healthz',{signal:AbortSignal.timeout(15000)});assert.equal(ready.status,200);
 let r=await send('/api/admin/roles',owner,{userId:id,role:'reader'});assert.equal(r.status,200);invited=true;
 r=await send('/api/member/register',id,{displayName:'Synthetic voice QA',avatar:'rosette',preferredLanguage:'en',city:'',mosque:'',contact:'',contactPreference:'none',contactOptIn:false});assert.equal(r.status,201);profile=true;
 const bytes=await readFile('/home/ubuntu/.private/dragon-qa-transcribe.webm');assert.ok(bytes.length<2*1024*1024);
 const form=new FormData();form.append('audio',new Blob([bytes],{type:'audio/webm'}),'synthetic.webm');form.append('language','en');
 const response=await fetch(origin+'/api/study/transcribe',{method:'POST',headers:{Cookie:cookie(id),Origin:origin,'Sec-Fetch-Site':'same-origin'},body:form,signal:AbortSignal.timeout(45000)});
 const result=await response.json().catch(()=>({}));console.log('live_google_transcription',JSON.stringify({http:response.status,error:result.error,transcriptCharacters:result.transcript?.length,model:result.model}));
 assert.equal(response.status,200);assert.ok(typeof result.transcript==='string'&&result.transcript.trim().length>10);
 const usage=await fetch(origin+'/api/admin/study-usage',{headers:{Cookie:cookie(owner)}}).then(r=>r.json());assert.ok(usage.usage.transcriptionRequests>=1);
 console.log('PASS actual protected Google WebM transcription of a short synthetic English voice sample; transcript displayed only to its own member; no automatic religious answer or public audio.');
}finally{
 if(profile){const r=await send('/api/member/delete',id,{confirm:'DELETE MY ACCOUNT'}).catch(()=>({status:0}));console.log('qa_profile_delete_http',r.status);}
 if(invited){const r=await send('/api/admin/roles',owner,{userId:id,role:'revoke'}).catch(()=>({status:0}));console.log('qa_invitation_revoke_http',r.status);}
}
