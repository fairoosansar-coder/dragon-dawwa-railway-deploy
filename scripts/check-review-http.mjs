// Operator-only local integration test: synthetic signed identities are never a production login method.
// Requires REVIEW_TEST_OWNER_ID and the project-injected MANUS_JWT_SECRET/MANUS_PROJECT_ID.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const origin = process.env.REVIEW_PUBLIC_ORIGIN;
const userId = process.env.REVIEW_TEST_OWNER_ID;
const base = 'http://127.0.0.1:3000';
if (!origin?.startsWith('https://') || !userId || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID)
  throw new Error('Review origin, verified owner ID and managed project credentials are required');
function jwt(id) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({alg:'HS256',typ:'JWT'}) + '.' + encode({appId:process.env.MANUS_PROJECT_ID,openId:id,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600});
  return unsigned + '.' + createHmac('sha256',process.env.MANUS_JWT_SECRET).update(unsigned).digest('base64url');
}
async function send(path, { actor = userId, method = 'GET', body } = {}) {
  const headers = { cookie: `webdev_app_session=${jwt(actor)}`, origin };
  if (body) headers['Content-Type'] = 'application/json';
  const result = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect:'manual' });
  const content = result.headers.get('content-type')?.includes('json') ? await result.json() : await result.text();
  return { status: result.status, content };
}
const anon = await fetch(base + '/api/admin/events');
assert.equal(anon.status, 401);
assert.equal((await send('/api/review/session')).content.user.role, 'owner');
assert.equal((await send('/api/admin/events', {actor:'unassigned_test_account'})).status, 403);
const event = {title:'LOCAL QA FIXTURE — Not a community event',description:'Integration test only; no actual meeting exists.',language:'en',timezone:'Asia/Colombo',startsAt:'2030-07-01T12:00:00+05:30',location:'Test-only non-venue',speaker:null,resourceUrl:null};
let created = await send('/api/admin/events', {method:'POST',body:{action:'create',event}});
assert.equal(created.status, 201, JSON.stringify(created.content));
const id = created.content.id;
try {
  let listed = await send('/api/events');
  assert.equal(listed.content.items.some(item=>item.id===id),false);
  assert.equal((await send(`/api/admin/events/${id}/publish`, {actor:'unassigned_test_account',method:'POST',body:{baseVersion:1}})).status,403);
  let published = await send(`/api/admin/events/${id}/publish`, {method:'POST',body:{baseVersion:1}});
  assert.equal(published.status,200,JSON.stringify(published.content));
  assert.equal((await send('/api/events')).content.items.some(item=>item.id===id),true);
  const stale = await send(`/api/admin/events/${id}/save`, {method:'POST',body:{baseVersion:1,event}});
  assert.equal(stale.status,409);
  const cancelled = await send(`/api/admin/events/${id}/cancel`, {method:'POST',body:{baseVersion:published.content.head}});
  assert.equal(cancelled.status,200,JSON.stringify(cancelled.content));
  assert.equal((await send('/api/events')).content.items.some(item=>item.id===id),false);
  const before = await send('/api/admin/submissions');
  assert.equal(before.status,200);
  const received = await send('/api/participation', {method:'POST',body:{purpose:'inquiry',contactPreference:'none',details:'LOCAL QA FIXTURE — stored only, no message sent.',website:''}});
  assert.equal(received.status,201,JSON.stringify(received.content));
  assert.equal(received.content.status,'stored_for_review');
  const after = await send('/api/admin/submissions');
  const submission = after.content.items.find(x=>x.details?.includes('LOCAL QA FIXTURE'));
  assert.ok(submission);
  assert.equal((await send('/api/admin/submissions',{actor:'unassigned_test_account'})).status,403);
  const deleted = await send(`/api/admin/submissions/${submission.id}/delete`,{method:'POST'});
  assert.equal(deleted.status,200);
  const tombstone = (await send('/api/admin/submissions')).content.items.find(x=>x.id===submission.id);
  assert.equal(tombstone.deleted,true);
  assert.equal('details' in tombstone,false);
  console.log('PASS local managed-DB HTTP: private gate, verified owner, unauthorized role, event create/publish/conflict/cancel, submission restricted/store/redact. All fixtures removed from visitor views.');
} catch (error) {
  // Best-effort removal if a check fails after publishing; do not leave a fake event visitor-visible.
  const current = await send(`/api/admin/events/${id}`);
  if (current.status === 200 && !current.content.cancelledAt) await send(`/api/admin/events/${id}/cancel`,{method:'POST',body:{baseVersion:current.content.head}});
  throw error;
}
