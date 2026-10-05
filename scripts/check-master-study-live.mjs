// Bounded operator-only acceptance. Synthetic invited identity; source quotes, generated religious
// paragraphs and credentials are never printed. Requires a running private QA canary server.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const origin=process.env.REVIEW_PUBLIC_ORIGIN;
const owner=process.env.REVIEW_TEST_OWNER_ID;
const reader='qa_study_master_05';
if (!origin?.startsWith('https://') || !owner || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID)
  throw new Error('Private Preview, known owner and project-supplied session signer required.');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=id=>{const now=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:id,iat:now,exp:now+900});return `${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;};
async function send(path,actor,payload,method='POST'){
  const headers={Cookie:`webdev_app_session=${token(actor)}`,...(method==='POST'?{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}:{})};
  const timeout=path==='/api/study/generate'?90_000:path==='/api/study/narrate'?45_000:15_000;
  const response=await fetch(origin+path,{method:method==='GET'?'GET':'POST',headers,body:method==='GET'?undefined:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(timeout)});
  const data=response.headers.get('content-type')?.includes('json')?await response.json():null;
  return {status:response.status,data,headers:response.headers};
}
let invited=false, registered=false, answerId=null, audioUrl=null;
try {
  const ownerStatus=await send('/api/review/session',owner,undefined,'GET');
  assert.equal(ownerStatus.data?.user?.role,'owner');
  const invitedResult=await send('/api/admin/roles',owner,{userId:reader,role:'reader'});
  assert.equal(invitedResult.status,200,`invite ${invitedResult.data?.error||''}`);invited=true;
  const profile=await send('/api/member/register',reader,{displayName:'Synthetic study QA',avatar:'rosette',preferredLanguage:'en',city:'',mosque:'',contact:'',contactPreference:'none',contactOptIn:false});
  assert.equal(profile.status,201,`register ${profile.data?.error||''}`);registered=true;
  const generated=await send('/api/study/generate',reader,{question:'What do the named sources say about the first verse of al-Fatihah?',verse:'1:1',language:'en',saveHistory:false});
  console.log('live_generation',JSON.stringify({http:generated.status,error:generated.data?.error,sourceCount:generated.data?.sources?.length,paragraphCount:generated.data?.paragraphs?.length}));
  assert.equal(generated.status,201,`grounded answer ${generated.data?.error||''}`);
  assert.ok(Array.isArray(generated.data.sources)&&generated.data.sources.length>=3);
  assert.ok(generated.data.sources.every(item=>item.id&&item.title&&item.quote&&item.url));
  assert.match(generated.data.disclosure,/AI-generated study explanation/);
  answerId=generated.data.id;
  const evidence=generated.data.sources[0];
  const follow=await send(`/api/study/evidence/${encodeURIComponent(answerId)}/${encodeURIComponent(evidence.id)}`,reader,undefined,'GET');
  assert.equal(follow.status,200,'stored citation must resolve privately');
  assert.equal(follow.data?.source?.quote,evidence.quote);
  const history=await send('/api/study/history',reader,undefined,'GET');
  assert.equal(history.status,200);assert.equal(history.data.items.some(x=>x.id===answerId),false,'unchecked history must not list the response');
  const flagged=await send('/api/study/report',reader,{responseId:answerId,reason:'citation',details:'Synthetic source follow-up test only.'});
  assert.equal(flagged.status,201,`report ${flagged.data?.error||''}`);
  const reports=await send('/api/admin/study-reports?status=open',owner,undefined,'GET');
  assert.equal(reports.status,200);const item=reports.data?.items?.find(x=>x.responseId===answerId);assert.ok(item);
  const resolved=await send(`/api/admin/study-reports/${encodeURIComponent(item.id)}`,owner,{action:'resolve'});
  assert.equal(resolved.status,200,`report triage ${resolved.data?.error||''}`);
  const narrated=await send('/api/study/narrate',reader,{responseId:answerId});
  console.log('live_narration',JSON.stringify({http:narrated.status,error:narrated.data?.error,state:narrated.data?.status}));
  assert.equal(narrated.status,200,`private narration ${narrated.data?.error||''}`);
  assert.equal(narrated.data?.status,'ready');audioUrl=narrated.data.audioUrl;
  assert.ok(/^\/api\/study\/audio\/[A-Za-z0-9-]+$/.test(audioUrl));
  const audio=await fetch(origin+audioUrl,{headers:{Cookie:`webdev_app_session=${token(reader)}`},signal:AbortSignal.timeout(12000)});
  const wave=Buffer.from(await audio.arrayBuffer());
  assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/wav');
  assert.ok(wave.length>44&&wave.subarray(0,4).toString('ascii')==='RIFF'&&wave.subarray(8,12).toString('ascii')==='WAVE');
  const replay=await send('/api/study/narrate',reader,{responseId:answerId});
  assert.equal(replay.status,200);assert.equal(replay.data.audioUrl,audioUrl,'identical narration should reuse durable private audio without another Google call');
  const usage=await send('/api/admin/study-usage',owner,undefined,'GET');
  assert.equal(usage.status,200);
  assert.ok(usage.data.usage.studyRequests>=1&&usage.data.usage.speechRequests>=1);
  console.log('PASS private hosted source-grounded explanation, three named exact fetched evidence quotes, separately disclosed AI prose, persisted private evidence, opt-out history, member report/owner triage audit, durable RIFF/WAV with idempotent replay, owner usage counters. Audio bytes:',wave.length);
} finally {
  if(registered){const gone=await send('/api/member/delete',reader,{confirm:'DELETE MY ACCOUNT'}).catch(()=>({status:0}));console.log('qa_profile_delete_http',gone.status);}
  if(invited){const revoked=await send('/api/admin/roles',owner,{userId:reader,role:'revoke'}).catch(()=>({status:0}));console.log('qa_invitation_revoke_http',revoked.status);}
  if(answerId){const blocked=await send(`/api/study/evidence/${encodeURIComponent(answerId)}/${encodeURIComponent('quran:ar-uthmani-hafs:1:1')}`,reader,undefined,'GET').catch(()=>({status:0}));console.log('qa_study_after_delete_http',blocked.status);}
}
