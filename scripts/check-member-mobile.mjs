// Read-only language/navigation acceptance on the private HTTPS Preview.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {chromium} from 'playwright-core';
const origin=process.env.REVIEW_PUBLIC_ORIGIN, owner=process.env.REVIEW_TEST_OWNER_ID;
if (!origin?.startsWith('https://') || !owner || !process.env.MANUS_JWT_SECRET || !process.env.MANUS_PROJECT_ID)
  throw new Error('Private origin, verified owner and managed development identity configuration are required');
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const unsigned=enc({alg:'HS256',typ:'JWT'})+'.'+enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,iat:now,exp:now+900});
const token=unsigned+'.'+createHmac('sha256',process.env.MANUS_JWT_SECRET).update(unsigned).digest('base64url');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'webdev_app_session',value:token,url:origin,secure:true,httpOnly:true,sameSite:'None'}]);
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const resourceNames={en:'Resources',ta:'வளங்கள்',si:'සම්පත්'};
  for(const language of ['en','ta','si']) {
    await page.goto(origin+'/resources',{waitUntil:'domcontentloaded',timeout:20000});
    await page.locator('.resource-entry').first().waitFor();
    await page.locator('[data-shared-language]').selectOption(language);
    for (const route of ['/resources','/member','/library','/mosque']) {
      if (route !== '/resources') await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:20000});
      assert.equal(await page.locator('html').getAttribute('lang'),language,`${route} language persistence`);
      const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.body.scrollWidth}));
      assert.ok(width.scroll<=width.viewport,`${route} ${language} mobile overflow ${JSON.stringify(width)}`);
      if (route === '/resources') {
        assert.equal(await page.locator('.resource-entry').count(),6);
        assert.equal(await page.locator('a[data-nav="member"]').count(),1);
        assert.equal(await page.locator('a[data-nav="resources"]').innerText(),resourceNames[language]);
      }
      if (route === '/member') assert.equal(await page.locator('nav a[data-nav="member"]').count(),2,'one desktop and one mobile My Learning link, not duplicated');
      if (route === '/library') assert.ok(await page.locator('a[href="/resources"]').count()>0);
    }
  }
  const unsafeGet=await page.goto(origin+'/auth/logout',{waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(unsafeGet.status(),405,'a GET must never change session state');
  await page.goto(origin+'/member',{waitUntil:'domcontentloaded',timeout:20000});
  await page.locator('#signed-in-actions form[action="/auth/logout"] button').click();
  await page.waitForURL('**/signed-out',{timeout:20000});
  assert.equal(new URL(page.url()).pathname,'/signed-out');
  assert.equal(await page.evaluate(async()=> (await fetch('/api/member/me')).status),401,'logout clears the application session');
  await page.goto(origin+'/recover',{waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(new URL(page.url()).pathname,'/recover');
  assert.ok((await page.locator('main').innerText()).includes('Manus'));
  console.log('PASS 390px HTTPS Preview: EN, Tamil and Sinhala persisted across Resources → My Learning → Library → Mosque, with no horizontal overflow or duplicate member links; app logout cleared the cookie and provider-managed recovery loaded. This does not certify religious translation accuracy.');
  await context.close();
} finally { await browser.close(); }
