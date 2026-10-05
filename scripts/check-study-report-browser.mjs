// Browser-only synthetic answer fixture. Both API routes are intercepted: no Google call,
// Quran.ai request, religious-content publication, or review-database write occurs.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {chromium} from 'playwright-core';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw new Error('Private Preview config required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,iat:now,exp:now+900});
const token=`${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:390,height:840}});await context.addCookies([{name:'webdev_app_session',value:token,url:origin,httpOnly:true,secure:true,sameSite:'None'}]);
 const page=await context.newPage();page.setDefaultTimeout(12000);const reports=[];
 await page.route('**/api/study/generate',async route=>{const input=route.request().postDataJSON();const body={id:'synthetic-report-answer',language:input.language,paragraphs:['Synthetic UI fixture: no religious assertion.'],disclosure:'Synthetic response for UI testing only.',generatedAt:new Date().toISOString(),sources:[{id:'quran:test:1:1',title:'Synthetic source only',edition:'QA',verse:'1:1',url:'https://quran.com/1/1',quote:'Fixture text, not a religious quotation.'}]};await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(body)});});
 await page.route('**/api/study/report',async route=>{reports.push(route.request().postDataJSON());await route.fulfill({status:201,contentType:'application/json',body:'{"status":"open"}'});});
 await page.goto(origin+'/study',{waitUntil:'domcontentloaded'});
 for(const [language,script] of [['en',/Saved for restricted owner review/],['ta',/\p{Script=Tamil}/u],['si',/\p{Script=Sinhala}/u]]){
  await page.locator('[data-shared-language]').selectOption(language);
  await page.locator('#study-verse').fill('1:1');
  await page.locator('#study-submit').click();await page.locator('#study-result').waitFor({state:'visible'});
  await page.locator('#study-report-reason').selectOption('citation');
  await page.locator('#study-report-details').fill('Synthetic source UI QA; no private data.');
  await page.locator('#study-report-form button[type="submit"]').click();
  await page.locator('#study-report-status').waitFor({state:'visible'});
  assert.match(await page.locator('#study-report-status').innerText(),script);
  assert.deepEqual(reports.at(-1),{responseId:'synthetic-report-answer',reason:'citation',details:'Synthetic source UI QA; no private data.'});
  const w=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(w.scroll<=w.viewport,`report form ${language} overflows`);
 }
 console.log('PASS 390px EN/TA/SI study issue report UI: correct answer ID, reason, bounded details, restricted-review acknowledgment, no network/provider/database writes.');
 await context.close();
}finally{await browser.close();}
