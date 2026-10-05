// Isolated review-database QA. Synthetic JWTs are minted only by an operator with the
// development signing secret; this is not hosted OAuth or a production login substitute.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { database, closeDatabase } from '../server/db.mjs';

const origin = process.env.REVIEW_PUBLIC_ORIGIN;
const owner = process.env.REVIEW_TEST_OWNER_ID;
const base = 'http://127.0.0.1:3000';
if (!origin?.startsWith('https://') || !owner || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID) throw new Error('Set the explicit review origin and verified owner ID.');
const accounts = { author:'qa_author_'+Date.now(), reviewer:'qa_reviewer_'+Date.now(), publisher:'qa_publisher_'+Date.now() };
function token(id) {
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = encode({alg:'HS256',typ:'JWT'}) + '.' + encode({appId:process.env.MANUS_PROJECT_ID,openId:id,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600});
  return data + '.' + createHmac('sha256',process.env.MANUS_JWT_SECRET).update(data).digest('base64url');
}
async function call(path, actor, input, withOrigin = true) {
  const response = await fetch(base + path, {method:input ? 'POST' : 'GET',redirect:'manual',headers:{cookie:`webdev_app_session=${token(actor)}`,...(withOrigin?{origin}:{}),...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined});
  const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return {status:response.status,data};
}
let doc;
const db = database();
try {
  for (const [role, id] of Object.entries(accounts)) await db.prepare('INSERT INTO review_roles (user_id,role,disabled,updated_at,updated_by) VALUES (?,?,?,?,?)').bind(id,role,0,new Date().toISOString(),'local_qa_fixture').run();
  const fixture = {translations:{en:{title:'LOCAL QA FIXTURE — not community content',summary:'Nonreligious integration test',body:'This test passage asserts no religious or community fact.',contributor:'Automated local QA'},ta:{title:'சோதனை மட்டும்',summary:'சோதனை மட்டும்',body:'சோதனை மட்டும்',contributor:'Automated local QA'},si:{title:'පරීක්ෂණය පමණයි',summary:'පරීක්ෂණය පමණයි',body:'පරීක්ෂණය පමණයි',contributor:'Automated local QA'}},sources:[{kind:'editorial',label:'Test reference only',url:'https://example.org/test',author:'Automated test',locator:'fixture'}],metadata:{topics:['Local QA'],classification:'editorial',clarity:'No scholarly review'}};
  const create = await call('/api/admin/documents',accounts.author,{content:fixture});
  assert.equal(create.status,201,JSON.stringify(create.data)); doc=create.data;
  const id=doc.id;
  assert.equal((await call(`/api/content/${id}`,owner)).status,404);
  assert.equal((await call(`/api/admin/documents/${id}`,accounts.author)).data.head,1); // persistence after a distinct HTTP request
  assert.equal((await call(`/api/admin/documents/${id}/preview`,accounts.author)).status,200);
  async function step(action,who,extra={}) { const r=await call(`/api/admin/documents/${id}/${action}`,who,{baseVersion:doc.head,note:'Local QA workflow only — nonreligious fixture',...extra});if(r.status===200)doc=r.data;return r; }
  assert.equal((await step('publish',accounts.author)).status,403);
  assert.equal((await step('submit',accounts.author)).status,200);
  assert.equal((await step('request-changes',accounts.reviewer)).status,200);
  assert.equal((await step('save',accounts.author,{content:fixture})).status,200);
  assert.equal((await step('submit',accounts.author)).status,200);
  const submitted=doc.head;
  assert.equal((await step('approve',accounts.reviewer,{reviewed:true,reviewedRevision:submitted-1,reviewedLanguages:{en:true,ta:true,si:true}})).status,409);
  assert.equal((await step('approve',accounts.reviewer,{reviewed:true,reviewedRevision:submitted,reviewedLanguages:{en:true,ta:true}})).status,400);
  assert.equal((await step('approve',accounts.reviewer,{reviewed:true,reviewedRevision:submitted,reviewedLanguages:{en:true,ta:true,si:true}})).status,200);
  assert.equal(doc.current.content.review.submissionVersion,submitted);
  assert.equal((await step('publish',accounts.publisher)).status,200);
  const published=doc.head;
  assert.equal((await call(`/api/content/${id}`,owner)).data.item.version,published);
  assert.equal((await call('/api/content?topic=Local%20QA&language=ta',owner)).data.items.some(item=>item.id===id),true);
  assert.equal((await step('save',accounts.author,{content:{...fixture,translations:{...fixture.translations,en:{...fixture.translations.en,title:'LOCAL QA unreviewed changed title'}}}})).status,200);
  assert.equal((await call(`/api/content/${id}`,owner)).data.item.version,published);
  assert.equal((await step('publish',accounts.publisher)).status,409);
  assert.equal((await call('/api/admin/documents',accounts.author)).status,200);
  assert.equal((await call('/api/admin/documents',accounts.author,{content:fixture},false)).status,403); // CSRF/origin requirement
  assert.equal((await step('unpublish',accounts.publisher)).status,200);
  assert.equal((await call(`/api/content/${id}`,owner)).status,404);
  assert.equal((await call('/api/content',owner)).data.items.some(item=>item.id===id),false);
  assert.equal((await call(`/api/admin/documents/${id}/history`,accounts.reviewer)).data.items.length,doc.head);
  const revoked=await call('/api/admin/roles',owner,{userId:accounts.author,role:'revoke'});
  assert.equal(revoked.status,200);
  assert.equal((await call('/api/admin/documents',accounts.author)).status,403);
  console.log('PASS managed-DB HTTP editorial: draft persistence; revision-specific multilingual request-changes/approval; preview; publish; private-draft 404; edit isolation; withdrawal; role revocation; history; CSRF. Fixture remains audit-only.');
} catch (error) {
  if (doc?.published) await call(`/api/admin/documents/${doc.id}/unpublish`,owner,{baseVersion:doc.head,note:'Local QA failure cleanup'});
  throw error;
} finally {
  for (const id of Object.values(accounts)) await db.prepare('UPDATE review_roles SET disabled=1,updated_at=? WHERE user_id=?').bind(new Date().toISOString(),id).run();
  await closeDatabase();
}
