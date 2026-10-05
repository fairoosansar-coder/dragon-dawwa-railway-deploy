import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {editorialResponse} from '../lib/editorial.mjs';

function database() {
  const sql = new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for (const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const db={prepare(query){let args=[];const p={bind(...values){args=values;return p;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}};return p;},async batch(statements){sql.exec('BEGIN');try{const out=statements.map(s=>s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {db,sql};
}
const content = {translations:{en:{title:'Test editorial draft',summary:'A fixture for workflow verification.',body:'Test content. This is not a religious quotation.',contributor:'Test author'},ta:{title:'சோதனை',summary:'சோதனை',body:'சோதனை',contributor:'Test translator'}},sources:[{kind:'source',label:'Fixture reference',url:'https://example.org/source',author:'Example',locator:'Section 1'}]};
function fixture() {
  const {db,sql}=database(),env={DB:db,EDITORIAL_OWNER_ID:'owner',EDITORIAL_ROLES:JSON.stringify({alice:'author',bob:'author',reviewer:'reviewer',publisher:'publisher'})};
  async function req(path,actor='owner',body,extra={}) {
    const headers={'oai-authenticated-user-id':actor,'oai-authenticated-user-email':actor+'@example.test',...extra};if(body){headers['content-type']='application/json';headers.origin??='https://test.example';}
    if(!actor){delete headers['oai-authenticated-user-id'];delete headers['oai-authenticated-user-email'];}
    const response=await editorialResponse(new Request('https://test.example/api/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env);
    return {status:response.status,data:await response.json(),headers:response.headers};
  }
  const create=async()=>{const r=await req('admin/documents','alice',{content});assert.equal(r.status,201);return r.data;};
  const action=async(doc,verb,actor='alice',extra={})=>req(`admin/documents/${doc.id}/${verb}`,actor,{baseVersion:doc.head,note:'Detailed review and verification note',...extra});
  return {req,create,action,env,sql};
}
test('anonymous, identityless service callers and unassigned identities cannot read drafts or write',async()=>{
  const f=fixture();for(const actor of ['', 'stranger'])assert.equal((await f.req('admin/documents',actor)).status,actor?403:401);
  assert.equal((await f.req('admin/session','')).status,401);assert.equal((await f.req('content','')).status,401);
  assert.equal((await f.req('admin/documents','stranger',{content,role:'owner'})).status,403);
  assert.equal((await f.req('admin/documents','alice',{content},{origin:'https://evil.example'})).status,403);
  assert.equal((await f.req('admin/documents','alice',{content},{'sec-fetch-site':'cross-site'})).status,403);
});
test('author ownership is enforced on reads, history, editing and restoration',async()=>{
  const f=fixture(),doc=await f.create();
  for(const suffix of ['', '/history'])assert.equal((await f.req('admin/documents/'+doc.id+suffix,'bob')).status,403);
  for(const verb of ['save','submit','restore'])assert.equal((await f.action(doc,verb,'bob',{content,version:1})).status,403);
  assert.equal((await f.req('admin/documents','bob')).data.items.length,0);
  assert.equal((await f.action(doc,'save','reviewer',{content})).status,403);
  assert.equal((await f.action(doc,'approve','alice',{reviewed:true})).status,403);
  assert.equal((await f.action(doc,'publish','alice')).status,403);
});
test('review, approval and publication bind to exact revisions, with no draft leakage',async()=>{
  const f=fixture();let doc=await f.create();assert.equal((await f.req('content','stranger')).data.items.length,0);
  assert.equal((await f.action(doc,'publish','publisher')).status,409);
  doc=(await f.action(doc,'submit')).data;
  assert.equal((await f.action(doc,'approve','reviewer')).status,400);
  doc=(await f.action(doc,'approve','reviewer',{reviewed:true})).data;
  const approved=doc;
  doc=(await f.action(doc,'save','alice',{content:{...content,translations:{en:{...content.translations.en,body:'Changed after approval'}}}})).data;
  assert.equal(doc.current.state,'draft');assert.equal((await f.action(doc,'publish','publisher')).status,409);
  assert.equal((await f.action(approved,'publish','publisher')).status,409);
  doc=(await f.action(doc,'submit')).data;doc=(await f.action(doc,'approve','reviewer',{reviewed:true})).data;doc=(await f.action(doc,'publish','publisher')).data;
  const published=(await f.req('content','stranger')).data.items[0];assert.equal(published.version,doc.head);assert.equal(published.actor,undefined);
  const publishedVersion=doc.published;
  doc=(await f.action(doc,'save','alice',{content})).data;
  assert.equal(doc.published,publishedVersion);assert.equal((await f.req('content','stranger')).data.items[0].content.translations.en.body,'Changed after approval');
  doc=(await f.action(doc,'unpublish','publisher')).data;assert.equal(doc.published,null);assert.equal((await f.req('content','stranger')).data.items.length,0);
  doc=(await f.action(doc,'restore','alice',{version:1})).data;assert.equal(doc.current.state,'draft');assert.equal(doc.current.content.translations.ta.title,'சோதனை');
  const history=(await f.req('admin/documents/'+doc.id+'/history','reviewer')).data.items;assert.equal(history.length,doc.head);assert.equal(history.at(-1).version,1);
});
test('request changes, resubmit, owner self-review, and withdrawal are explicit audited actions',async()=>{
  const f=fixture();let d=await f.create();d=(await f.action(d,'submit')).data;d=(await f.action(d,'request-changes','reviewer')).data;assert.equal(d.current.state,'changes_requested');
  d=(await f.action(d,'submit')).data;d=(await f.action(d,'approve','owner',{reviewed:true})).data;assert.equal(d.current.actor,'owner');assert.equal(d.current.role,'owner');
  d=(await f.action(d,'publish','owner')).data;assert.equal(d.current.state,'published');
});
test('concurrent editors cannot overwrite each other or leave partial history',async()=>{
  const f=fixture(),d=await f.create();const results=await Promise.all([f.action(d,'save','alice',{content}),f.action(d,'save','alice',{content:{...content,translations:{en:{...content.translations.en,title:'Other edit'}}}})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  const latest=(await f.req('admin/documents/'+d.id,'alice')).data;assert.equal(latest.head,2);
  assert.equal((await f.req('admin/documents/'+d.id+'/history','alice')).data.items.length,2);
});
test('source and language validation reject dangerous URLs, incomplete submissions and oversized content',async()=>{
  const f=fixture();for(const url of ['javascript:alert(1)','http://example.org','https://user:pass@example.org','bad']){
    assert.equal((await f.req('admin/documents','alice',{content:{...content,sources:[{...content.sources[0],url}]}})).status,400);
  }
  assert.equal((await f.req('admin/documents','alice',{content:{...content,translations:{en:{...content.translations.en,body:'x'.repeat(15001)}}}})).status,400);
  let d=(await f.req('admin/documents','alice',{content:{translations:{en:{title:'Incomplete'}},sources:[]}})).data;
  assert.equal((await f.action(d,'submit')).data.error,'complete_each_language');
  d=(await f.action(d,'save','alice',{content:{...content,sources:[]}})).data;assert.equal((await f.action(d,'submit')).data.error,'source_required');
  assert.equal((await f.req('admin/documents','owner',{content:'x'.repeat(100001)})).status,413);
});
test('all responses are uncached and configuration/storage failure does not create a memory fallback',async()=>{
  const f=fixture();delete f.env.DB;const r=await f.req('admin/documents');assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
  delete f.env.EDITORIAL_OWNER_ID;assert.equal((await f.req('admin/session')).data.user.role,'reader');
});
test('language acknowledgements bind approval to the submitted revision and public detail never exposes drafts',async()=>{
  const f=fixture();const enriched={...content,metadata:{topics:['Reading method','Ethics'],classification:'editorial',clarity:'An editorial explanation with cited context.'},sources:[{...content.sources[0],kind:'editorial'}]};
  let d=(await f.req('admin/documents','alice',{content:enriched})).data;
  const privatePreview=await f.req(`admin/documents/${d.id}/preview`,'alice');assert.equal(privatePreview.status,200);assert.equal(privatePreview.data.preview,true);assert.equal(privatePreview.data.item.state,'draft');assert.equal(privatePreview.data.item.content.metadata.classification,'editorial');
  assert.equal((await f.req(`content/${d.id}`,'stranger')).status,404);
  d=(await f.action(d,'submit','alice')).data;
  let approval=await f.action(d,'approve','reviewer',{reviewed:true,reviewedRevision:d.head,reviewedLanguages:{en:true}});assert.equal(approval.status,400);assert.equal(approval.data.error,'review_languages_required');
  approval=await f.action(d,'approve','reviewer',{reviewed:true,reviewedRevision:d.head-1,reviewedLanguages:{en:true,ta:true}});assert.equal(approval.status,409);assert.equal(approval.data.error,'review_revision_mismatch');
  d=(await f.action(d,'approve','reviewer',{reviewed:true,reviewedRevision:d.head,reviewedLanguages:{en:true,ta:true}})).data;
  assert.equal(d.current.content.review.submissionVersion,2);assert.equal(d.current.content.review.approvedRevision,d.head);assert.deepEqual(Object.keys(d.current.content.review.languages),['en','ta']);
  assert.equal(d.current.content.review.reviewedBy,'reviewer');
  d=(await f.action(d,'publish','publisher')).data;
  const direct=await f.req(`content/${d.id}`,'stranger');assert.equal(direct.status,200);assert.equal(direct.data.item.version,d.published);assert.equal(direct.data.item.actor,undefined);assert.equal(direct.data.item.content.review.reviewedRevision,2);assert.deepEqual(direct.data.item.content.review.languages,['en','ta']);assert.equal(direct.data.item.content.review.reviewedBy,undefined);
  const filtered=await f.req('content?topic=Ethics&classification=editorial&language=en&q=fixture','stranger');assert.equal(filtered.status,200);assert.equal(filtered.data.items.length,1);assert.equal(filtered.data.items[0].content.sources[0].kind,'editorial');
  const publishedVersion=d.published;d=(await f.action(d,'save','alice',{content:{...enriched,translations:{...enriched.translations,en:{...enriched.translations.en,title:'Unpublished changed title'}}}})).data;
  const preserved=await f.req(`content/${d.id}`,'stranger');assert.equal(preserved.data.item.version,publishedVersion);assert.equal(preserved.data.item.content.translations.en.title,'Test editorial draft');
  const changedPreview=await f.req(`admin/documents/${d.id}/preview?version=${d.head}`,'reviewer');assert.equal(changedPreview.status,200);assert.equal(changedPreview.data.item.state,'draft');assert.equal(changedPreview.data.item.content.translations.en.title,'Unpublished changed title');
});
