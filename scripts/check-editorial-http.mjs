// Runs only against a loopback built Worker and its local D1, never the hosted Site.
import assert from 'node:assert/strict';
const base=process.env.EDITORIAL_TEST_URL||'http://127.0.0.1:8789';
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Local D1 integration test requires loopback');
async function request(path,role='local_author',body) {
  const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':role,'oai-authenticated-user-email':role+'@example.test',origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json()};
}
const content={translations:{en:{title:'LOCAL QA FIXTURE — not community content',summary:'Local persistence check',body:'A disposable verification fixture. No religious or community claims.',contributor:'Automated local test'},ta:{title:'சோதனை',summary:'சோதனை',body:'சோதனை',contributor:'Automated local test'},si:{title:'පරීක්ෂණය',summary:'පරීක්ෂණය',body:'පරීක්ෂණය',contributor:'Automated local test'}},sources:[{kind:'source',label:'Example reference',url:'https://example.org',author:'Test fixture',locator:'Test'}]};
let r=await request('admin/documents','local_author',{content});assert.equal(r.status,201,JSON.stringify(r.data));let doc=r.data;
async function act(action,role,extra={}) { const r=await request(`admin/documents/${doc.id}/${action}`,role,{baseVersion:doc.head,note:'Automated local workflow verification only',...extra});if(r.status===200)doc=r.data;return r; }
assert.equal((await act('publish','local_author')).status,403);
assert.equal((await act('publish','local_publisher')).status,409);
assert.equal((await act('submit','local_author')).status,200);
assert.equal((await act('approve','local_reviewer',{reviewed:true})).status,200);
assert.equal((await act('publish','local_publisher')).status,200);
let published=(await request('content','test_reader')).data.items.find(x=>x.id===doc.id);assert.equal(published.version,doc.head);
const publishedVersion=doc.head;
assert.equal((await act('save','local_author',{content:{...content,translations:{en:{...content.translations.en,title:'LOCAL QA newer unpublished draft'}}}})).status,200);
published=(await request('content','test_reader')).data.items.find(x=>x.id===doc.id);assert.equal(published.version,publishedVersion);assert.match(published.content.translations.en.title,/FIXTURE/);
assert.equal((await act('publish','local_publisher')).status,409);
assert.equal((await act('unpublish','local_publisher')).status,200);
assert.equal((await request('content','test_reader')).data.items.some(x=>x.id===doc.id),false);
assert.equal((await request('admin/documents','test_reader')).status,403);
const latest=await request('admin/documents/'+doc.id,'local_author');assert.equal(latest.data.head,doc.head);
const history=await request('admin/documents/'+doc.id+'/history','local_reviewer');assert.equal(history.data.items.length,doc.head);
console.log('PASS: real local Worker + D1 create/review/approve/publish/edit/withdraw/history/permissions; fixture '+doc.id);
