// Read-only private HTTPS Preview UI acceptance; signed QA owner cookie represents
// the previously verified OAuth owner identity, not a second real person's OAuth login.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {chromium} from 'playwright-core';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_PROJECT_ID||!process.env.MANUS_JWT_SECRET)throw new Error('Private Preview and managed review owner session configuration required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
const h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,iat:now,exp:now+1200});
const cookie=`${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
async function widthCheck(page,route,locale,width){const x=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert.ok(x.document<=width&&x.body<=width,`${route}/${locale} ${width}px overflow ${JSON.stringify(x)}`);}
try {
 for(const width of [320,390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
  await ctx.addCookies([{name:'webdev_app_session',value:cookie,url:origin,secure:true,httpOnly:true,sameSite:'None'}]);
  const page=await ctx.newPage();page.setDefaultTimeout(16000);page.setDefaultNavigationTimeout(25000);
  await page.goto(origin+'/study',{waitUntil:'domcontentloaded'});
  await page.locator('#study-form').waitFor();
  assert.equal(await page.locator('#study-question').getAttribute('maxlength'),'600');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('skip')),true,'skip link is first keyboard target');
  for(const [language,script] of [['en',/Study/i],['ta',/\p{Script=Tamil}/u],['si',/\p{Script=Sinhala}/u]]){
   await page.locator('[data-shared-language]').selectOption(language);
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   assert.match(await page.locator('#study-title').innerText(),script);
   await widthCheck(page,'study',language,width);
  }
  await page.goto(origin+'/mosques',{waitUntil:'domcontentloaded'});
  await page.locator('#mosques-results .mosque-directory-card').nth(1).waitFor();
  assert.match(await page.locator('#mosques-results .mosque-directory-card').first().innerText(),/15|Mohideen/i);
  assert.match(await page.locator('#mosques-results .mosque-directory-card').nth(1).innerText(),/Kadheeja|97/i);
  for(const language of ['en','ta','si']){await page.locator('[data-shared-language]').selectOption(language);await widthCheck(page,'mosques',language,width);}
  await page.goto(origin+'/mosques/97',{waitUntil:'domcontentloaded'});
  await page.locator('#mosques-results .mosque-directory-card').waitFor();
  assert.equal(await page.locator('#mosques-results .mosque-directory-card').count(),1);
  assert.match(await page.locator('#directory-title').innerText(),/Kadheeja/i);
  assert.match(await page.locator('#mosques-results').innerText(),/R\/2141\/A 112/);
  assert.equal(await page.locator('.directory-controls').isVisible(),false);
  assert.match(await page.locator('.directory-source a').getAttribute('href'),/ANURADHAPURA-DISTRICT\.pdf/);
  await widthCheck(page,'mosque-detail','source-97',width);
  await page.route('**/api/events',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{id:'qa-event-detail',status:'published',title:'Synthetic QA event interface fixture',description:'Not a real invitation',language:'en',startsAt:'2026-10-07T08:00:00Z',timezone:'Asia/Colombo',location:'Synthetic fixture only'},{id:'qa-cancelled-detail',status:'cancelled',title:'Not shown'}]})}));
  await page.goto(origin+'/events/qa-event-detail',{waitUntil:'domcontentloaded'});
  await page.locator('#events-list .event-card').waitFor();
  assert.equal(await page.locator('#events-list .event-card').count(),1);
  assert.match(await page.locator('#events-list').innerText(),/Synthetic QA event interface fixture/);
  assert.equal(await page.locator('#events-list a[href="/events"]').count(),1);
  await widthCheck(page,'event-detail','fixture',width);
  await page.goto(origin+'/events/qa-cancelled-detail',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#events-status')?.textContent.includes('ලබා ගත නොහැක')||document.querySelector('#events-status')?.textContent.includes('not published')||document.querySelector('#events-status')?.textContent.includes('கிடைக்காது'));
  assert.equal(await page.locator('#events-list .event-card').count(),0,'cancelled event does not reappear as an invitation');
  await page.unroute('**/api/events');
  await page.goto(origin+'/privacy',{waitUntil:'domcontentloaded'});
  await page.locator('main[data-english-only]').waitFor();
  for(const language of ['ta','si']){
   await page.locator('[data-shared-language]').selectOption(language);
   assert.equal(await page.locator('main').getAttribute('lang'),'en');
   const notice=page.locator('[data-language-availability]');
   assert.equal(await notice.isVisible(),true);assert.equal(await notice.getAttribute('lang'),language);
   await widthCheck(page,'privacy',language,width);
  }
  await page.goto(origin+'/staff',{waitUntil:'domcontentloaded'});
  await page.locator('#staff-workspace:visible').waitFor();
  await page.locator('#study-ops-counts dt').first().waitFor();
  await widthCheck(page,'staff','en',width);
  console.log(`PASS ${width}px: study EN/TA/SI/keyboard/reduced-motion, source-ordered mosque directory+one-record detail, published-only event detail, English-only policy fallback, owner study counters; no horizontal overflow.`);
  await ctx.close();
 }
}finally{await browser.close();}
