// Read-only browser test: the clearly labelled nonreligious article is mocked in network
// responses and never published to the review database or visible to other reviewers.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright-core';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_PROJECT_ID||!process.env.MANUS_JWT_SECRET)throw new Error('Review origin and runtime-only QA identity required');
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const raw=enc({alg:'HS256',typ:'JWT'})+'.'+enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,exp:Math.floor(Date.now()/1000)+300});
const cookie=raw+'.'+createHmac('sha256',process.env.MANUS_JWT_SECRET).update(raw).digest('base64url');
const fixture={id:'qa-library-browser-only',publishedVersion:3,content:{translations:{en:{title:'LOCAL QA — nonreligious reading',summary:'Test the visitor search.',body:'This is a controlled article interface fixture, not guidance.',contributor:'QA browser actor'}},sources:[{url:'https://example.org/qa',label:'QA source only',kind:'source',author:'Example'}],metadata:{topics:['QA Interface'],classification:'editorial',clarity:'Not a religious claim'},review:{languages:['en'],reviewedRevision:3,reviewedBy:'QA verified reviewer'}}};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{url:origin,name:'webdev_app_session',value:cookie,secure:true,httpOnly:true,sameSite:'None'}]);
 const page=await context.newPage();page.setDefaultTimeout(12000);
 await page.route(/\/api\/content(?:\/qa-library-browser-only)?$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/qa-library-browser-only')?{item:fixture}:{items:[fixture]})}));
 await page.goto(origin+'/library',{waitUntil:'domcontentloaded'});
 await page.locator('.library-card').waitFor();
 assert.equal(await page.locator('body').evaluate(body=>body.scrollWidth<=window.innerWidth),true,'library mobile overflow');
 const routes=await page.locator('nav[aria-label="Library and visitor navigation"] a').evaluateAll(links=>links.map(link=>new URL(link.href).pathname));
 assert.equal(routes.length,10);
 assert.equal(new Set(routes).size,10,'library navigation must not duplicate destinations');
 assert.ok(routes.includes('/resources') && routes.includes('/member'),'curated resources and private learning must be discoverable');
 const read=page.locator('.library-read');assert.match(await read.getAttribute('href'),/\/library\/qa-library-browser-only$/);
 await page.locator('#library-search').fill('not a matching phrase');
 assert.equal(await page.locator('.library-card').count(),0);
 await page.locator('#clear-filters').click();
 assert.equal(await page.locator('.library-card').count(),1);
 await read.click();await page.locator('dialog[open]').waitFor();
 assert.equal(new URL(page.url()).pathname,'/library/qa-library-browser-only');
 assert.match(await page.locator('#reading-content').innerText(),/QA source only/);
 assert.match(await page.locator('#reading-content').innerText(),/A verified site account reviewed this revision/);
 assert.doesNotMatch(await page.locator('#reading-content').innerText(),/QA verified reviewer/);
 await page.locator('#library-language').selectOption('ta');
 assert.equal(await page.locator('html').getAttribute('lang'),'ta');
 assert.match(await page.locator('#library-language').getAttribute('aria-label'),/மொழியைத் தேர்வு செய்க/);
 assert.match(await page.locator('#reading-content').innerText(),/தேர்ந்தெடுத்த மொழியில் இல்லை/);
 console.log('PASS library mobile/navigation/search/detail/source attribution/review record/missing Tamil rendering; no database fixture');
}finally{await browser.close();}
