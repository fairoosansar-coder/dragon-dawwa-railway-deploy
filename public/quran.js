(() => {
  'use strict';
  const $ = id => document.getElementById(id), C = window.DD_QURAN_COPY;
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let language = ['en','ta','si'].includes(read('dd-language')) ? read('dd-language') : 'en';
  const storedView = read('dd-quran-reader') || {};
  let viewMode = ['verse','arabic','translation'].includes(storedView.view) ? storedView.view : 'verse';
  let arabicScript = ['uthmani','indopak','tajweed'].includes(storedView.script) ? storedView.script : 'uthmani';
  let fontSize = Number.isInteger(storedView.size) && storedView.size >= 26 && storedView.size <= 64 ? storedView.size : 44;
  let showWords = storedView.words === true, bookmarks = [], chapterInfoRequest = 0, chapterAudioRequest = 0;
  let catalogue, chapter = 1, page = 1, result, requestId = 0, saved = null, activeAudio = null;
  let statusKey = 'loading', placeStatusKey = '', memberState = 'unknown';
  const deepLink = new URLSearchParams(location.search);
  const initialAyah = /^([1-9]\d{0,2}):([1-9]\d{0,2})$/.test(deepLink.get('ayah') || '') ? deepLink.get('ayah') : null;
  function validPlace(place) {
    return place && Number.isInteger(place.chapter) && place.chapter >= 1 && place.chapter <= 114 &&
      Number.isInteger(place.page) && place.page >= 1 && place.page <= 15 &&
      typeof place.key === 'string' && /^\d{1,3}:\d{1,3}$/.test(place.key) &&
      Number(place.key.split(':')[0]) === place.chapter ? place : null;
  }
  async function restoreMemberPlace() {
    try {
      const response = await fetch('/api/member/me', {credentials:'same-origin',signal:AbortSignal.timeout(3000)});
      if (response.status === 401) {
        memberState = 'guest';
        saved = validPlace(read('dd-quran-place'));
        bookmarks = [...new Set((Array.isArray(read('dd-quran-bookmarks')) ? read('dd-quran-bookmarks') : []).filter(id => /^[1-9]\d{0,2}_[1-9]\d{0,2}$/.test(id)))].slice(0, 20);
        return;
      }
      if (!response.ok) throw new Error('member_unavailable');
      const account = await response.json();
      memberState = account.registered ? 'registered' : 'unregistered';
      // A signed-in account without a profile must not inherit a prior guest's
      // browser-local reading place, even on a shared device.
      saved = account.registered ? validPlace(account.place) : null;
      bookmarks = account.registered ? (account.saves || []).filter(item => item.kind === 'quran' && /^[1-9]\d{0,2}_[1-9]\d{0,2}$/.test(item.id)).map(item => item.id) : [];
    } catch {
      // Do not display another browser user's local reading marker when account status is unknown.
      memberState = 'unknown'; saved = null; bookmarks = [];
    }
  }
  const t = key => C[key][['en','ta','si'].indexOf(language)];
  const audioCopy = {
    unavailable: ['Audio is unavailable right now. You can try it again without changing pages.', 'ஒலி தற்போது கிடைக்கவில்லை. பக்கத்தை மாற்றாமல் மீண்டும் முயற்சிக்கலாம்.', 'හඬ දැනට ලබාගත නොහැක. පිටු වෙනස් නොකර නැවත උත්සාහ කළ හැක.'],
    retry: ['Try audio again', 'ஒலியை மீண்டும் முயலுங்கள்', 'හඬ නැවත උත්සාහ කරන්න']
  };
  const audioText = key => audioCopy[key][['en','ta','si'].indexOf(language)] || audioCopy[key][0];
  const bookmarkId = key => key.replace(':','_');
  function savePreferences() { write('dd-quran-reader', {view:viewMode,script:arabicScript,size:fontSize,words:showWords}); }
  function phoneArabicSize(size, small, normal, large) {
    return size <= 44 ? small + (size - 26) * (normal - small) / 18
      : normal + (size - 44) * (large - normal) / 20;
  }
  function applyPreferences() {
    document.body.dataset.readerMode = viewMode;
    document.body.dataset.arabicScript = arabicScript;
    $('mushaf-page').style.setProperty('--quran-arabic-size', fontSize + 'px');
    $('mushaf-page').style.setProperty('--quran-phone-flow-size', phoneArabicSize(fontSize,26,34,42).toFixed(2) + 'px');
    $('mushaf-page').style.setProperty('--quran-phone-verse-size', phoneArabicSize(fontSize,28,37,48).toFixed(2) + 'px');
    $('arabic-size').value = String(fontSize); $('arabic-size-value').textContent = fontSize + ' px';
    $('arabic-script').value = arabicScript; $('show-words').checked = showWords;
    $('verses').hidden = viewMode !== 'verse'; $('reading-flow').hidden = viewMode === 'verse';
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode === viewMode)));
  }
  function updateBookmarkButtons() {
    document.querySelectorAll('.bookmark-ayah').forEach(button => {
      const active = bookmarks.includes(bookmarkId(button.dataset.key));
      button.textContent = t(active ? 'removeBookmark' : 'bookmark');
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !['guest','registered'].includes(memberState);
      if (memberState === 'unregistered') button.title = t('bookmarkProfile');
    });
  }
  async function toggleBookmark(key, button, status) {
    const id = bookmarkId(key), active = bookmarks.includes(id);
    if (!['guest','registered'].includes(memberState)) { status.textContent = t('bookmarkProfile'); return; }
    button.disabled = true;
    try {
      if (memberState === 'registered') {
        const response = await fetch('/api/member/save', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:active?'remove':'add',kind:'quran',id})});
        if (!response.ok) throw new Error('bookmark_save_failed');
      } else {
        if (!active && bookmarks.length >= 20) throw new Error('bookmark_limit');
        localStorage.setItem('dd-quran-bookmarks',JSON.stringify(active ? bookmarks.filter(value => value !== id) : [id,...bookmarks]));
      }
      bookmarks = active ? bookmarks.filter(value => value !== id) : [id,...bookmarks.filter(value => value !== id)];
      status.textContent = t(memberState === 'guest' ? 'bookmarkLocal' : 'bookmarkAccount');
    } catch (error) { status.textContent = t(error.message === 'bookmark_limit' ? 'bookmarkLimit' : 'bookmarkError'); }
    finally { updateBookmarkButtons(); }
  }
  function setStatus(key) {
    statusKey = key;
    $('reader-status').textContent = key ? t(key) : '';
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function setLanguage(resetTranslation = false) {
    document.documentElement.lang = language; document.body.classList.remove('lang-en','lang-ta','lang-si'); document.body.classList.add('lang-' + language);
    $('quran-language').value = language;
    document.querySelectorAll('[data-q]').forEach(el => { el.innerHTML = t(el.dataset.q); });
    document.title = t('reader') + ' · Dragon Dawwa';
    $('quran-language').setAttribute('aria-label', {en:'Choose language',ta:'மொழியைத் தேர்ந்தெடுக்கவும்',si:'භාෂාව තෝරන්න'}[language]);
    setStatus(statusKey);
    $('place-sync-status').textContent = placeStatusKey ? t(placeStatusKey) : '';
    if (catalogue) { fillChoices(!resetTranslation, true); notices(); if (result && !resetTranslation) { stopAllAudio(); render(); } }
    applyPreferences();
  }
  function option(id, name) { return '<option value="' + escape(id) + '">' + escape(name) + '</option>'; }
  function fillChoices(preserveTranslation, preserveReciter = preserveTranslation) {
    const translation = $('translation-select').value, reciter = $('reciter-select').value;
    $('surah-select').innerHTML = catalogue.chapters.map(c => option(c.id, c.id + '. ' + c.name + ' · ' + c.arabic)).join('');
    $('surah-select').value = String(chapter);
    $('translation-select').innerHTML = option('', t('noTranslation')) + catalogue.translations.map(x => option(x.id, x.name + ' · ' + x.language)).join('');
    $('reciter-select').innerHTML = option('', t('noAudio')) + catalogue.recitations.map(x => option(x.id, x.name + (x.style ? ' · ' + x.style : ''))).join('');
    const names = {en:['english'],ta:['tamil'],si:['sinhala','sinhalese']}[language];
    const preferred = catalogue.translations.find(x => names.includes(x.language.toLowerCase())) || catalogue.translations.find(x => x.language.toLowerCase() === 'english');
    $('translation-select').value = preserveTranslation ? translation : String(preferred?.id || '');
    $('reciter-select').value = preserveReciter ? reciter : String(catalogue.recitations.find(x => x.id === 7)?.id || catalogue.recitations[0]?.id || '');
    const fullReciter = $('chapter-reciter-select').value;
    $('chapter-reciter-select').innerHTML = (catalogue.chapterReciters || []).map(x => option(x.id, x.name + (x.style ? ' · ' + x.style : ''))).join('');
    $('chapter-reciter-select').value = preserveReciter && (catalogue.chapterReciters || []).some(x => String(x.id) === fullReciter) ? fullReciter : String(catalogue.chapterReciters?.[0]?.id || '');
    for (const id of ['surah-select','translation-select','reciter-select']) $(id).disabled = false;
    $('chapter-listen').disabled = !(catalogue.chapterReciters || []).length;
    $('chapter-availability').hidden = !$('chapter-listen').disabled;
    $('chapter-availability').textContent = $('chapter-listen').disabled ? t('chapterAudioUnavailable') : '';
  }
  function notices() {
    $('environment-note').hidden = false; $('environment-note').textContent = t(catalogue.environment === 'prelive' ? 'prelive' : 'live');
    const names = {en:['english'],ta:['tamil'],si:['sinhala','sinhalese']}[language];
    $('translation-note').textContent = t(catalogue.translations.some(x => names.includes(x.language.toLowerCase())) ? 'languageNote' : 'languageMissing');
    $('resume-reading').hidden = !saved || !catalogue.chapters.some(c => c.id === saved.chapter);
    $('resume-reading').textContent = t('resume') + (saved ? ' · ' + saved.key : '');
  }
  function stopAllAudio() {
    document.querySelectorAll('#verses audio, #word-audio').forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
        // The old cards are about to be removed. Clearing the source prevents a
        // queued browser download from continuing across a reader transition.
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    });
    activeAudio = null;
  }
  function exclusiveAudio(audio) {
    document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
    activeAudio = audio;
    if (typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function')
      document.dispatchEvent(new CustomEvent('dd:audio-start',{detail:{source:'quran',audio}}));
  }
  if (typeof document.addEventListener === 'function')
    document.addEventListener('dd:audio-start',event=>{ if(event.detail?.source!=='quran') stopAllAudio(); });
  async function api(path) {
    const response = await fetch('/api/quran/' + path, { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'provider_unavailable');
    return data;
  }
  function error(error) {
    setStatus(error.message === 'not_configured' ? 'notConfigured' : error.message === 'access_pending' ? 'access' : error.message === 'rate_limited' ? 'rate' : 'error');
    $('retry-reader').hidden = false; $('verses').setAttribute('aria-busy', 'false');
  }
  async function start() {
    setStatus('loading'); $('retry-reader').hidden = true;
    try {
      await restoreMemberPlace(); catalogue = await api('bootstrap');
      if (memberState === 'guest') {
        bookmarks = bookmarks.filter(id => { const [c,v] = id.split('_').map(Number); return catalogue.chapters.some(item => item.id === c && v <= item.verses); });
        write('dd-quran-bookmarks',bookmarks);
      }
      const requested = Number(deepLink.get('chapter'));
      chapter = catalogue.chapters.some(c => c.id === requested) ? requested : catalogue.chapters[0].id;
      const requestedPage = Number(deepLink.get('page'));
      page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= Math.ceil((catalogue.chapters.find(c => c.id === chapter)?.verses || 1) / 20) ? requestedPage : 1;
      fillChoices(false); notices(); await load();
      if (initialAyah?.startsWith(chapter + ':')) $('' + (viewMode === 'verse' ? 'ayah-' : 'reading-') + initialAyah.replace(':','-'))?.scrollIntoView({block:'center'});
    }
    catch (e) { error(e); }
  }
  async function load() {
    stopAllAudio();
    const id = ++requestId; result = null;
    $('verses').replaceChildren(); $('verses').setAttribute('aria-busy','true'); $('reader-pagination').hidden = true;
    $('reading-flow').replaceChildren(); $('chapter-meta').textContent = ''; $('study-current').hidden = true;
    setStatus('loading'); $('retry-reader').hidden = true;
    $('chapter-title').textContent = catalogue.chapters.find(c => c.id === chapter)?.name || '';
    const query = new URLSearchParams({ chapter:String(chapter), page:String(page) });
    if ($('translation-select').value) query.set('translation', $('translation-select').value);
    if ($('reciter-select').value) query.set('recitation', $('reciter-select').value);
    if (arabicScript !== 'uthmani') query.set('script', arabicScript);
    if (showWords) query.set('words','1');
    try { const data = await api('verses?' + query); if (id !== requestId) return; result = data; render(); }
    catch (e) { if (id === requestId) error(e); }
  }
  function translationNodes(text) {
    const doc = new DOMParser().parseFromString(String(text), 'text/html');
    const allowed = new Set(['SUP','SUB','EM','STRONG','I','B','BR']);
    function clean(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      const fragment = document.createDocumentFragment();
      if (node.nodeType !== 1 || ['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName)) return fragment;
      const out = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : fragment;
      for (const child of node.childNodes) out.appendChild(clean(child));
      return out;
    }
    const out = document.createDocumentFragment(); for (const child of doc.body.childNodes) out.appendChild(clean(child)); return out;
  }
  function arabicNodes(verse) {
    const text = arabicScript === 'uthmani' ? verse.arabic : verse.scriptText;
    if (arabicScript !== 'tajweed') return document.createTextNode(text || verse.arabic);
    const source = new DOMParser().parseFromString(String(text || ''), 'text/html');
    function clean(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      const fragment = document.createDocumentFragment();
      if (node.nodeType !== 1 || ['SCRIPT','STYLE','IFRAME','OBJECT','SVG'].includes(node.tagName)) return fragment;
      const out = node.tagName === 'TAJWEED' ? document.createElement('span') : fragment;
      if (node.tagName === 'TAJWEED' && /^[a-z_]{1,32}$/.test(node.getAttribute('class') || ''))
        out.className = 'tajweed-' + node.getAttribute('class');
      for (const child of node.childNodes) out.appendChild(clean(child));
      return out;
    }
    const result = document.createDocumentFragment();
    for (const child of source.body.childNodes) result.appendChild(clean(child));
    return result;
  }
  function renderWordPanel(verse) {
    if (!showWords) return null;
    const details = document.createElement('details'); details.className = 'word-panel';
    const summary = document.createElement('summary'); summary.textContent = t('wordTitle'); details.append(summary);
    const words = (verse.words || []).filter(word => typeof word.text === 'string' && word.text && word.meaning);
    if (!words.length) { const notice = document.createElement('p'); notice.textContent = t('wordsUnavailable'); details.append(notice); return details; }
    const hint = document.createElement('p'); hint.className = 'small-note'; hint.textContent = t('meaningEnglish'); details.append(hint);
    const grid = document.createElement('div'); grid.className = 'word-grid';
    for (const word of words) {
      const item = document.createElement('div'); item.className = 'word-item';
      const arabic = document.createElement('b'); arabic.lang = 'ar'; arabic.dir = 'rtl'; arabic.className = 'notranslate'; arabic.translate = false; arabic.textContent = word.text;
      const meaning = document.createElement('span'); meaning.className = 'word-meaning'; meaning.textContent = word.meaning;
      item.append(arabic,meaning);
      if (word.transliteration) { const transliteration = document.createElement('small'); transliteration.textContent = word.transliteration; item.append(transliteration); }
      if (word.audio) {
        const play = document.createElement('button'); play.type = 'button'; play.className = 'word-play'; play.textContent = '▶'; play.setAttribute('aria-label',t('wordAudio') + ': ' + word.text);
        play.addEventListener('click',async()=>{
          const player = $('word-audio'); player.pause(); player.src = word.audio;
          try { await player.play(); } catch { $('settings-status').textContent = t('actionUnavailable'); }
        });
        item.append(play);
      }
      grid.append(item);
    }
    details.append(grid); return details;
  }
  function renderReadingFlow(translation) {
    const flow = $('reading-flow'); flow.replaceChildren();
    if (viewMode === 'verse' || !result) return;
    const heading = document.createElement('p'); heading.className = 'flow-attribution';
    heading.textContent = viewMode === 'arabic' ? 'Quran data provided by Quran Foundation' : translation ? [translation.name, translation.author, 'Quran Foundation'].filter(Boolean).join(' · ') : t('noTranslation');
    flow.append(heading);
    const body = document.createElement('div'); body.className = 'flow-body ' + (viewMode === 'arabic' ? 'flow-arabic' : 'flow-translation');
    body.lang = viewMode === 'arabic' ? 'ar' : ({english:'en',tamil:'ta',sinhala:'si',sinhalese:'si'})[translation?.language?.toLowerCase()] || 'en';
    if (viewMode === 'arabic') body.dir = 'rtl';
    body.translate = false;
    for (const verse of result.verses) {
      const line = document.createElement(viewMode === 'arabic' ? 'span' : 'p'); line.className = 'flow-line'; line.id = 'reading-' + verse.key.replace(':','-');
      const link = document.createElement('a'); link.href = studyHref(verse.key); link.className = 'flow-key'; link.textContent = verse.key; link.setAttribute('aria-label',t('sourceLink') + ' ' + verse.key);
      if (viewMode === 'arabic') { line.append(arabicNodes(verse),document.createTextNode('\u00a0'),link,document.createTextNode(' ')); }
      else { line.append(link,document.createTextNode(' ')); for (const item of verse.translations) line.append(translationNodes(item.text)); }
      body.append(line);
    }
    flow.append(body);
  }
  function studyHref(key) {
    const params = new URLSearchParams({ayah:key});
    if ($('translation-select').value) params.set('translation', $('translation-select').value);
    if ($('reciter-select').value) params.set('recitation', $('reciter-select').value);
    return '/quran/study?' + params;
  }
  function filterVisiblePage() {
    const query = $('quran-find-input').value.trim().toLocaleLowerCase();
    let shown = 0;
    document.querySelectorAll('#verses .verse-card').forEach(card => {
      const key = card.querySelector('.verse-key')?.textContent;
      const flow = key ? $('reading-' + key.replace(':','-')) : null;
      const match = !query || (viewMode === 'verse' ? card : flow)?.textContent.toLocaleLowerCase().includes(query);
      card.hidden = !match;
      if (flow) flow.hidden = !match;
      if (match) shown++;
      else card.querySelector('audio')?.pause();
    });
    $('quran-find-status').textContent = query ? (shown ? t('findCount') + ': ' + shown : t('findNone')) : '';
  }
  function render() {
    const sourceChapter = catalogue.chapters.find(item => item.id === chapter);
    if (!sourceChapter || !Array.isArray(result.verses) || result.verses.some(verse => {
      if (typeof verse?.key !== 'string' || !/^[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(verse.key)) return true;
      const [number, ayah] = verse.key.split(':').map(Number);
      return number !== chapter || ayah > sourceChapter?.verses;
    })) {
      result = null;
      $('verses').replaceChildren(); $('reading-flow').replaceChildren();
      $('verses').setAttribute('aria-busy','false'); $('reader-pagination').hidden = true; $('study-current').hidden = true;
      setStatus('error'); $('retry-reader').hidden = false;
      return;
    }
    $('verses').replaceChildren(); $('verses').setAttribute('aria-busy','false'); setStatus(result.verses.length ? '' : 'empty');
    const translation = catalogue.translations.find(x => x.id === result.translation);
    const chapterSource = catalogue.chapters.find(c => c.id === chapter);
    const first = result.verses[0];
    $('chapter-meta').textContent = [chapterSource?.arabic, chapterSource?.verses ? chapterSource.verses + ' ' + t('chapterVerses') : '', first ? t('firstShownAyah') + ' ' + first.key : '',
      first?.pageNumber ? t('mushafPage') + ' ' + first.pageNumber : '', first?.juzNumber ? t('juz') + ' ' + first.juzNumber : '',
      first?.hizbNumber ? t('hizb') + ' ' + first.hizbNumber : ''].filter(Boolean).join('  ·  ');
    if (arabicScript !== 'uthmani' && result.verses.some(v => !v.scriptAvailable || !/\p{Script=Arabic}/u.test(arabicNodes(v).textContent || ''))) {
      $('settings-status').textContent = t('scriptUnavailable'); arabicScript = 'uthmani'; savePreferences(); applyPreferences();
    }
    for (const verse of result.verses) {
      const card = document.createElement('article'); card.className = 'verse-card'; card.id = 'ayah-' + verse.key.replace(':','-');
      card.innerHTML = '<div class="verse-heading"><span class="verse-key">' + escape(verse.key) + '</span><div class="verse-actions"><button class="save-place" type="button"></button><button class="bookmark-ayah" data-key="' + escape(verse.key) + '" type="button"></button><a data-study-ayah href="' + escape(studyHref(verse.key)) + '">' + t('sourceLink') + '</a><details class="verse-more"><summary>' + t('moreActions') + '</summary><div class="verse-more-items"><button class="copy-ayah" type="button">' + t('copyVerse') + '</button><button class="share-ayah" type="button">' + t('shareVerse') + '</button><a href="' + escape(studyHref(verse.key)) + '#tafsir-section">' + t('tafsir') + '</a><a href="https://quran.com/' + escape(verse.key.replace(':','/')) + '" target="_blank" rel="noopener noreferrer">' + t('source') + '</a></div></details></div></div><p class="verse-arabic notranslate" lang="ar" dir="rtl" translate="no"></p><div class="verse-translation notranslate" translate="no"></div>';
      card.querySelector('.verse-arabic').append(arabicNodes(verse));
      const translated = card.querySelector('.verse-translation');
      if (translation) translated.lang = ({english:'en',tamil:'ta',sinhala:'si',sinhalese:'si'})[translation.language.toLowerCase()] || 'en';
      for (const text of verse.translations) translated.appendChild(translationNodes(text.text));
      if (translated.textContent.trim()) card.classList.add('has-translation');
      if (translation && verse.translations.length) { const credit = document.createElement('p'); credit.className = 'translation-credit'; credit.textContent = [translation.name,translation.author,translation.language,'Quran Foundation'].filter(Boolean).join(' · '); card.appendChild(credit); }
      const actionStatus = document.createElement('p'); actionStatus.className = 'verse-action-status'; actionStatus.setAttribute('role','status'); actionStatus.setAttribute('aria-live','polite');
      card.querySelector('.bookmark-ayah').addEventListener('click',event=>toggleBookmark(verse.key,event.currentTarget,actionStatus));
      card.querySelector('.copy-ayah').addEventListener('click',async()=>{
        const text = [verse.key,verse.arabic,translated.textContent,translation ? translation.name + ' · ' + (translation.author || translation.language) : '',
          'Quran data provided by Quran Foundation',location.origin + studyHref(verse.key)].filter(Boolean).join('\n');
        try { await navigator.clipboard.writeText(text); actionStatus.textContent = t('copiedVerse'); }
        catch { actionStatus.textContent = t('actionUnavailable'); }
      });
      card.querySelector('.share-ayah').addEventListener('click',async()=>{
        const url = location.origin + studyHref(verse.key);
        try {
          if (navigator.share) await navigator.share({title:'Dragon Dawwa · Qur’an ' + verse.key,url});
          else { await navigator.clipboard.writeText(url); actionStatus.textContent = t('shareCopied'); }
        } catch (error) { if (error.name !== 'AbortError') actionStatus.textContent = t('actionUnavailable'); }
      });
      const button = card.querySelector('.save-place');
      button.textContent = t(saved?.key === verse.key ? 'saved' : 'save'); button.setAttribute('aria-pressed', String(saved?.key === verse.key));
      button.addEventListener('click', async () => {
        const marker = {chapter, page, key:verse.key}; button.disabled = true;
        try {
          if (memberState === 'unknown') await restoreMemberPlace();
          if (memberState === 'unknown') throw new Error('account_unavailable');
          if (memberState === 'registered') {
            const response = await fetch('/api/member/place', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(marker)});
            const accountResult = await response.json().catch(() => null);
            if (!response.ok || !validPlace(accountResult?.place) || accountResult.place.key !== marker.key) throw new Error('account_save_failed');
            saved = accountResult.place;
            placeStatusKey = 'syncAccount';
          } else if (memberState === 'guest') {
            localStorage.setItem('dd-quran-place', JSON.stringify(marker));
            if (validPlace(read('dd-quran-place'))?.key !== marker.key) throw new Error('local_save_failed');
            saved = marker;
            placeStatusKey = 'syncLocal';
          } else {
            throw new Error('profile_required');
          }
          document.querySelectorAll('.save-place').forEach(b=>{b.textContent=t('save');b.setAttribute('aria-pressed','false');});
          button.textContent=t('saved');button.setAttribute('aria-pressed','true');notices();
        } catch (saveError) { placeStatusKey = saveError.message === 'profile_required' ? 'placeProfile' : 'syncError'; }
        finally { button.disabled = false; $('place-sync-status').textContent=t(placeStatusKey); }
      });
      if (verse.audio) {
        const audio = document.createElement('audio'); audio.controls = true; audio.autoplay = false; audio.preload = 'none'; audio.className = 'verse-audio'; audio.src = verse.audio; audio.setAttribute('aria-label',t('listen') + ' ' + verse.key);
        const audioState = document.createElement('p'); audioState.className = 'audio-status'; audioState.hidden = true; audioState.setAttribute('role','status');
        const retryAudio = document.createElement('button'); retryAudio.type = 'button'; retryAudio.className = 'small-button audio-retry'; retryAudio.hidden = true; retryAudio.textContent = audioText('retry');
        audio.addEventListener('play',()=>{
          exclusiveAudio(audio); audioState.hidden = true; retryAudio.hidden = true;
        });
        audio.addEventListener('pause',()=>{ if (activeAudio === audio && audio.paused) activeAudio = null; });
        audio.addEventListener('error',()=>{ if (activeAudio === audio) activeAudio = null; audioState.textContent = audioText('unavailable'); audioState.hidden = false; retryAudio.hidden = false; });
        retryAudio.addEventListener('click',()=>{ audioState.hidden = true; retryAudio.hidden = true; audio.pause(); audio.load(); });
        card.append(audio, audioState, retryAudio);
      }
      const wordPanel = renderWordPanel(verse); if (wordPanel) card.append(wordPanel);
      card.append(actionStatus);
      $('verses').appendChild(card);
    }
    const p = result.pagination;
    $('reader-pagination').hidden = p.total <= 1; $('verses-prev').disabled = p.current <= 1; $('verses-next').disabled = !p.next;
    $('reader-page').textContent = t('pagePart') + ' ' + p.current + ' ' + t('of') + ' ' + p.total;
    $('study-current').hidden = !result.verses.length;
    if (result.verses.length) $('study-current').href = studyHref(result.verses[0].key);
    updateBookmarkButtons(); renderReadingFlow(translation); applyPreferences();
    filterVisiblePage();
  }
  function stopChapterAudio() {
    chapterAudioRequest++;
    const audio = $('chapter-audio');
    audio.pause(); audio.removeAttribute('src'); audio.load();
    $('chapter-audio-area').hidden = true; $('chapter-audio-status').textContent = '';
  }
  async function loadChapterInfo() {
    if (!$('chapter-info').open || !catalogue) return;
    const id = ++chapterInfoRequest, selected = chapter;
    $('chapter-info-content').textContent = t('chapterInfoLoading'); $('chapter-info-credit').textContent = '';
    try {
      const data = await api('chapter?chapter=' + selected);
      if (id !== chapterInfoRequest || selected !== chapter) return;
      const text = new DOMParser().parseFromString(data.description || '', 'text/html').body.textContent?.trim() || '';
      if (data.available && text) {
        $('chapter-info-content').textContent = text;
        $('chapter-info-credit').textContent = [data.source,'Quran Foundation'].filter(Boolean).join(' · ');
      } else {
        showChapterCatalogueInfo(selected);
      }
    } catch { if (id === chapterInfoRequest && selected === chapter) showChapterCatalogueInfo(selected); }
  }
  function showChapterCatalogueInfo(selected) {
    const source = catalogue.chapters.find(item => item.id === selected);
    const facts = [source?.translatedName, source?.verses ? source.verses + ' ' + t('chapterVerses') : '',
      source?.revelationPlace ? t('revelationPlace') + ': ' + source.revelationPlace : ''].filter(Boolean);
    $('chapter-info-content').textContent = [t('chapterInfoUnavailable'), ...facts].join(' · ');
    $('chapter-info-credit').textContent = facts.length ? t('chapterCatalogueCredit') : '';
  }
  async function loadChapterAudio() {
    const reciter = $('chapter-reciter-select').value;
    if (!reciter || !catalogue?.chapterReciters?.some(x => String(x.id) === reciter)) return;
    const id = ++chapterAudioRequest, selected = chapter;
    const audio = $('chapter-audio'); audio.pause(); audio.removeAttribute('src'); audio.load();
    $('chapter-audio-status').textContent = t('chapterAudioLoading');
    try {
      const data = await api('chapter-audio?' + new URLSearchParams({chapter:String(selected),reciter}));
      if (id !== chapterAudioRequest || selected !== chapter) return;
      if (!data.available || !data.audio) throw new Error('chapter_audio_unavailable');
      const url = new URL(data.audio);
      if (url.protocol !== 'https:' || !['download.quranicaudio.com','verses.quran.com','verses.quran.foundation','mirrors.quranicaudio.com'].includes(url.hostname)) throw new Error('chapter_audio_invalid');
      audio.src = url.href; audio.loop = $('chapter-repeat').checked;
      $('chapter-audio-status').textContent = [data.reciter?.name,'Quran Foundation'].filter(Boolean).join(' · ');
    } catch { if (id === chapterAudioRequest) $('chapter-audio-status').textContent = t('chapterAudioUnavailable'); }
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click',()=>{
    viewMode = button.dataset.mode; savePreferences(); applyPreferences();
    if (result) { renderReadingFlow(catalogue.translations.find(x => x.id === result.translation)); filterVisiblePage(); }
  }));
  $('arabic-size').addEventListener('input', event => { fontSize = Number(event.target.value); savePreferences(); applyPreferences(); });
  $('arabic-script').addEventListener('change', event => {
    arabicScript = event.target.value; savePreferences(); applyPreferences(); if (catalogue) load();
  });
  $('show-words').addEventListener('change',event=>{
    showWords = event.target.checked;
    if (showWords) viewMode = 'verse';
    savePreferences(); applyPreferences(); if (catalogue) load();
  });
  $('reset-reader').addEventListener('click',()=>{
    const needsLoad = arabicScript !== 'uthmani' || showWords;
    viewMode = 'verse'; arabicScript = 'uthmani'; fontSize = 44; showWords = false;
    $('settings-status').textContent = ''; savePreferences(); applyPreferences();
    if (catalogue && needsLoad) load(); else if (result) { renderReadingFlow(catalogue.translations.find(x => x.id === result.translation)); filterVisiblePage(); }
  });
  $('chapter-info-toggle').addEventListener('click',()=>{ $('chapter-info').open = !$('chapter-info').open; $('chapter-info-toggle').setAttribute('aria-expanded',String($('chapter-info').open)); });
  $('chapter-info').addEventListener('toggle',()=>{ $('chapter-info-toggle').setAttribute('aria-expanded',String($('chapter-info').open)); if ($('chapter-info').open) loadChapterInfo(); });
  $('chapter-listen').addEventListener('click',()=>{
    if (!catalogue?.chapterReciters?.length) return;
    $('chapter-audio-area').hidden = !$('chapter-audio-area').hidden;
    if ($('chapter-audio-area').hidden) stopChapterAudio(); else loadChapterAudio();
  });
  $('chapter-reciter-select').addEventListener('change',loadChapterAudio);
  $('chapter-repeat').addEventListener('change',event=>{ $('chapter-audio').loop = event.target.checked; });
  $('chapter-audio').addEventListener('play',()=>exclusiveAudio($('chapter-audio')));
  $('word-audio').addEventListener('play',()=>exclusiveAudio($('word-audio')));
  $('chapter-audio').addEventListener('error',()=>{ $('chapter-audio-status').textContent = t('chapterAudioUnavailable'); });
  $('quran-language').addEventListener('change',e=>{
    const languageChanged = language !== e.target.value;
    language=e.target.value; write('dd-language',language); setLanguage(languageChanged);
    if (catalogue && languageChanged) load();
  });
  $('surah-select').addEventListener('change',e=>{
    chapter=Number(e.target.value);page=1;chapterInfoRequest++;$('chapter-info').open=false;stopChapterAudio();load();
  });
  for (const id of ['translation-select','reciter-select']) $(id).addEventListener('change',()=>load());
  $('verses-prev').addEventListener('click',()=>{if(page>1){page--;load();}});
  $('verses-next').addEventListener('click',()=>{if(result?.pagination.next){page=result.pagination.next;load();}});
  $('retry-reader').addEventListener('click',()=>catalogue?load():start());
  $('resume-reading').addEventListener('click',async()=>{if(!saved)return;chapter=saved.chapter;page=saved.page;$('surah-select').value=String(chapter);await load();document.getElementById((viewMode === 'verse' ? 'ayah-' : 'reading-')+saved.key.replace(':','-'))?.scrollIntoView({block:'center'});});
  $('quran-find').addEventListener('submit', event => {
    event.preventDefault();
    const query = $('quran-find-input').value.trim();
    if (/^[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(query)) { location.assign(studyHref(query)); return; }
    filterVisiblePage();
  });
  $('quran-find-input').addEventListener('input', filterVisiblePage);
  $('jump-unit').addEventListener('change',event=>{
    $('jump-number').max = String(({page:604,juz:30,hizb:60})[event.target.value] || 1);
    if (Number($('jump-number').value) > Number($('jump-number').max)) $('jump-number').value = '1';
    $('jump-status').textContent = '';
  });
  $('quran-jump').addEventListener('submit',async event=>{
    event.preventDefault();
    const unit = $('jump-unit').value, number = Number($('jump-number').value), max = ({page:604,juz:30,hizb:60})[unit];
    if (!max || !Number.isInteger(number) || number < 1 || number > max) { $('jump-status').textContent = t('jumpInvalid'); return; }
    const button = $('quran-jump').querySelector('button[type=submit]'); button.disabled = true;
    $('jump-status').textContent = t('jumpLoading');
    try {
      const match = await api('navigate?' + new URLSearchParams({unit,number:String(number)}));
      if (!/^\d{1,3}:\d{1,3}$/.test(match.key) || !catalogue.chapters.some(item=>item.id === match.chapter && Number(match.key.split(':')[1]) <= item.verses) || !Number.isInteger(match.page) || match.page < 1 || match.page > 15) throw new Error('location_unavailable');
      location.assign('/quran?' + new URLSearchParams({chapter:String(match.chapter),page:String(match.page),ayah:match.key}));
    } catch { $('jump-status').textContent = t('jumpUnavailable'); button.disabled = false; }
  });
  setLanguage(); start();
})();
