// Operator-only live canary; two model requests, no audio, no history and no source quotations printed.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID,reader=process.env.REVIEW_TEST_READER_ID||'qa_study_master_05';
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET)throw new Error('Private Preview, owner and project signer required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function cookie(id){const n=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:id,iat:n,exp:n+900});return `webdev_app_session=${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;}
async function call(path,actor,payload){const r=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{Cookie:cookie(actor),...(payload===undefined?{}:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'})},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(path==='/api/study/generate'?90000:15000)});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():{}};}
let invited=false,registered=false;try{
  const grant=await call('/api/admin/roles',owner,{userId:reader,role:'reader'});assert.equal(grant.status,200);invited=true;
  const member=await call('/api/member/register',reader,{displayName:'Synthetic language QA',avatar:'rosette',preferredLanguage:'ta',city:'',mosque:'',contact:'',contactPreference:'none',contactOptIn:false});assert.equal(member.status,201);registered=true;
  const languages=[['ta',/\p{Script=Tamil}/u],['si',/\p{Script=Sinhala}/u]].filter(([language])=>!process.env.REVIEW_ONLY_LANGUAGE||process.env.REVIEW_ONLY_LANGUAGE===language);
  for(const [language,script] of languages){
    const result=await call('/api/study/generate',reader,{question:'',verse:'1:1',language,saveHistory:false});
    const paragraphs=result.data?.paragraphs||[],sourceCount=result.data?.sources?.length||0,scriptSeen=script.test(paragraphs.join(' '));
    console.log('live_language_result',JSON.stringify({language,http:result.status,error:result.data?.error,paragraphCount:paragraphs.length,sourceCount,languageScriptSeen:scriptSeen}));
    assert.equal(result.status,201,`${language} explanation ${result.data?.error||''}`);
    assert.equal(result.data.language,language);assert.ok(scriptSeen);assert.ok(sourceCount>=3);
    assert.ok(result.data.sources.every(item=>item.id&&item.title&&item.edition&&item.quote&&item.url));
  }
  const history=await call('/api/study/history',reader);assert.equal(history.status,200);assert.equal(history.data.items.length,0);
  console.log('PASS actual source-backed Gemini Tamil and Sinhala response generation, three named sources each, target-script presence and opt-out history; native-speaker accuracy not certified.');
}finally{
  if(registered){const r=await call('/api/member/delete',reader,{confirm:'DELETE MY ACCOUNT'}).catch(()=>({status:0}));console.log('qa_profile_delete_http',r.status);}
  if(invited){const r=await call('/api/admin/roles',owner,{userId:reader,role:'revoke'}).catch(()=>({status:0}));console.log('qa_invitation_revoke_http',r.status);}
}
