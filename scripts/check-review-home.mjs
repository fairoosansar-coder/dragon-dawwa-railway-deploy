// Read-only review-home acceptance except browser-local synthetic note state.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {chromium} from 'playwright-core';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw Error('Private Preview and owner test session required');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
const raw=enc({alg:'HS256',typ:'JWT'})+'.'+enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,iat:now,exp:now+900});
const token=raw+'.'+createHmac('sha256',process.env.MANUS_JWT_SECRET).update(raw).digest('base64url');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'webdev_app_session',value:token,url:origin,secure:true,httpOnly:true,sameSite:'None'}]);
 const page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:20000});
 assert.match(await page.locator('#reading-grid').innerText(),/No approved Dragon Dawwa readings/);
 assert.equal(await page.locator('.reading-card,.verse-section,.gather-feature').count(),0);
 const rendered=await page.locator('body').innerText();
 for(const claim of ['The courage to ask','Wisdom in every word','Our first learning circle','A reflection on Qur’an 17:36'])assert.equal(rendered.includes(claim),false,claim+' must be withheld');
 const script=await (await page.request.get(origin+'/app.js')).text();
 assert.equal(script.includes('The courage to ask'),false,'served JS must not contain the archived teaching');
 assert.equal((await page.request.get(origin+'/i18n-si.js')).status(),404,'old teaching translation asset must not be served');
 await page.evaluate(()=>localStorage.setItem('dd-note',JSON.stringify('QA NOTE remains local')));
 await page.locator('.notebook-icon').click();
 assert.equal(await page.locator('#note-text').inputValue(),'QA NOTE remains local');
 await page.locator('#dialog-close').click();
 await page.locator('[data-open="privacy"]').click();
 assert.match(await page.locator('#dialog-content').innerText(),/invited member may separately choose to store/);
 await page.locator('#dialog-close').click();
 for(const language of ['ta','si']){
  await page.locator('#language').selectOption(language);
  assert.equal(await page.locator('html').getAttribute('lang'),language);
  assert.equal((await page.locator('#reading-grid').innerText()).includes('No approved Dragon Dawwa readings'),false,'empty state must be localized');
  const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.body.scrollWidth}));
  assert.ok(width.scroll<=width.viewport,language+' home overflow '+JSON.stringify(width));
 }
 assert.deepEqual(errors,[],'home page had browser script errors');
 console.log('PASS private 390px homepage: inherited version-8 teaching, verse commentary and speculative circle withheld from rendered page and served JS; no script errors; notebook note remains browser-local; privacy copy and Tamil/Sinhala empty states accurate.');
 await context.close();
}finally{await browser.close();}
