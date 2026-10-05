(() => {
  'use strict';
  const $ = id => document.getElementById(id), C = window.DD_QURAN_COPY;
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let language = ['en','ta','si'].includes(read('dd-language')) ? read('dd-language') : 'en';
  let catalogue, chapter = 1, page = 1, result, requestId = 0, saved = null, activeAudio = null;
  let statusKey = 'loading', placeStatusKey = '', memberState = 'unknown';
  function validPlace(place) {
    return place && Number.isInteger(place.chapter) && place.chapter >= 1 && place.chapter <= 114 &&
      Number.isInteger(place.page) && place.page >= 1 && place.page <= 15 &&
      typeof place.key === 'string' && /^\d{1,3}:\d{1,3}$/.test(place.key) &&
      Number(place.key.split(':')[0]) === place.chapter ? place : null;
  }
  async function restoreMemberPlace() {
    try {
      const response = await fetch('/api/member/me', {credentials:'same-origin',signal:AbortSignal.timeout(3000)});
      if (!response.ok) throw new Error('member_unavailable');
      const account = await response.json();
      memberState = account.registered ? 'registered' : 'unregistered';
      saved = validPlace(account.registered ? account.place : read('dd-quran-place'));
    } catch {
      // Do not display another browser user's local reading marker when account status is unknown.
      memberState = 'unknown'; saved = null;
    }
  }
  const t = key => C[key][['en','ta','si'].indexOf(language)];
  const audioCopy = {
    unavailable: ['Audio is unavailable right now. You can try it again without changing pages.', 'ஒலி தற்போது கிடைக்கவில்லை. பக்கத்தை மாற்றாமல் மீண்டும் முயற்சிக்கலாம்.', 'හඬ දැනට ලබාගත නොහැක. පිටු වෙනස් නොකර නැවත උත්සාහ කළ හැක.'],
    retry: ['Try audio again', 'ஒலியை மீண்டும் முயலுங்கள்', 'හඬ නැවත උත්සාහ කරන්න']
  };
  const audioText = key => audioCopy[key][['en','ta','si'].indexOf(language)] || audioCopy[key][0];
  function setStatus(key) {
    statusKey = key;
    $('reader-status').textContent = key ? t(key) : '';
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function setLanguage() {
    document.documentElement.lang = language; document.body.classList.remove('lang-en','lang-ta','lang-si'); document.body.classList.add('lang-' + language);
    $('quran-language').value = language;
    document.querySelectorAll('[data-q]').forEach(el => { el.innerHTML = t(el.dataset.q); });
    document.title = t('reader') + ' · Dragon Dawwa';
    $('quran-language').setAttribute('aria-label', {en:'Choose language',ta:'மொழியைத் தேர்ந்தெடுக்கவும்',si:'භාෂාව තෝරන්න'}[language]);
    setStatus(statusKey);
    $('place-sync-status').textContent = placeStatusKey ? t(placeStatusKey) : '';
    if (catalogue) { fillChoices(true); notices(); if (result) { stopAllAudio(); render(); } }
  }
  function option(id, name) { return '<option value="' + escape(id) + '">' + escape(name) + '</option>'; }
  function fillChoices(preserve) {
    const translation = $('translation-select').value, reciter = $('reciter-select').value;
    $('surah-select').innerHTML = catalogue.chapters.map(c => option(c.id, c.id + '. ' + c.name + ' · ' + c.arabic)).join('');
    $('surah-select').value = String(chapter);
    $('translation-select').innerHTML = option('', t('noTranslation')) + catalogue.translations.map(x => option(x.id, x.name + ' · ' + x.language)).join('');
    $('reciter-select').innerHTML = option('', t('noAudio')) + catalogue.recitations.map(x => option(x.id, x.name + (x.style ? ' · ' + x.style : ''))).join('');
    const names = {en:['english'],ta:['tamil'],si:['sinhala','sinhalese']}[language];
    const preferred = catalogue.translations.find(x => names.includes(x.language.toLowerCase())) || catalogue.translations.find(x => x.language.toLowerCase() === 'english');
    $('translation-select').value = preserve ? translation : String(preferred?.id || '');
    $('reciter-select').value = preserve ? reciter : String(catalogue.recitations.find(x => x.id === 7)?.id || catalogue.recitations[0]?.id || '');
    for (const id of ['surah-select','translation-select','reciter-select']) $(id).disabled = false;
  }
  function notices() {
    $('environment-note').hidden = false; $('environment-note').textContent = t(catalogue.environment === 'prelive' ? 'prelive' : 'live');
    const names = {en:['english'],ta:['tamil'],si:['sinhala','sinhalese']}[language];
    $('translation-note').textContent = t(catalogue.translations.some(x => names.includes(x.language.toLowerCase())) ? 'languageNote' : 'languageMissing');
    $('resume-reading').hidden = !saved || !catalogue.chapters.some(c => c.id === saved.chapter);
    $('resume-reading').textContent = t('resume') + (saved ? ' · ' + saved.key : '');
  }
  function stopAllAudio() {
    document.querySelectorAll('audio').forEach(audio => {
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
  async function api(path) {
    const response = await fetch('/api/quran/' + path, { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'provider_unavailable');
    return data;
  }
  function error(error) {
    setStatus(error.message === 'access_pending' ? 'access' : error.message === 'rate_limited' ? 'rate' : 'error');
    $('retry-reader').hidden = false; $('verses').setAttribute('aria-busy', 'false');
  }
  async function start() {
    setStatus('loading'); $('retry-reader').hidden = true;
    try { await restoreMemberPlace(); catalogue = await api('bootstrap'); chapter = catalogue.chapters[0].id; fillChoices(false); notices(); await load(); }
    catch (e) { error(e); }
  }
  async function load() {
    stopAllAudio();
    const id = ++requestId; result = null;
    $('verses').replaceChildren(); $('verses').setAttribute('aria-busy','true'); $('reader-pagination').hidden = true;
    setStatus('loading'); $('retry-reader').hidden = true;
    $('chapter-title').textContent = catalogue.chapters.find(c => c.id === chapter)?.name || '';
    const query = new URLSearchParams({ chapter:String(chapter), page:String(page) });
    if ($('translation-select').value) query.set('translation', $('translation-select').value);
    if ($('reciter-select').value) query.set('recitation', $('reciter-select').value);
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
  function render() {
    $('verses').replaceChildren(); $('verses').setAttribute('aria-busy','false'); setStatus(result.verses.length ? '' : 'empty');
    const translation = catalogue.translations.find(x => x.id === result.translation);
    for (const verse of result.verses) {
      const card = document.createElement('article'); card.className = 'verse-card'; card.id = 'ayah-' + verse.key.replace(':','-');
      card.innerHTML = '<div class="verse-heading"><span class="verse-key">' + escape(verse.key) + '</span><div class="verse-actions"><button class="save-place" type="button"></button><a href="https://quran.com/' + verse.key.replace(':','/') + '" target="_blank" rel="noopener noreferrer">' + t('source') + '</a></div></div><p class="verse-arabic notranslate" lang="ar" dir="rtl" translate="no"></p><div class="verse-translation notranslate" translate="no"></div>';
      card.querySelector('.verse-arabic').textContent = verse.arabic;
      const translated = card.querySelector('.verse-translation');
      if (translation) translated.lang = ({english:'en',tamil:'ta',sinhala:'si',sinhalese:'si'})[translation.language.toLowerCase()] || 'en';
      for (const text of verse.translations) translated.appendChild(translationNodes(text.text));
      if (translation && verse.translations.length) { const credit = document.createElement('p'); credit.className = 'translation-credit'; credit.textContent = translation.name + ' · ' + translation.language; card.appendChild(credit); }
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
          } else {
            write('dd-quran-place', marker);
            saved = marker;
            placeStatusKey = 'syncLocal';
          }
          document.querySelectorAll('.save-place').forEach(b=>{b.textContent=t('save');b.setAttribute('aria-pressed','false');});
          button.textContent=t('saved');button.setAttribute('aria-pressed','true');notices();
        } catch { placeStatusKey = 'syncError'; }
        finally { button.disabled = false; $('place-sync-status').textContent=t(placeStatusKey); }
      });
      if (verse.audio) {
        const audio = document.createElement('audio'); audio.controls = true; audio.autoplay = false; audio.preload = 'none'; audio.className = 'verse-audio'; audio.src = verse.audio; audio.setAttribute('aria-label',t('listen') + ' ' + verse.key);
        const audioState = document.createElement('p'); audioState.className = 'audio-status'; audioState.hidden = true; audioState.setAttribute('role','status');
        const retryAudio = document.createElement('button'); retryAudio.type = 'button'; retryAudio.className = 'small-button audio-retry'; retryAudio.hidden = true; retryAudio.textContent = audioText('retry');
        audio.addEventListener('play',()=>{
          document.querySelectorAll('audio').forEach(other=>{ if(other !== audio) { other.pause(); try { other.currentTime = 0; } catch {} } });
          activeAudio = audio; audioState.hidden = true; retryAudio.hidden = true;
        });
        audio.addEventListener('pause',()=>{ if (activeAudio === audio && audio.paused) activeAudio = null; });
        audio.addEventListener('error',()=>{ if (activeAudio === audio) activeAudio = null; audioState.textContent = audioText('unavailable'); audioState.hidden = false; retryAudio.hidden = false; });
        retryAudio.addEventListener('click',()=>{ audioState.hidden = true; retryAudio.hidden = true; audio.pause(); audio.load(); });
        card.append(audio, audioState, retryAudio);
      }
      $('verses').appendChild(card);
    }
    const p = result.pagination;
    $('reader-pagination').hidden = p.total <= 1; $('verses-prev').disabled = p.current <= 1; $('verses-next').disabled = !p.next;
    $('reader-page').textContent = t('page') + ' ' + p.current + ' ' + t('of') + ' ' + p.total;
  }
  $('quran-language').addEventListener('change',e=>{language=e.target.value;write('dd-language',language);setLanguage();});
  $('surah-select').addEventListener('change',e=>{chapter=Number(e.target.value);page=1;load();});
  for (const id of ['translation-select','reciter-select']) $(id).addEventListener('change',()=>load());
  $('verses-prev').addEventListener('click',()=>{if(page>1){page--;load();}});
  $('verses-next').addEventListener('click',()=>{if(result?.pagination.next){page=result.pagination.next;load();}});
  $('retry-reader').addEventListener('click',()=>catalogue?load():start());
  $('resume-reading').addEventListener('click',async()=>{if(!saved)return;chapter=saved.chapter;page=saved.page;$('surah-select').value=String(chapter);await load();document.getElementById('ayah-'+saved.key.replace(':','-'))?.scrollIntoView({block:'center'});});
  setLanguage(); start();
})();
