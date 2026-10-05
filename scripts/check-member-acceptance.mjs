// Isolated review-only acceptance. Synthetic user IDs and short-lived local signed QA
// cookies are never production identity substitutes. Requires the project-injected secrets.
import assert from 'node:assert/strict';
import {createHmac, randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {database, closeDatabase} from '../server/db.mjs';

const origin = process.env.REVIEW_PUBLIC_ORIGIN;
const owner = process.env.REVIEW_TEST_OWNER_ID;
const base = 'http://127.0.0.1:3000';
if (!origin?.startsWith('https://') || !owner || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID)
  throw new Error('Private review origin, owner ID and project-injected credentials are required');
const suffix = randomBytes(6).toString('hex');
const a = `qa_reader_${suffix}_a`, b = `qa_reader_${suffix}_b`;
const ids = [a, b];
function token(id) {
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({alg:'HS256',typ:'JWT'})}.${enc({appId:process.env.MANUS_PROJECT_ID,openId:id,iat:now,exp:now+900})}`;
  return `${unsigned}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(unsigned).digest('base64url')}`;
}
async function send(path, actor, body) {
  const response = await fetch(base+path, {
    method:body === undefined ? 'GET' : 'POST', redirect:'manual',
    headers:{cookie:`webdev_app_session=${token(actor)}`,...(body === undefined ? {} : {Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'})},
    body:body === undefined ? undefined : JSON.stringify(body),
    signal:AbortSignal.timeout(10000),
  });
  const type = response.headers.get('content-type') || '';
  return {status:response.status,data:type.includes('json') ? await response.json() : await response.text()};
}
async function context(browser, id) {
  const value = await browser.newContext({viewport:{width:390,height:844}});
  await value.addCookies([{name:'webdev_app_session',value:token(id),url:origin,httpOnly:true,secure:true,sameSite:'None'}]);
  return value;
}
async function noOverflow(page, label) {
  const widths = await page.evaluate(() => ({viewport:innerWidth,scroll:document.body.scrollWidth}));
  assert.ok(widths.scroll <= widths.viewport, `${label} overflow: ${JSON.stringify(widths)}`);
}
function profile(displayName) {
  return {displayName,avatar:'rosette',preferredLanguage:'si',city:'QA Fixture City',mosque:'',contact:'',contactPreference:'none',contactOptIn:false};
}
let browser;
const contexts = [];
try {
  assert.equal((await send('/api/review/session',owner)).data.user.role,'owner');
  for (const id of ids) assert.equal((await send('/api/admin/roles',owner,{userId:id,role:'reader'})).status,200);
  assert.equal((await send('/api/member/me',a)).data.registered,false);
  browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const first = await context(browser,a); contexts.push(first);
  const page = await first.newPage(); page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(20000);
  await page.goto(origin+'/member',{waitUntil:'domcontentloaded'});
  await noOverflow(page,'member signup');
  await page.locator('#show-registration').click();
  await page.locator('#profile-form [name=displayName]').fill('QA Member A — marked fixture');
  await page.locator('#profile-form [name=preferredLanguage]').selectOption('ta');
  await page.locator('#profile-submit').click();
  await page.locator('#member-content:visible').waitFor();
  assert.match(await page.locator('#status').getAttribute('class'),/success/);
  await page.locator('#edit-profile').click();
  await page.locator('#profile-form [name=displayName]').fill('QA Member A — edited fixture');
  await page.locator('#profile-form [name=city]').fill('QA Fixture City');
  await page.locator('#profile-submit').click();
  await page.waitForFunction(() => document.querySelector('#profile-summary')?.textContent?.includes('edited fixture'));
  assert.match(await page.locator('#profile-summary').innerText(),/edited fixture/);
  assert.equal((await send('/api/member/register',b,profile('QA Member B — marked fixture'))).status,201);

  await page.goto(origin+'/resources',{waitUntil:'domcontentloaded'});
  await page.locator('.resource-entry').first().waitFor();
  await noOverflow(page,'resources');
  assert.equal((await page.locator('.resource-entry').count()),6);
  const target = page.locator('.resource-entry').filter({hasText:'Quran in a Year'});
  const browserProfile = await page.evaluate(async () => {
    const response = await fetch('/api/member/me',{credentials:'same-origin'});
    return {status:response.status,registered:response.ok && (await response.json()).registered};
  });
  assert.deepEqual(browserProfile,{status:200,registered:true},'resource page must see the already registered member');
  const saveResponseWait = page.waitForResponse(response => response.url().endsWith('/api/member/save'),{timeout:8000}).catch(() => null);
  await target.locator('button').click();
  const saveResponse = await saveResponseWait;
  assert.ok(saveResponse,`resource button did not POST: page=${new URL(page.url()).pathname}`);
  assert.equal(saveResponse.status(),200,'member resource-save API response');
  await page.waitForFunction(() => [...document.querySelectorAll('.resource-entry')].some(card => card.textContent?.includes('Quran in a Year') && card.querySelector('.resource-feedback')?.textContent?.trim()));
  const stored = await send('/api/member/me',a);
  assert.equal(stored.status,200);
  assert.ok(stored.data.saves.some(item => item.kind === 'external' && item.id === 'quran-start'));
  assert.equal((await send('/api/member/save',a,{action:'add',kind:'external',id:'unverified-resource'})).status,400);

  const otherDevice = await context(browser,a); contexts.push(otherDevice);
  const second = await otherDevice.newPage(); second.setDefaultTimeout(12000); second.setDefaultNavigationTimeout(20000);
  await second.goto(origin+'/member',{waitUntil:'domcontentloaded'});
  await second.locator('#member-content:visible').waitFor();
  assert.match(await second.locator('#profile-summary').innerText(),/edited fixture/);
  await second.getByRole('link',{name:/Quran in a Year/}).waitFor({timeout:12000});
  assert.equal(await second.getByRole('link',{name:/Quran in a Year/}).getAttribute('href'),'https://quran.com/calendar');
  assert.equal(await second.locator('#language').inputValue(),'ta');
  await noOverflow(second,'member restored');

  // The real reader must persist the clicked verse to MySQL, not merely localStorage.
  await page.goto(origin+'/quran',{waitUntil:'domcontentloaded'});
  await page.locator('.verse-card').first().waitFor({timeout:40000});
  const verseKey = await page.locator('.verse-key').first().innerText();
  await page.locator('.save-place').first().click();
  await page.waitForFunction(() => !!document.querySelector('#place-sync-status')?.textContent?.trim(),{timeout:12000});
  const accountAfterReading = await send('/api/member/me',a);
  assert.equal(accountAfterReading.data.place?.key,verseKey,'reader save reached the account database');
  await second.goto(origin+'/quran',{waitUntil:'domcontentloaded'});
  await second.locator('.verse-card').first().waitFor({timeout:40000});
  assert.match(await second.locator('#resume-reading').innerText(),new RegExp(verseKey.replace(':','\\:')));
  assert.equal(await second.locator('#resume-reading').isVisible(),true);

  await second.goto(origin+'/member',{waitUntil:'domcontentloaded'});
  await second.evaluate(() => {
    localStorage.setItem('dd-saved',JSON.stringify(['ask','wisdom']));
    localStorage.setItem('dd-quran-place',JSON.stringify({chapter:2,page:1,key:'2:1'}));
    localStorage.setItem('dd-note','QA PRIVATE NOTE — NEVER UPLOAD');
    localStorage.setItem('dd-question','QA PRIVATE QUESTION — NEVER UPLOAD');
  });
  await second.reload({waitUntil:'domcontentloaded'});
  await second.locator('#member-content:visible').waitFor();
  assert.equal((await send('/api/member/me',a)).data.place.key,verseKey,'browser-only place was not uploaded during load');
  await second.locator('#import-saves').click();
  await second.waitForFunction(() => document.querySelectorAll('#saves-list .saved-row').length >= 3);
  assert.equal(await second.locator('#import-local-place').isVisible(),true);
  await second.locator('#import-local-place').click();
  await second.waitForFunction(() => document.querySelector('#place-summary')?.textContent?.includes('2:1'));
  const imported = await send('/api/member/me',a);
  assert.deepEqual(new Set(imported.data.saves.filter(item => item.kind === 'home').map(item=>item.id)),new Set(['ask','wisdom']));
  assert.equal(imported.data.place.key,'2:1');
  assert.equal(JSON.stringify(imported.data).includes('QA PRIVATE NOTE'),false);
  assert.equal(JSON.stringify(imported.data).includes('QA PRIVATE QUESTION'),false);
  assert.equal(await second.evaluate(()=>localStorage.getItem('dd-note')),'QA PRIVATE NOTE — NEVER UPLOAD');

  const other = await send('/api/member/me',b);
  assert.equal(other.status,200);
  assert.equal(other.data.profile.displayName,'QA Member B — marked fixture');
  assert.equal(other.data.saves.length,0);
  assert.equal(other.data.place,null);
  assert.equal(JSON.stringify(other.data).includes('QA Member A'),false);
  assert.equal((await send('/api/admin/members',b)).status,403);
  assert.equal((await send('/api/admin/roles',b,{userId:a,role:'publisher'})).status,403);
  assert.equal((await send('/staff',b)).status,403);
  const ownerView = await context(browser,owner); contexts.push(ownerView);
  const staff = await ownerView.newPage(); staff.setDefaultTimeout(12000);
  await staff.goto(origin+'/staff',{waitUntil:'domcontentloaded'});
  await staff.locator('#staff-workspace:visible').waitFor();
  await staff.locator('#member-list').getByText('QA Member A — edited fixture').waitFor();
  assert.equal(await staff.locator('#member-list').getByText('QA Member B — marked fixture').count(),1);
  await noOverflow(staff,'staff hub');

  await second.goto(origin+'/member',{waitUntil:'domcontentloaded'});
  await second.locator('#delete-form [name=confirm]').fill('DELETE MY ACCOUNT');
  await second.locator('#delete-form button[type=submit]').click();
  await second.locator('#status.success').waitFor();
  assert.equal((await send('/member',a)).status,403,'deleted reader invitation was revoked');
  assert.equal((await send('/api/member/delete',b,{confirm:'DELETE MY ACCOUNT'})).status,200);
  const listing = await send('/api/admin/members?search=QA%20Member',owner);
  assert.equal(listing.status,200);
  assert.equal(listing.data.items.length,0);
  const audit = await send('/api/admin/member-audit',owner);
  assert.equal(audit.status,200);
  assert.ok(audit.data.items.length >= 2);
  assert.equal(JSON.stringify(audit.data).includes(a),false);
  assert.equal(JSON.stringify(audit.data).includes(b),false);
  console.log('PASS hosted Preview: invited UI signup, profile edit and persistence; curated link save restored in independent authenticated browser; Quran reader account-position sync; explicit legacy bookmarks and browser-place import without uploading notebooks; member isolation/staff denial; owner staff member index; exact-confirmation deletion, invitation revocation and pseudonymous audit; 390px mobile no overflow. All QA member profiles/saves removed.');
} finally {
  for (const ctx of contexts) await ctx.close().catch(()=>{});
  if (browser) await browser.close().catch(()=>{});
  for (const id of ids) {
    const me = await send('/api/member/me',id).catch(()=>({status:503}));
    if (me.status === 200 && me.data?.registered) await send('/api/member/delete',id,{confirm:'DELETE MY ACCOUNT'}).catch(()=>{});
    // Precise fixture cleanup only; never touch another user or migration history.
    const db = database();
    await db.batch([
      db.prepare('DELETE FROM member_saves WHERE user_id=?').bind(id),
      db.prepare('DELETE FROM member_progress WHERE user_id=?').bind(id),
      db.prepare('DELETE FROM member_profiles WHERE user_id=?').bind(id),
    ]).catch(()=>{});
    await send('/api/admin/roles',owner,{userId:id,role:'revoke'}).catch(()=>{});
  }
  await closeDatabase();
}
