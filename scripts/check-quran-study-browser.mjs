// Optional local Chromium interaction test: synthetic provider data, no live credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = new URL('../public/', import.meta.url);
const file = name => readFile(new URL(name, root));
const catalog = {
  environment: 'production',
  chapters: [{ id: 1, name: 'Al-Fatihah', arabic: 'الفاتحة', verses: 7 }, { id: 2, name: 'Al-Baqarah', arabic: 'البقرة', verses: 286 }],
  translations: [{ id: 85, name: 'Named translation', author: 'Named translator', language: 'english' }],
  recitations: [{ id: 7, name: 'Named reciter' }],
  tafsirs: [{ id: 169, name: 'Named tafsir', author: 'Named commentator', language: 'english' }],
};
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem('dd-quran-bookmarks', JSON.stringify(['114_999'])));
  const requested = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    requested.push(url.pathname);
    if (url.pathname === '/quran/study') return route.fulfill({status:200,contentType:'text/html',body:(await file('quran-study.html')).toString().replace('<head>', '<head><meta name="dd-public-page" content="true">')});
    if (url.pathname === '/quran-study.js' || url.pathname === '/shared-nav.js') return route.fulfill({status:200,contentType:'text/javascript',body:await file(url.pathname.slice(1))});
    if (url.pathname === '/api/member/me') return route.fulfill({status:401,contentType:'application/json',body:'{"error":"sign_in_required"}'});
    if (url.pathname === '/api/quran/bootstrap') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)});
    if (url.pathname === '/api/quran/ayah') {
      const key = url.searchParams.get('key');
      const found = key === '2:255' || key === '1:1';
      assert(found, `only fixture keys are allowed: ${key}`);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        key, chapter: Number(key.split(':')[0]), chapterName: key === '1:1' ? 'Al-Fatihah' : 'Al-Baqarah',
        page: key === '1:1' ? 1 : 13, arabic: 'بِسْمِ ٱللَّهِ',
        translation: 'Source translation <sup>1</sup><script>window.scriptFromSource=true</script>',
        translationSource: catalog.translations[0],
        footnotes: [{id:'1',text:'Publisher note <strong>carefully attributed</strong><img src=x onerror="window.noteScript=true">'}], footnotesAvailable:true,
        tafsir: '<p>Commentary from source.</p><script>window.tafsirScript=true</script>',
        tafsirSource:catalog.tafsirs[0],tafsirAvailable:true,
        audio:'https://verses.quran.com/Alafasy/mp3/001001.mp3',reciter:catalog.recitations[0],
      })});
    }
    if (url.pathname.endsWith('.css')) return route.fulfill({status:200,contentType:'text/css',body:await file(url.pathname.slice(1))});
    if (url.pathname.endsWith('.svg')) return route.fulfill({status:200,contentType:'image/svg+xml',body:await file('assets/mark.svg')});
    return route.abort();
  });
  await page.goto('https://dragondawwa.org/quran/study?ayah=1%3A1&translation=85&recitation=7&tafsir=169', {waitUntil:'domcontentloaded'});
  await page.locator('#ayah-study').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dd-quran-bookmarks'))), []);
  await page.locator('[data-shared-menu]').click();
  assert.equal(await page.locator('#mobile-nav').isVisible(), true);
  assert.equal(await page.locator('#mobile-nav a[href="/study"]').count(), 0);
  await page.locator('[data-shared-menu]').click();
  assert.match(await page.locator('#ayah-heading').innerText(), /Al-Fatihah · 1:1/);
  assert.match(await page.locator('#ayah-arabic').innerText(), /بِسْمِ/);
  assert.match(await page.locator('#translation-credit').innerText(), /Named translator/);
  assert.match(await page.locator('#footnotes-content').innerText(), /carefully attributed/);
  assert.match(await page.locator('#tafsir-content').innerText(), /Commentary from source/);
  assert.equal(await page.evaluate(() => !!(window.scriptFromSource || window.noteScript || window.tafsirScript)), false);
  assert.match(await page.locator('#ayah-audio').getAttribute('src'), /^https:\/\/verses\.quran\.com\//);
  assert.equal(await page.locator('#ayah-audio').evaluate(node => node.autoplay), false);
  assert.match(await page.locator('#back-to-surah').getAttribute('href'), /\/quran\?chapter=1&page=1&ayah=1%3A1/);
  await page.locator('#save-place').click();
  assert.match(await page.locator('#place-status').innerText(), /Saved in this browser/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dd-quran-place')).key), '1:1');
  await page.locator('#toggle-bookmark').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dd-quran-bookmarks'))), ['1_1']);
  await page.locator('#quran-language').selectOption('ta');
  assert.match(await page.locator('#save-place').innerText(), /சேமிக்கப்பட்டது/);
  await page.locator('#ayah-key').fill('2:255');
  await page.locator('#ayah-find button[type="submit"]').click();
  await page.getByRole('heading',{name:/Al-Baqarah · 2:255/}).waitFor();
  assert.match(page.url(), /\/quran\/study\?ayah=2%3A255/);
  assert.match(await page.locator('#back-to-surah').getAttribute('href'), /chapter=2&page=13&ayah=2%3A255/);
  await page.locator('#toggle-bookmark').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dd-quran-bookmarks'))), ['2_255','1_1']);
  assert.equal(await page.locator('#bookmark-list li').count(), 2);
  await page.locator('#ayah-key').fill('999:999');
  await page.locator('#ayah-find button[type="submit"]').click();
  assert.equal(await page.locator('#ayah-study').isVisible(), false);
  assert.equal(await page.locator('#ayah-audio').getAttribute('src'), null);
  assert(!requested.some(path => path.startsWith('/api/study/') || path === '/study'), 'private Gemini Study was called');
  console.log('PASS synthetic Chromium: internal 1:1 → 2:255 reference, named source material, sanitized notes/tafsir, recitation, saved place, multi-bookmarks and Tamil controls; no private Gemini calls');
} finally { await browser.close(); }
