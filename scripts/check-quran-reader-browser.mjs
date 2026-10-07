// Local Chromium interaction check. Fixtures are synthetic; no Quran provider or production credentials are contacted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../public/', import.meta.url);
const file = name => readFile(new URL(name, root));
const catalog = {
  environment:'production',
  chapters:[{id:1,name:'Al-Fatihah',arabic:'الفاتحة',verses:7,translatedName:'The Opening',revelationPlace:'makkah'},
    {id:2,name:'Al-Baqarah',arabic:'البقرة',verses:286}],
  translations:[{id:85,name:'Named translation',author:'Named translator',language:'english'}],
  recitations:[{id:7,name:'Named ayah reciter'}],
  chapterReciters:[{id:3,name:'Named surah reciter',style:'Murattal'}],
  tafsirs:[{id:169,name:'Named commentary',author:'Named commentator',language:'english'}],
};
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const context = await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
  const page = await context.newPage();
  const requested = [], failures = [];
  let malformedTajweed = false, maliciousVerseKey = false, delayedChapter = 0, releaseDelayed = () => {}, rejectChapter = 0;
  let chapterInfoUnavailable = false, memberMode = 'guest';
  page.on('pageerror',error=>failures.push(error.message));
  await page.route('**/*',async route=>{
    const url = new URL(route.request().url()); requested.push(url.pathname);
    if (url.pathname === '/quran') return route.fulfill({status:200,contentType:'text/html',body:(await file('quran.html')).toString().replace('<head>','<head><meta name="dd-public-page" content="true">')});
    if (['/quran.js','/quran-copy.js','/shared-nav.js'].includes(url.pathname)) return route.fulfill({status:200,contentType:'text/javascript',body:await file(url.pathname.slice(1))});
    if (url.pathname.endsWith('.css') && url.hostname === 'dragondawwa.org') return route.fulfill({status:200,contentType:'text/css',body:await file(url.pathname.slice(1))});
    if (url.pathname === '/assets/mark.svg') return route.fulfill({status:200,contentType:'image/svg+xml',body:await file('assets/mark.svg')});
    if (/^\/assets\/quran-banner-illumination-(wide|mobile)\.webp$/.test(url.pathname)) return route.fulfill({status:200,contentType:'image/webp',body:await file(url.pathname.slice(1))});
    if (url.pathname === '/api/member/me') return memberMode === 'guest'
      ? route.fulfill({status:401,contentType:'application/json',body:'{"error":"sign_in_required"}'})
      : route.fulfill({status:200,contentType:'application/json',body:'{"registered":false,"place":null,"saves":[]}'});
    if (url.pathname === '/api/quran/bootstrap') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)});
    if (url.pathname === '/api/quran/verses') {
      const script = url.searchParams.get('script'), withWords = url.searchParams.get('words') === '1';
      const chapter = Number(url.searchParams.get('chapter'));
      if (delayedChapter === chapter) await new Promise(resolve=>{ releaseDelayed = resolve; setTimeout(resolve,2500); });
      if (rejectChapter === chapter) return route.fulfill({status:502,contentType:'application/json',body:'{"error":"provider_unavailable"}'});
      const verse = key=>({key,arabic:'بِسْمِ ٱللَّهِ',scriptText:script === 'indopak' ? 'بِسۡمِ اللهِ' : script === 'tajweed' ? malformedTajweed ? '<img src=x onerror="window.providerInjected=true">' : '<tajweed class="ham_wasl">ٱ</tajweed>للَّهِ<img src=x onerror="window.providerInjected=true">' : null,
        scriptAvailable:Boolean(script && script !== 'uthmani'),
        pageNumber:chapter === 1 ? 1 : 2,juzNumber:1,hizbNumber:1,
        translations:[{id:85,text:'The named source translation of '+key}],
        audio:'https://verses.quran.com/Alafasy/mp3/001001.mp3',
        words:withWords ? [{position:1,text:'بِسْمِ',meaning:'In the name',meaningLanguage:'english',transliteration:'bismi',audio:'https://audio.qurancdn.com/wbw/001_001_001.mp3'}] : []});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({chapter,translation:85,recitation:7,script,wordsAvailable:withWords,
        verses:chapter===1?[verse(maliciousVerseKey ? '1:1"><img src=x onerror="window.__quranKeyInjected=1">' : '1:1'),verse('1:2')]:[verse('2:1')], pagination:{current:1,next:null,total:1,count:chapter===1?2:1}})});
    }
    if (url.pathname === '/api/quran/chapter') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(chapterInfoUnavailable
      ? {chapter:Number(url.searchParams.get('chapter')),description:null,source:null,available:false}
      : {chapter:Number(url.searchParams.get('chapter')),description:'Named provider chapter context <img src=x onerror="window.infoInjected=true">',source:'Named edition',available:true})});
    if (url.pathname === '/api/quran/chapter-audio') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio:'https://download.quranicaudio.com/qdc/example/1.mp3',reciter:catalog.chapterReciters[0],available:true})});
    if (url.pathname === '/api/quran/navigate') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({key:'1:1',chapter:1,page:1,unit:url.searchParams.get('unit'),number:Number(url.searchParams.get('number'))})});
    if (['verses.quran.com','audio.qurancdn.com','download.quranicaudio.com'].includes(url.hostname)) return route.fulfill({status:404,body:''});
    if (url.hostname === 'verses.quran.foundation') return route.fulfill({status:404,body:''});
    return route.abort();
  });
  await page.goto('https://dragondawwa.org/quran',{waitUntil:'domcontentloaded'});
  await page.locator('#ayah-1-1').waitFor({state:'visible'});
  assert.equal(await page.locator('.quran-banner-art').innerText(),'','generated banner artwork must contain no HTML lettering');
  assert.equal(await page.locator('.quran-banner-art img').getAttribute('alt'),'','decorative artwork must not replace the accessible page title');
  assert.equal(await page.locator('.quran-banner-caption h1').count(),1);
  assert.equal(await page.locator('.quran-banner-caption h1 br').count(),0,'hero heading must wrap naturally outside the image');
  assert.equal(await page.locator('.quran-banner-caption .quran-hero-primary').getAttribute('href'),'#mushaf-page');
  await page.waitForFunction(()=>document.querySelector('.quran-banner-art img')?.naturalWidth > 0);
  await page.locator('.quran-banner-art img').evaluate(image=>image.decode());
  assert.match(await page.locator('.quran-banner-art img').evaluate(img=>img.currentSrc),/quran-banner-illumination-mobile\.webp$/);
  assert.equal(await page.locator('#ayah-1-1 .verse-arabic').innerText(),'بِسْمِ ٱللَّهِ');
  assert.match(await page.locator('#chapter-meta').innerText(),/MUSHAF PAGE 1.*JUZ 1.*HIZB 1/i);
  assert.match(await page.locator('#ayah-1-1 .translation-credit').innerText(),/Named translator.*Quran Foundation/);
  await page.locator('[data-mode=arabic]').click();
  assert.equal(await page.locator('#reading-flow').isVisible(),true);
  assert.equal(await page.locator('#verses').isVisible(),false);
  await page.locator('[data-mode=translation]').click();
  assert.match(await page.locator('#reading-flow').innerText(),/The named source translation/);
  await page.locator('[data-mode=verse]').click();
  await page.locator('#reader-settings summary').click();
  await page.locator('#arabic-size').fill('52');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dd-quran-reader')).size),52);
  await page.locator('#arabic-script').selectOption('indopak');
  await page.waitForFunction(()=>document.querySelector('#ayah-1-1 .verse-arabic')?.textContent?.includes('بِسۡمِ'));
  await page.locator('#arabic-script').selectOption('tajweed');
  await page.waitForFunction(()=>document.querySelector('#ayah-1-1 .verse-arabic .tajweed-ham_wasl'));
  assert.equal(await page.evaluate(()=>Boolean(window.providerInjected)),false);
  await page.locator('#arabic-script').selectOption('indopak');
  await page.waitForFunction(()=>document.querySelector('#ayah-1-1 .verse-arabic')?.textContent?.includes('بِسۡمِ'));
  malformedTajweed = true;
  await page.locator('#arabic-script').selectOption('tajweed');
  await page.waitForFunction(()=>document.querySelector('#arabic-script')?.value === 'uthmani');
  assert.match(await page.locator('#ayah-1-1 .verse-arabic').innerText(),/ٱللَّهِ/);
  await page.locator('#show-words').check();
  await page.locator('#ayah-1-1 .word-panel summary').click();
  assert.match(await page.locator('#ayah-1-1 .word-panel').innerText(),/In the name/);
  assert.equal(await page.locator('#ayah-1-1 .word-item').count(),1);
  await page.locator('#reader-settings summary').click();
  await page.locator('#ayah-1-1 .bookmark-ayah').click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('dd-quran-bookmarks'))),['1_1']);
  assert.equal(await page.locator('#ayah-1-1 .bookmark-ayah').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#ayah-1-1 .verse-more').getAttribute('open'),null);
  await page.locator('#ayah-1-1 .verse-more summary').click();
  await page.locator('#ayah-1-1 .copy-ayah').click();
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/1:1[\s\S]*Quran data provided by Quran Foundation/);
  await page.locator('#ayah-1-1 .share-ayah').click();
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/^https:\/\/dragondawwa\.org\/quran\/study\?ayah=1%3A1/);
  await page.locator('#ayah-1-1 .save-place').click();
  assert.equal(await page.locator('#resume-reading').isVisible(),true);
  await page.locator('#chapter-info-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#chapter-info-credit')?.textContent?.includes('Named edition'));
  assert.equal(await page.evaluate(()=>Boolean(window.infoInjected)),false);
  chapterInfoUnavailable = true;
  await page.locator('#chapter-info-toggle').click();
  await page.locator('#chapter-info-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#chapter-info-credit')?.textContent?.includes('chapter catalogue'));
  assert.match(await page.locator('#chapter-info-content').innerText(),/The Opening.*7 verses.*makkah/);
  assert.doesNotMatch(await page.locator('#chapter-info-content').innerText(),/Named provider chapter context/);
  await page.locator('#chapter-listen').click();
  await page.waitForFunction(()=>document.querySelector('#chapter-audio')?.getAttribute('src')?.includes('download.quranicaudio.com'));
  await page.locator('#chapter-repeat').check();
  assert.equal(await page.locator('#chapter-audio').evaluate(audio=>audio.loop),true);
  assert.deepEqual(await page.evaluate(()=>{
    const verse=document.querySelector('#ayah-1-1 .verse-audio'), word=document.querySelector('#word-audio'), chapter=document.querySelector('#chapter-audio');
    const counters={verse:0,word:0,chapter:0};
    for (const [name,audio] of Object.entries({verse,word,chapter})) audio.pause=()=>{counters[name]++};
    verse.dispatchEvent(new Event('play'));
    word.dispatchEvent(new Event('play'));
    chapter.dispatchEvent(new Event('play'));
    return counters;
  }),{verse:2,word:2,chapter:2});
  await page.locator('#surah-select').selectOption('2');
  await page.locator('#ayah-2-1').waitFor({state:'visible'});
  assert.equal(await page.locator('#chapter-audio').getAttribute('src'),null);
  assert.equal(await page.locator('#chapter-audio-area').isVisible(),false);
  await page.locator('[data-mode=arabic]').click();
  assert.match(await page.locator('#reading-flow').innerText(),/2:1/);
  await page.evaluate(()=>{Element.prototype.scrollIntoView=function(){window.resumeTarget=this.id;};});
  await page.locator('#resume-reading').click();
  await page.waitForFunction(()=>window.resumeTarget === 'reading-1-1');
  assert.equal(await page.locator('#reading-1-1').isVisible(),true);
  await page.locator('#surah-select').selectOption('2');
  await page.locator('#reading-2-1').waitFor({state:'visible'});
  delayedChapter = 1;
  await page.locator('#surah-select').selectOption('1');
  assert.equal(await page.locator('#chapter-title').innerText(),'Al-Fatihah');
  assert.equal((await page.locator('#reading-flow').innerText()).trim(),'','pending request cannot expose previous chapter text');
  releaseDelayed(); delayedChapter = 0;
  await page.locator('#reading-1-1').waitFor({state:'visible'});
  rejectChapter = 2;
  await page.locator('#surah-select').selectOption('2');
  await page.waitForFunction(()=>document.querySelector('#reader-status')?.textContent?.includes('could not load'));
  assert.equal((await page.locator('#reading-flow').innerText()).trim(),'','failed request cannot expose previous chapter text');
  rejectChapter = 0;
  await page.locator('#jump-unit').selectOption('juz');
  await page.locator('#jump-number').fill('1');
  await page.locator('#quran-jump button[type=submit]').click();
  await page.waitForURL(/\/quran\?chapter=1&page=1&ayah=1%3A1/);
  await page.locator('#reading-1-1').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+3),true,'390-pixel reader must not overflow');
  memberMode = 'unregistered';
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#reading-1-1').waitFor({state:'visible'});
  assert.equal(await page.locator('#resume-reading').isVisible(),false,'signed-in account must not inherit guest saved place');
  await page.locator('[data-mode=verse]').click();
  await page.locator('#ayah-1-1 .save-place').click();
  assert.match(await page.locator('#place-sync-status').innerText(),/Create an invited member profile/);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dd-quran-place')).key),'1:1');
  maliciousVerseKey = true;
  await page.locator('#translation-select').selectOption('');
  await page.locator('#retry-reader').waitFor({state:'visible'});
  assert.equal(await page.locator('#verses .verse-card').count(),0,'reject all malformed provider content');
  assert.equal(await page.evaluate(()=>Boolean(window.__quranKeyInjected)),false,'provider key cannot execute markup');
  maliciousVerseKey = false;
  await page.locator('#retry-reader').click();
  await page.locator('#ayah-1-1').waitFor({state:'visible'});
  assert(!requested.some(path=>path.startsWith('/api/study/') || path === '/study' || path.startsWith('/api/member/save')),'guest control cannot call private Gemini or member-write APIs');
  assert.deepEqual(failures,[],'no browser page errors');
  if (process.env.DD_QURAN_VISUAL_DIR) {
    memberMode = 'guest';
    await page.goto('https://dragondawwa.org/quran',{waitUntil:'domcontentloaded'});
    await page.locator('#ayah-1-1').waitFor({state:'visible'});
    await page.locator('.quran-banner-art img').evaluate(image=>image.decode());
    await page.screenshot({path:process.env.DD_QURAN_VISUAL_DIR+'/quran-mobile.png'});
    await page.setViewportSize({width:1440,height:950});
    await page.waitForFunction(()=>document.querySelector('.quran-banner-art img')?.currentSrc.endsWith('quran-banner-illumination-wide.webp') && document.querySelector('.quran-banner-art img')?.naturalWidth > 0);
    await page.locator('.quran-banner-art img').evaluate(image=>image.decode());
    await page.screenshot({path:process.env.DD_QURAN_VISUAL_DIR+'/quran-desktop.png'});
    await page.locator('#ayah-1-1').scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.DD_QURAN_VISUAL_DIR+'/quran-reading-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#ayah-1-1').scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.DD_QURAN_VISUAL_DIR+'/quran-reading-mobile.png'});
  }
  for (const locale of ['ta','si']) {
    await page.locator('#quran-language').selectOption(locale);
    assert.equal(await page.locator('.quran-banner-caption h1 br').count(),0,locale+' hero must not force a line break');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1),true,locale+' reader must not overflow its phone viewport');
    if (process.env.DD_QURAN_VISUAL_DIR) {
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:process.env.DD_QURAN_VISUAL_DIR+'/quran-'+locale+'-mobile.png'});
    }
  }
  console.log('PASS synthetic 390px Chromium: chapter context/audio, verse/continuous modes, script/word display, attributed copy/share, guest bookmark and private API isolation');
} finally { await browser.close(); }
