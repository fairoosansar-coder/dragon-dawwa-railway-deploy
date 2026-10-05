// Local-only clickjacking regression. The proxy simulates Preview stripping
// CSP frame-ancestors; a different localhost port embeds an authenticated page.
// No record is written and no outside origin is contacted.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { chromium } from 'playwright-core';
const owner=process.env.REVIEW_TEST_OWNER_ID;
if(!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw new Error('Operator-only review identity required');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const raw=encode({alg:'HS256',typ:'JWT'})+'.'+encode({appId:process.env.MANUS_PROJECT_ID,openId:owner,exp:Math.floor(Date.now()/1000)+120});
const token=raw+'.'+createHmac('sha256',process.env.MANUS_JWT_SECRET).update(raw).digest('base64url');
const proxy=http.createServer(async (req,res)=>{
  try {
    const upstream=await fetch('http://127.0.0.1:3000'+req.url,{headers:{cookie:req.headers.cookie||''},redirect:'manual'});
    const headers=Object.fromEntries(upstream.headers);
    delete headers['content-security-policy']; delete headers['content-length'];
    res.writeHead(upstream.status,headers);res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {res.writeHead(502);res.end();}
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const proxyUrl='http://127.0.0.1:'+proxy.address().port;
const attacker=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><iframe title="untrusted parent" src="'+proxyUrl+'/operations"></iframe>');});
await new Promise(resolve=>attacker.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const context=await browser.newContext();
  await context.addCookies([{url:proxyUrl,name:'webdev_app_session',value:token,httpOnly:true,sameSite:'Lax'}]);
  const direct=await context.request.get(proxyUrl+'/operations');
  assert.equal(direct.status(),200,'verified account can open staff page directly');
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:'+attacker.address().port,{waitUntil:'domcontentloaded'});
  const inner=page.frameLocator('iframe');
  await inner.locator('body').waitFor({state:'attached',timeout:12000});
  const text=await inner.locator('body').innerText();
  assert.match(text,/Open the private review directly or through the Manus Dashboard/);
  assert.doesNotMatch(text,/Community operations|Private intake|Verified-account permissions/);
  console.log('PASS direct owner access 200; with edge CSP stripping, unrelated frame shows guard notice instead of staff controls');
} finally {
  await browser.close();
  await new Promise(resolve=>attacker.close(resolve));
  await new Promise(resolve=>proxy.close(resolve));
}
