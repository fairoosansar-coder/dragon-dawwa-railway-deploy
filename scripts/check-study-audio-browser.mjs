// UI/media QA: genuine previously generated Google WAV, but mock answer and narrator
// endpoints. This verifies Chromium playback controls, not native-speaker quality or a
// second integrated Google narration of the synthetic answer.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chromium,devices} from 'playwright-core';
const origin=process.env.REVIEW_PUBLIC_ORIGIN,owner=process.env.REVIEW_TEST_OWNER_ID;
if(!origin?.startsWith('https://')||!owner||!process.env.MANUS_JWT_SECRET||!process.env.MANUS_PROJECT_ID)throw new Error('Private Preview config required');
const language=process.env.VOICE_SAMPLE_LANGUAGE||'en';if(!['en','ta','si'].includes(language))throw new Error('Unsupported sample language');
const mobileTouch=process.env.MOBILE_TOUCH_QA==='1';
const wave=readFileSync(`/home/ubuntu/work/dragon-dawwa/voice-samples/Kore-${language}.wav`);assert.equal(wave.subarray(0,4).toString(),'RIFF');
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000),h=enc({alg:'HS256',typ:'JWT'}),p=enc({appId:process.env.MANUS_PROJECT_ID,openId:owner,iat:now,exp:now+900});
const token=`${h}.${p}.${createHmac('sha256',process.env.MANUS_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
try{
 const context=await browser.newContext(mobileTouch
   ? {...devices['Pixel 7'],viewport:{width:390,height:820},reducedMotion:'reduce'}
   : {viewport:{width:390,height:820}});
 await context.addCookies([{name:'webdev_app_session',value:token,url:origin,httpOnly:true,secure:true,sameSite:'None'}]);
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await page.route('**/api/study/generate',route=>route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'synthetic-audio-ui',language,paragraphs:['Synthetic interface test only.'],disclosure:'Not a real study answer.',generatedAt:new Date().toISOString(),sources:[{id:'quran:test',title:'Synthetic test',edition:'QA',verse:'1:1',quote:'Fixture, not scripture.',url:'https://quran.com/1/1'}]})}));
 await page.route('**/api/study/narrate',route=>route.fulfill({status:200,contentType:'application/json',body:'{"status":"ready","audioUrl":"/api/study/audio/synthetic-ui"}'}));
 await page.route('**/api/study/audio/synthetic-ui',route=>route.fulfill({status:200,contentType:'audio/wav',headers:{'Cache-Control':'private, no-store','Accept-Ranges':'bytes'},body:wave}));
 await page.goto(origin+'/study',{waitUntil:'domcontentloaded'});await page.locator('#study-language').selectOption(language);await page.locator('#study-verse').fill('1:1');await page.locator('#study-submit').click();await page.locator('#study-result').waitFor({state:'visible'});
 assert.equal(await page.locator('#study-audio-controls').isVisible(),false,'no autoplay before user requests Listen');
 if(mobileTouch)await page.locator('#narrate-button').tap();else await page.locator('#narrate-button').click();
 await page.locator('#study-audio-controls').waitFor({state:'visible'});
 const metadata=await page.locator('#study-audio').evaluate(async audio=>{if(audio.readyState<1)await new Promise((resolve,reject)=>{audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',reject,{once:true});});return {duration:audio.duration,paused:audio.paused}});
 assert.ok(metadata.duration>5&&metadata.duration<20);assert.equal(metadata.paused,true,'audio must not autoplay');
 if(mobileTouch)await page.locator('#audio-play').tap();else await page.locator('#audio-play').click();
 await page.waitForFunction(()=>{const a=document.querySelector('#study-audio');return !a.paused&&a.currentTime>0.04;});
 if(mobileTouch)await page.locator('#audio-pause').tap();else await page.locator('#audio-pause').click();
 assert.equal(await page.locator('#study-audio').evaluate(a=>a.paused),true);
 await page.locator('#audio-speed').selectOption('1.2');assert.equal(await page.locator('#study-audio').evaluate(a=>a.playbackRate),1.2);
 await page.locator('#study-audio').evaluate(a=>{a.currentTime=a.duration/2;});
 assert.ok(await page.locator('#study-audio').evaluate(a=>a.currentTime)>2,'native timeline can seek');
 if(mobileTouch)await page.locator('#audio-replay').tap();else await page.locator('#audio-replay').click();
 await page.waitForFunction(()=>!document.querySelector('#study-audio').paused);
 const time=await page.locator('#study-audio').evaluate(a=>a.currentTime);assert.ok(time<1,'replay restarts close to beginning');
 console.log(`PASS ${language} ${mobileTouch?'Pixel 7 profile with touch/reduced motion':'390px Chromium'} decoded actual Google WAV; user-initiated Listen, no autoplay, Play/Pause/Replay, native seek and 1.2x speed. Provider calls intercepted; physical Android/iOS still unverified.`);
 await context.close();
}finally{await browser.close();}
