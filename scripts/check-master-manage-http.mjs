// Operator-only synthetic management QA. Produces an archived test resource and rejected
// correction with audit history, but no visitor-visible resource or applied overlay.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {closeDatabase} from '../server/db.mjs';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw new Error('Private owner test configuration required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),n=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,iat:n,exp:n+900}),cookie=`webdev_app_session=${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
async function call(path,payload){const post=payload!==undefined,r=await fetch(origin+path,{method:post?'POST':'GET',headers:{Cookie:cookie,...(post?{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}:{})},body:post?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json().catch(()=>({}))};}
let resourceId,resourceVersion,correctionId,correctionVersion;
try{
 let r=await call('/api/admin/dashboard');assert.equal(r.status,200);
 const title='SYNTHETIC QA unpublished resource '+Date.now();
 const base={title,publisher:'Synthetic QA — not a source endorsement',publisherUrl:'https://quran.com/',url:'https://quran.com/',summary:'Marked nonreligious test record. Never publish this.',category:'Finding source references',languages:['English'],format:'link',rightsNote:'Synthetic QA; no content copied and no public claim.',lastCheckedOn:new Date().toISOString().slice(0,10),linkStatus:'unchecked',reviewState:'draft',status:'active'};
 r=await call('/api/admin/resources',{resource:base});assert.equal(r.status,201,JSON.stringify(r.data));resourceId=r.data.resource.recordId;resourceVersion=r.data.version;assert.ok(resourceId);
 r=await call('/api/resources?q='+encodeURIComponent(title));assert.equal(r.status,200);assert.ok(!r.data.items.some(x=>x.recordId===resourceId),'draft absent from visitor catalogue');
 r=await call('/api/admin/resources/'+resourceId,{action:'save',baseVersion:resourceVersion,resource:{...base,summary:'Synthetic edited QA summary; still unpublished.'}});assert.equal(r.status,200,JSON.stringify(r.data));resourceVersion=r.data.version;assert.equal(r.data.resource.reviewState,'draft');
 r=await call('/api/admin/resources/'+resourceId,{action:'archive',baseVersion:resourceVersion,confirm:'ARCHIVE RESOURCE'});assert.equal(r.status,200,JSON.stringify(r.data));resourceVersion=r.data.version;assert.equal(r.data.resource.status,'archived');
 r=await call('/api/admin/resources/'+resourceId+'/history');assert.equal(r.status,200);assert.ok(r.data.items.length>=3);
 r=await call('/api/admin/mosque-corrections',{directoryEntry:97,proposal:{city:'Synthetic QA correction — not a factual claim'},evidenceUrl:'https://muslimaffairs.gov.lk/wp-content/uploads/2023/12/ANURADHAPURA-DISTRICT.pdf',evidenceNote:'Synthetic internal rejection workflow; do not apply or display.'});assert.equal(r.status,201,JSON.stringify(r.data));correctionId=r.data.correction.id;correctionVersion=r.data.version;
 r=await call('/api/admin/mosque-corrections/'+correctionId+'/review',{baseVersion:correctionVersion,decision:'rejected'});assert.equal(r.status,200,JSON.stringify(r.data));correctionVersion=r.data.version;assert.equal(r.data.correction.state,'rejected');
 r=await call('/api/mosques');assert.equal(r.status,200);assert.equal(r.data.items.length,108);assert.ok(!r.data.items.some(x=>x.correction?.correctionId===correctionId));
 r=await call('/api/admin/settings/retention/dry-run');assert.equal(r.status,200);
 console.log('PASS actual managed MySQL/HTTPS owner workflows: dashboard, unpublished draft create/edit/archive+three revisions, official-row correction propose/reject, 108 government rows unchanged, count-only retention dry run; no visitor fixture.');
}finally{
 if(resourceId){const r=await call('/api/admin/resources/'+resourceId);if(r.status===200&&r.data.resource?.status!=='archived')await call('/api/admin/resources/'+resourceId,{action:'archive',baseVersion:r.data.version,confirm:'ARCHIVE RESOURCE'});}
 if(correctionId){const r=await call('/api/admin/mosque-corrections/'+correctionId);if(r.status===200&&r.data.correction?.state==='proposed')await call('/api/admin/mosque-corrections/'+correctionId+'/review',{baseVersion:r.data.version,decision:'rejected'});}
 await closeDatabase();
}
