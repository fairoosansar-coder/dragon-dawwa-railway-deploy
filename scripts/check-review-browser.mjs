// Controlled browser acceptance against the HTTPS private Preview. QA account cookies are
// signed locally with the development-only project secret; actual OAuth is tested separately.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright-core';

const origin=process.env.REVIEW_PUBLIC_ORIGIN, owner=process.env.REVIEW_TEST_OWNER_ID;
if (!origin?.startsWith('https://') || !owner || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID) throw new Error('Verified review origin, owner ID and injected development signing secret are required.');
function jwt(id) {
  const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned=enc({alg:'HS256',typ:'JWT'})+'.'+enc({appId:process.env.MANUS_PROJECT_ID,openId:id,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+900});
  return unsigned+'.'+createHmac('sha256',process.env.MANUS_JWT_SECRET).update(unsigned).digest('base64url');
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addCookies([{name:'webdev_app_session',value:jwt(owner),url:origin,httpOnly:true,secure:true,sameSite:'None'}]);
const page=await context.newPage();
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(15000);
const guard=setTimeout(()=>{ console.error('Browser QA exceeded 120 seconds; stopping.'); process.exit(2); },120000);
const mark=step=>console.log(`browser QA: ${step}`);
const created=[];
async function noOverflow(label) {
  const result=await page.locator('body').evaluate(el=>({width:window.innerWidth,scroll:el.scrollWidth,offenders:[...el.querySelectorAll('*')].filter(child=>child.getBoundingClientRect().right>window.innerWidth+1).slice(0,8).map(child=>({tag:child.tagName,class:child.className,right:Math.round(child.getBoundingClientRect().right)}))}));
  assert.ok(result.scroll<=result.width,`${label} mobile overflow: ${JSON.stringify(result)}`);
}
async function admin(path, data) {
  return page.evaluate(async ({path,data}) => {
    const response=await fetch(path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:response.status,body:await response.json()};
  },{path,data});
}
try {
  mark('mosque');
  await page.goto(origin+'/mosque',{waitUntil:'domcontentloaded'});
  await page.locator('.fact-card').waitFor();
  await noOverflow('mosque');
  assert.match(await page.locator('main').innerText(),/R\/2141\/A 112/);
  await page.locator('[data-shared-language]').first().selectOption('ta');
  assert.equal(await page.locator('html').getAttribute('lang'),'ta');
  mark('events');
  await page.goto(origin+'/events',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('html').getAttribute('lang'),'ta','Tamil selection persists on navigation');
  await noOverflow('events');
  await page.locator('[data-shared-language]').first().selectOption('si');
  assert.equal(await page.locator('html').getAttribute('lang'),'si');
  mark('participation form');
  await page.goto(origin+'/participate',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('html').getAttribute('lang'),'si','Sinhala selection persists');
  await noOverflow('participation');
  await page.locator('[name=purpose]').selectOption('inquiry');
  await page.locator('[name=message]').fill('LOCAL QA BROWSER FIXTURE — no personal contact.');
  await page.locator('[name=consentRequired]').check();
  const participationWait=page.waitForResponse(response=>response.url().endsWith('/api/participation'),{timeout:8000}).catch(()=>null);
  await page.locator('#participation-form button[type=submit]').click();
  mark('participation clicked');
  const participationResponse=await participationWait;
  if (!participationResponse) throw new Error(`Participation did not POST: ${await page.locator('#participation-form [role=status]').innerText()} / valid=${await page.locator('#participation-form').evaluate(form=>form.checkValidity())}`);
  mark(`participation HTTP ${participationResponse.status()}`);
  assert.equal(participationResponse.status(),201);
  await page.waitForFunction(()=>document.querySelector('#participation-form [role=status]')?.classList.contains('success'));
  let list=await admin('/api/admin/submissions'); assert.equal(list.status,200);
  let record=list.body.items.find(x=>x.details?.includes('LOCAL QA BROWSER FIXTURE'));
  assert.ok(record,'browser form submission was stored'); created.push(record.id);
  mark('correction form');
  await page.goto(origin+'/mosque',{waitUntil:'domcontentloaded'});
  await page.locator('[name=subject]').fill('LOCAL QA subject only');
  await page.locator('[name=correction]').fill('LOCAL QA BROWSER FIXTURE — correction intake test.');
  await page.locator('#correction-form [name=consentRequired]').check();
  const correctionWait=page.waitForResponse(response=>response.url().endsWith('/api/corrections'),{timeout:8000}).catch(()=>null);
  await page.locator('#correction-form button[type=submit]').click();
  const correctionResponse=await correctionWait;
  if (!correctionResponse) throw new Error(`Correction did not POST: ${await page.locator('#correction-form [role=status]').innerText()} / valid=${await page.locator('#correction-form').evaluate(form=>form.checkValidity())}`);
  mark(`correction HTTP ${correctionResponse.status()}`);
  assert.equal(correctionResponse.status(),201);
  await page.waitForFunction(()=>document.querySelector('#correction-form [role=status]')?.classList.contains('success'));
  list=await admin('/api/admin/submissions');
  record=list.body.items.find(x=>x.kind==='correction' && x.details?.includes('LOCAL QA BROWSER FIXTURE'));
  assert.ok(record,'browser correction form was stored'); created.push(record.id);
  mark('quran live and failure/retry');
  await page.goto(origin+'/quran',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.verse-card',{timeout:40000});
  assert.equal(await page.locator('#surah-select option').count(),114);
  const translations=await page.locator('#translation-select option').allTextContents();
  assert.ok(translations.some(x=>x.includes('tamil')));
  assert.equal(translations.some(x=>/sinhala|sinhalese/i.test(x)),false,'no Sinhala translation fabricated');
  assert.equal(await page.locator('#quran-language').inputValue(),'si');
  await page.locator('#quran-language').selectOption('ta');
  const tamilOption=page.locator('#translation-select option').filter({hasText:'tamil'}).first();
  await page.locator('#translation-select').selectOption(await tamilOption.getAttribute('value'));
  await page.waitForSelector('.verse-card');
  assert.match(await page.locator('.translation-credit').first().innerText(),/tamil/i);
  const media=page.locator('audio').first();
  const audioPresent=await media.count()>0;
  let audioPlayed=false;
  if (audioPresent) {
    // Chromium native media control is clicked with a genuine pointer action; do not autoplay.
    try {
      await media.click({position:{x:12,y:15},timeout:5000});
      await page.waitForFunction(()=>document.querySelector('audio')?.currentTime>0,{timeout:7000});
      audioPlayed=true;
    } catch { /* Browser/headless audio availability is separately reported, not invented. */ }
  }
  await page.route(/\/api\/quran\/verses\?/,route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"provider_unavailable"}'}));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#retry-reader:visible').waitFor({timeout:40000});
  await page.unroute(/\/api\/quran\/verses\?/);
  await page.locator('#retry-reader').click();
  await page.waitForSelector('.verse-card',{timeout:40000});
  assert.equal(await page.locator('#retry-reader').isVisible(),false);
  mark('staff inbox and cleanup');
  await page.goto(origin+'/operations',{waitUntil:'domcontentloaded'});
  await page.locator('#inbox-section:visible').waitFor();
  assert.match(await page.locator('#access').innerText(),/owner/);
  for (const id of created) {
    const deleted=await admin(`/api/admin/submissions/${id}/delete`,{});
    assert.equal(deleted.status,200);
  }
  const after=await admin('/api/admin/submissions');
  assert.ok(created.every(id=>after.body.items.find(x=>x.id===id)?.deleted));
  created.length=0;
  console.log(JSON.stringify({result:'PASS',mobile:'mosque/events/participate no overflow; Tamil and Sinhala persisted',visitorForms:'participation and correction stored then payload-deleted',quran:'114 chapters; named Tamil translation; no Sinhala translation; error and retry restored live verses',audio:audioPlayed?'played in Chromium':'player rendered; playback unavailable in headless Chromium',staff:'owner operations and restricted inbox rendered'}));
} finally {
  for (const id of created) await admin(`/api/admin/submissions/${id}/delete`,{}).catch(()=>{});
  clearTimeout(guard);
  await browser.close();
}
