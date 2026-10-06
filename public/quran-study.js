(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = {
    back: ['← Return to the surah', '← ஸூராவிற்குத் திரும்பு', '← සූරාවට ආපසු යන්න'],
    eyebrow: ['READ · LISTEN · UNDERSTAND THE SOURCE', 'வாசிப்பு · செவிமடுப்பு · மூலம்', 'කියවීම · සවන්දීම · මූලාශ්‍රය'],
    title: ['Study this ayah.', 'இந்த ஆயத்தைப் படியுங்கள்.', 'මෙම ආයතය අධ්‍යයනය කරන්න.'],
    intro: ['Read a selected verse alongside named, provider-supplied material. This is not AI-generated religious advice.', 'தேர்ந்த ஆயத்தையும் மூலத்தில் பெயரிடப்பட்ட உரையையும் படியுங்கள். இது AI உருவாக்கிய சமய ஆலோசனை அல்ல.', 'තෝරාගත් ආයතය නම් කළ මූලාශ්‍ර සමඟ කියවන්න. මෙය AI ජනනය කළ ආගමික උපදෙස් නොවේ.'],
    findLabel: ['Find another ayah by reference (for example 2:255)', 'மற்றொரு ஆயத்தை எண்ணால் கண்டறிக (உதா. 2:255)', 'වෙනත් ආයතයක් අංකයෙන් සොයන්න (උදා. 2:255)'],
    find: ['Study ayah', 'ஆயத்தைப் படி', 'ආයතය අධ්‍යයනය කරන්න'],
    translationLabel: ['Translation', 'மொழிபெயர்ப்பு', 'පරිවර්තනය'],
    reciterLabel: ['Reciter', 'ஓதுபவர்', 'පාරායනය කරන්නා'],
    tafsirLabel: ['Tafsir', 'தஃப்ஸீர்', 'තෆ්සීර්'],
    originalSource: ['Original-source page ↗', 'மூலப் பக்கம் ↗', 'මුල් මූලාශ්‍ර පිටුව ↗'],
    save: ['Save reading place', 'வாசிப்பு இடத்தைச் சேமி', 'කියවීමේ ස්ථානය සුරකින්න'],
    saved: ['Saved reading place', 'வாசிப்பு இடம் சேமிக்கப்பட்டது', 'කියවීමේ ස්ථානය සුරකින ලදි'],
    resume: ['Return to saved ayah', 'சேமித்த ஆயத்திற்கு திரும்பு', 'සුරැකි ආයතයට ආපසු යන්න'],
    bookmarks: ['Bookmarks', 'புத்தகக்குறிகள்', 'පිටු සලකුණු'],
    bookmark: ['Bookmark this ayah', 'இந்த ஆயத்தைப் புத்தகக்குறியிடு', 'මෙම ආයතය සලකුණු කරන්න'],
    removeBookmark: ['Remove bookmark', 'புத்தகக்குறியை நீக்கு', 'පිටු සලකුණ ඉවත් කරන්න'],
    bookmarkLocal: ['Bookmarks are saved only in this browser.', 'புத்தகக்குறிகள் இந்த உலாவியில் மட்டுமே சேமிக்கப்படுகின்றன.', 'පිටු සලකුණු මෙම බ්‍රවුසරයේ පමණක් සුරැකේ.'],
    bookmarkAccount: ['Bookmarks are saved to your private member profile.', 'புத்தகக்குறிகள் தனியார் உறுப்பினர் சுயவிவரத்தில் சேமிக்கப்படுகின்றன.', 'පිටු සලකුණු ඔබේ පෞද්ගලික සාමාජික පැතිකඩට සුරැකේ.'],
    bookmarkProfile: ['Create an invited member profile to save account bookmarks.', 'கணக்கில் புத்தகக்குறிகளைச் சேமிக்க அழைக்கப்பட்ட உறுப்பினர் சுயவிவரத்தை உருவாக்குங்கள்.', 'ගිණුමේ පිටු සලකුණු සුරැකීමට ආරාධිත සාමාජික පැතිකඩක් සාදන්න.'],
    bookmarkError: ['Bookmark was not changed. Try again later.', 'புத்தகக்குறி மாறவில்லை. பின்னர் மீண்டும் முயலுங்கள்.', 'පිටු සලකුණ වෙනස් නොවීය. පසුව උත්සාහ කරන්න.'],
    bookmarkLimit: ['This browser can keep up to 20 guest bookmarks.', 'இந்த உலாவியில் விருந்தினர் புத்தகக்குறிகள் 20 வரை சேமிக்கலாம்.', 'මෙම බ්‍රවුසරයේ අමුත්තන්ගේ පිටු සලකුණු 20ක් දක්වා තබාගත හැක.'],
    footnotes: ['Translation footnotes', 'மொழிபெயர்ப்பு அடிக்குறிப்புகள்', 'පරිවර්තන පාදසටහන්'],
    tafsir: ['Tafsir', 'தஃப்ஸீர்', 'තෆ්සීර්'],
    sources: ['Sources and how this works', 'மூலங்களும் இது செயல்படும் விதமும்', 'මූලාශ්‍ර සහ මෙය ක්‍රියා කරන ආකාරය'],
    notice: ['Arabic Quran text, translations, footnotes and tafsir shown here come from Quran Foundation Content APIs, when the selected resource is available. A translation or commentary is a named interpretation and is not the Arabic Qur’an. No verse or scholarly text is machine-generated here.', 'இங்கு காட்டப்படும் அரபு உரை, மொழிபெயர்ப்பு, அடிக்குறிப்பு, தஃப்ஸீர் ஆகியவை கிடைக்கும் போது Quran Foundation இலிருந்து பெறப்படும். மொழிபெயர்ப்பும் விளக்கமும் அரபு அல்குர்ஆனுக்குச் சமம் அல்ல. இங்கு AI சமய உரையை உருவாக்குவதில்லை.', 'මෙහි අරාබි පාඨය, පරිවර්තන, පාදසටහන් සහ තෆ්සීර් ලබා ගත හැකි විට Quran Foundation වෙතින් ලැබේ. පරිවර්තනය හෝ විවරණය අරාබි අල් කුර්ආනය නොවේ. මෙහි AI ආගමික පාඨ ජනනය නොකරයි.'],
    privacy: ['Content loads through this site’s server; recitation plays from the source audio service. Saved places and bookmarks are not sent to Quran Foundation. An invited registered profile syncs one reading place and its bookmarks; guest bookmarks stay in this browser.', 'உள்ளடக்கம் இந்தத் தளத்தின் சேவையகம் வழியாக வருகிறது; ஓதல் ஒலி மூல ஒலிச் சேவையிலிருந்து வருகிறது. இடங்களும் புத்தகக்குறிகளும் Quran Foundation க்கு அனுப்பப்படுவதில்லை. உறுப்பினர் சுயவிவரம் ஒரு இடத்தையும் புத்தகக்குறிகளையும் ஒத்திசைக்கும்; விருந்தினர் குறிகள் இந்த உலாவியில் இருக்கும்.', 'අන්තර්ගතය මෙම අඩවියේ සේවාදායකය හරහා ලැබේ; පාරායනය මූලාශ්‍ර ශ්‍රව්‍ය සේවාවෙන් වාදනය වේ. සුරැකි ස්ථාන සහ පිටු සලකුණු Quran Foundation වෙත යවන්නේ නැත. ආරාධිත පැතිකඩක එක් ස්ථානයක් සහ පිටු සලකුණු සමමුහුර්ත වේ; අමුත්තන්ගේ සලකුණු බ්‍රවුසරයේ රැඳේ.'],
    loading: ['Loading from Quran Foundation…', 'Quran Foundation இலிருந்து பெறப்படுகிறது…', 'Quran Foundation වෙතින් ලබා ගනිමින්…'],
    noTranslation: ['Arabic only · no translation selected', 'அரபு மட்டும் · மொழிபெயர்ப்பு தேர்வில்லை', 'අරාබි පමණි · පරිවර්තනයක් තෝරා නැත'],
    noReciter: ['No recitation selected', 'ஓதல் தேர்வில்லை', 'පාරායනයක් තෝරා නැත'],
    noTafsir: ['No tafsir selected', 'தஃப்ஸீர் தேர்வில்லை', 'තෆ්සීර් තෝරා නැත'],
    missingTafsir: ['No tafsir catalogue is available for this connection.', 'இந்த இணைப்பில் தஃப்ஸீர் பட்டியல் கிடைக்கவில்லை.', 'මෙම සම්බන්ධතාවයට තෆ්සීර් ලැයිස්තුවක් නැත.'],
    invalid: ['That ayah reference is not in the connected Quran catalogue.', 'இந்த ஆயத் எண் இணைக்கப்பட்ட தொகுப்பில் இல்லை.', 'මෙම ආයත් අංකය සම්බන්ධිත එකතුවේ නැත.'],
    error: ['This ayah could not load from the provider. Try again here.', 'இந்த ஆயத்தை மூலத்திலிருந்து பெற முடியவில்லை. இங்கே மீண்டும் முயலுங்கள்.', 'මෙම ආයතය මූලාශ්‍රයෙන් පූරණය කළ නොහැක. මෙහි නැවත උත්සාහ කරන්න.'],
    emptyTranslation: ['No text was supplied for this selected translation.', 'இந்த மொழிபெயர்ப்பிற்கு உரை வழங்கப்படவில்லை.', 'තෝරාගත් පරිවර්තනයට පාඨයක් ලබා දී නැත.'],
    emptyNotes: ['No footnotes were supplied for this ayah and translation.', 'இந்த ஆயத் மற்றும் மொழிபெயர்ப்பிற்கு அடிக்குறிப்புகள் வழங்கப்படவில்லை.', 'මෙම ආයතය සහ පරිවර්තනයට පාදසටහන් ලබා දී නැත.'],
    notesUnavailable: ['The provider’s footnotes could not be loaded right now.', 'மூலத்தின் அடிக்குறிப்புகளை இப்போது பெற முடியவில்லை.', 'මූලාශ්‍රයේ පාදසටහන් දැන් පූරණය කළ නොහැක.'],
    notesPartial: ['Some referenced footnotes could not be loaded right now.', 'சுட்டப்பட்ட சில அடிக்குறிப்புகளை இப்போது பெற முடியவில்லை.', 'සඳහන් කළ සමහර පාදසටහන් දැන් පූරණය කළ නොහැක.'],
    emptyTafsir: ['No commentary was supplied for this ayah.', 'இந்த ஆயத்திற்கு விளக்கம் வழங்கப்படவில்லை.', 'මෙම ආයතයට විවරණයක් ලබා දී නැත.'],
    tafsirUnavailable: ['This named tafsir is unavailable for the selected ayah right now.', 'இந்த ஆயத்திற்கு தேர்ந்த தஃப்ஸீர் இப்போது கிடைக்கவில்லை.', 'තෝරාගත් ආයතයට මෙම තෆ්සීර් දැන් ලබාගත නොහැක.'],
    audioUnavailable: ['This recitation is unavailable right now.', 'இந்த ஓதல் ஒலி இப்போது கிடைக்கவில்லை.', 'මෙම පාරායනය දැන් ලබාගත නොහැක.'],
    retryAudio: ['Retry audio', 'ஒலியை மீண்டும் முயல்', 'හඬ නැවත උත්සාහ කරන්න'],
    syncLocal: ['Saved in this browser only.', 'இந்த உலாவியில் மட்டும் சேமிக்கப்பட்டது.', 'මෙම බ්‍රවුසරයේ පමණක් සුරකින ලදි.'],
    syncAccount: ['Saved to your private member profile.', 'தனியார் உறுப்பினர் சுயவிவரத்தில் சேமிக்கப்பட்டது.', 'ඔබේ පෞද්ගලික සාමාජික පැතිකඩට සුරකින ලදි.'],
    syncError: ['The place was not saved. Please try again later.', 'இடத்தைச் சேமிக்க முடியவில்லை. பிறகு மீண்டும் முயலுங்கள்.', 'ස්ථානය සුරැකිය නොහැකි විය. පසුව උත්සාහ කරන්න.'],
  };
  const index = () => ['en','ta','si'].indexOf(language);
  const t = key => copy[key]?.[index()] || copy[key]?.[0] || key;
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  let language = ['en','ta','si'].includes(read('dd-language')) ? read('dd-language') : 'en';
  let catalogue = null, data = null, key = new URLSearchParams(location.search).get('ayah') || '1:1';
  let saved = null, memberState = 'unknown', bookmarks = [], latest = 0, statusCode = 'loading';
  const validKey = value => typeof value === 'string' && /^[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(value);
  const validPlace = value => value && validKey(value.key) && Number(value.key.split(':')[0]) === value.chapter && Number.isInteger(value.page) && value.page >= 1 && value.page <= 15;
  function setStatus(code) { statusCode = code; $('study-status').textContent = code ? t(code) : ''; }
  function setLanguage() {
    document.documentElement.lang = language;
    document.body.classList.remove('lang-en','lang-ta','lang-si'); document.body.classList.add('lang-' + language);
    $('quran-language').value = language;
    document.querySelectorAll('[data-s]').forEach(node => { node.textContent = t(node.dataset.s); });
    document.title = t('title') + ' · Dragon Dawwa';
    setStatus(statusCode);
    if (data) render(data);
  }
  function cleanMarkup(html) {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    const allowed = new Set(['P','BR','H2','H3','EM','STRONG','I','B','SUP','SUB','UL','OL','LI','BLOCKQUOTE']);
    function clean(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      const fragment = document.createDocumentFragment();
      if (node.nodeType !== 1 || ['SCRIPT','STYLE','IFRAME','OBJECT','FORM','SVG'].includes(node.tagName)) return fragment;
      const out = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : fragment;
      for (const child of node.childNodes) out.appendChild(clean(child));
      return out;
    }
    const out = document.createDocumentFragment();
    for (const child of doc.body.childNodes) out.appendChild(clean(child));
    return out;
  }
  async function api(path) {
    const response = await fetch('/api/quran/' + path, {credentials:'same-origin'});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'provider_unavailable');
    return value;
  }
  async function memberPlace() {
    try {
      const response = await fetch('/api/member/me', {credentials:'same-origin',signal:AbortSignal.timeout(4000)});
      if (response.status === 401) {
        memberState = 'guest'; saved = validPlace(read('dd-quran-place')) ? read('dd-quran-place') : null;
        bookmarks = [...new Set((Array.isArray(read('dd-quran-bookmarks')) ? read('dd-quran-bookmarks') : []).filter(value => /^[1-9]\d{0,2}_[1-9]\d{0,2}$/.test(value)))].slice(0, 20);
        return;
      }
      if (!response.ok) throw new Error('member_unavailable');
      const member = await response.json();
      memberState = member.registered ? 'registered' : 'unregistered';
      saved = validPlace(member.registered ? member.place : read('dd-quran-place')) ? (member.registered ? member.place : read('dd-quran-place')) : null;
      bookmarks = member.registered ? (member.saves || []).filter(item => item.kind === 'quran' && /^[1-9]\d{0,2}_[1-9]\d{0,2}$/.test(item.id)).map(item => item.id) : [];
    } catch { memberState = 'unknown'; saved = null; bookmarks = []; }
  }
  function updateSaved() {
    $('save-place').textContent = t(saved?.key === key ? 'saved' : 'save');
    $('save-place').setAttribute('aria-pressed', String(saved?.key === key));
    $('resume-place').hidden = !saved;
    if (saved) $('resume-place').href = '/quran?' + new URLSearchParams({chapter:String(saved.chapter), page:String(saved.page), ayah:saved.key});
  }
  function bookmarkId(ayah) { return ayah.replace(':','_'); }
  async function changeBookmark(id, action) {
    if (memberState === 'registered') {
      const response = await fetch('/api/member/save', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,kind:'quran',id}),
      });
      if (!response.ok) throw new Error('bookmark_save_failed');
    } else if (memberState === 'guest') {
      if (action === 'add' && bookmarks.length >= 20) throw new Error('bookmark_limit');
      const next = action === 'add' ? [id,...bookmarks] : bookmarks.filter(value => value !== id);
      localStorage.setItem('dd-quran-bookmarks', JSON.stringify(next));
    } else throw new Error('profile_required');
    bookmarks = action === 'add' ? [id,...bookmarks.filter(value => value !== id)] : bookmarks.filter(value => value !== id);
    renderBookmarks();
  }
  function renderBookmarks() {
    const list = $('bookmark-list'); list.replaceChildren();
    for (const id of bookmarks) {
      const ayah = id.replace('_',':');
      const item = document.createElement('li');
      const link = document.createElement('a');
      const params = currentParams(); params.set('ayah', ayah);
      link.href = '/quran/study?' + params; link.textContent = ayah;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'small-button'; remove.textContent = t('removeBookmark') + ' ' + ayah;
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await changeBookmark(id, 'remove'); $('bookmark-status').textContent = t(memberState === 'guest' ? 'bookmarkLocal' : 'bookmarkAccount'); }
        catch { remove.disabled = false; $('bookmark-status').textContent = t('bookmarkError'); }
      });
      item.append(link, remove); list.append(item);
    }
    $('toggle-bookmark').disabled = !['guest','registered'].includes(memberState);
    $('toggle-bookmark').textContent = t(bookmarks.includes(bookmarkId(key)) ? 'removeBookmark' : 'bookmark');
    $('toggle-bookmark').setAttribute('aria-pressed', String(bookmarks.includes(bookmarkId(key))));
    if (memberState === 'unregistered') $('bookmark-status').textContent = t('bookmarkProfile');
  }
  function fillOptions() {
    const option = (id, name) => {
      const element = document.createElement('option'); element.value = String(id); element.textContent = name; return element;
    };
    const definitions = [
      ['translation-select', catalogue.translations, 'noTranslation', ['english','tamil','sinhala','sinhalese']],
      ['reciter-select', catalogue.recitations, 'noReciter', []],
      ['tafsir-select', catalogue.tafsirs || [], 'noTafsir', ['english']],
    ];
    const params = new URLSearchParams(location.search);
    for (const [id, list, empty, preferred] of definitions) {
      const select = $(id); select.replaceChildren(option('', t(empty)));
      list.forEach(resource => select.append(option(resource.id, resource.name + ' · ' + (resource.author || resource.language || resource.style || 'Quran Foundation'))));
      const chosen = params.get(id === 'reciter-select' ? 'recitation' : id.replace('-select',''));
      const found = list.find(x => String(x.id) === chosen);
      const preference = list.find(x => preferred.includes(x.language?.toLowerCase())) || list.find(x => x.id === 7) || list[0];
      select.value = String(found?.id || preference?.id || '');
      select.disabled = list.length === 0;
    }
    if (!(catalogue.tafsirs || []).length) $('tafsir-status').textContent = t('missingTafsir');
  }
  function currentParams() {
    const params = new URLSearchParams({ayah:key});
    for (const name of ['translation','recitation','tafsir']) {
      const select = $(name === 'recitation' ? 'reciter-select' : name + '-select');
      if (select.value) params.set(name, select.value);
    }
    return params;
  }
  function render(value) {
    $('ayah-study').hidden = false;
    $('ayah-heading').textContent = value.chapterName + ' · ' + value.key;
    $('ayah-arabic').textContent = value.arabic;
    $('ayah-translation').replaceChildren();
    if (value.translation) $('ayah-translation').append(cleanMarkup(value.translation));
    else $('ayah-translation').textContent = t('emptyTranslation');
    const noteLabels = new Set((value.footnotes || []).map(note => String(note.id)));
    $('ayah-translation').querySelectorAll('sup').forEach(sup => {
      const label = sup.textContent.trim();
      if (!/^\d{1,2}$/.test(label) || !noteLabels.has(label)) return;
      const link = document.createElement('a'); link.href = '#footnote-' + label;
      link.textContent = label; link.setAttribute('aria-label', t('footnotes') + ' ' + label);
      sup.replaceChildren(link);
    });
    const credit = value.translationSource;
    $('translation-credit').textContent = credit ? [credit.name, credit.author, credit.language, 'Quran Foundation'].filter(Boolean).join(' · ') : 'Quran Foundation · ' + t('noTranslation');
    $('original-source').href = 'https://quran.com/' + value.key.replace(':','/');
    $('back-to-surah').href = '/quran?' + new URLSearchParams({chapter:String(value.chapter),page:String(value.page),ayah:value.key});
    const audio = $('ayah-audio'); audio.pause(); audio.removeAttribute('src'); audio.load();
    $('audio-area').hidden = !value.audio;
    $('audio-retry').hidden = true; $('audio-status').hidden = true;
    if (value.audio) {
      audio.src = value.audio;
      audio.setAttribute('aria-label', t('reciterLabel') + ' · ' + value.key);
      $('reciter-credit').textContent = [value.reciter?.name, value.reciter?.style, 'Quran Foundation'].filter(Boolean).join(' · ');
    }
    $('footnotes-content').replaceChildren();
    for (const note of value.footnotes || []) {
      const item = document.createElement('p'); item.id = 'footnote-' + note.id;
      const number = document.createElement('strong'); number.textContent = note.id + '. ';
      item.append(number, cleanMarkup(note.text)); $('footnotes-content').append(item);
    }
    $('footnotes-status').textContent = value.translationSource ?
      (value.footnotesIncomplete ? t(value.footnotes?.length ? 'notesPartial' : 'notesUnavailable') : value.footnotes?.length ? '' : t(value.footnotesAvailable ? 'emptyNotes' : 'notesUnavailable')) : t('noTranslation');
    $('tafsir-content').replaceChildren();
    if (value.tafsir) $('tafsir-content').append(cleanMarkup(value.tafsir));
    $('tafsir-credit').textContent = value.tafsirSource ? [value.tafsirSource.name, value.tafsirSource.author, value.tafsirSource.language, 'Quran Foundation'].filter(Boolean).join(' · ') : '';
    $('tafsir-status').textContent = value.tafsir ? '' : t(value.tafsirSource ? (value.tafsirAvailable ? 'emptyTafsir' : 'tafsirUnavailable') : catalogue.tafsirCatalogueAvailable === false ? 'missingTafsir' : 'noTafsir');
    updateSaved();
    renderBookmarks();
  }
  async function load() {
    const id = ++latest;
    const audio = $('ayah-audio'); audio.pause(); audio.removeAttribute('src'); audio.load();
    $('audio-area').hidden = true;
    data = null; $('ayah-study').hidden = true; $('bookmark-status').textContent = ''; setStatus('loading');
    if (!validKey(key) || !catalogue.chapters.some(chapter => chapter.id === Number(key.split(':')[0]) && Number(key.split(':')[1]) <= chapter.verses)) { setStatus('invalid'); return; }
    history.replaceState(null, '', '/quran/study?' + currentParams());
    try {
      const request = currentParams(); request.delete('ayah'); request.set('key', key);
      const value = await api('ayah?' + request);
      if (id !== latest) return;
      data = value; setStatus(''); render(value);
    } catch (error) { if (id === latest) setStatus(error.message === 'invalid_request' || error.message === 'unavailable_resource' ? 'invalid' : 'error'); }
  }
  async function start() {
    setLanguage();
    await memberPlace();
    try {
      catalogue = await api('bootstrap');
      if (memberState === 'guest') {
        bookmarks = bookmarks.filter(id => {
          const [chapter, verse] = id.split('_').map(Number);
          return catalogue.chapters.some(item => item.id === chapter && verse <= item.verses);
        });
        try { localStorage.setItem('dd-quran-bookmarks', JSON.stringify(bookmarks)); } catch {}
      }
      fillOptions(); $('ayah-key').value = key; await load();
    }
    catch { setStatus('error'); }
  }
  $('ayah-find').addEventListener('submit', event => { event.preventDefault(); key = $('ayah-key').value.trim(); load(); });
  for (const id of ['translation-select','reciter-select','tafsir-select']) $(id).addEventListener('change', load);
  $('quran-language').addEventListener('change', event => {
    language = event.target.value;
    try { localStorage.setItem('dd-language', JSON.stringify(language)); } catch {}
    setLanguage(); if (catalogue) fillOptions();
  });
  $('save-place').addEventListener('click', async () => {
    if (!data) return;
    const marker = {chapter:data.chapter,page:data.page,key:data.key};
    $('save-place').disabled = true;
    try {
      if (memberState === 'unknown') await memberPlace();
      if (memberState === 'unknown') throw new Error('member_unavailable');
      if (memberState === 'registered') {
        const response = await fetch('/api/member/place', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(marker)});
        const result = await response.json().catch(() => null);
        if (!response.ok || !validPlace(result?.place) || result.place.key !== marker.key) throw new Error('save_failed');
        saved = result.place; $('place-status').textContent = t('syncAccount');
      } else {
        localStorage.setItem('dd-quran-place', JSON.stringify(marker)); saved = marker; $('place-status').textContent = t('syncLocal');
      }
      updateSaved();
    } catch { $('place-status').textContent = t('syncError'); }
    finally { $('save-place').disabled = false; }
  });
  $('toggle-bookmark').addEventListener('click', async () => {
    if (!data) return;
    const id = bookmarkId(data.key), action = bookmarks.includes(id) ? 'remove' : 'add';
    $('toggle-bookmark').disabled = true;
    try { await changeBookmark(id, action); $('bookmark-status').textContent = t(memberState === 'guest' ? 'bookmarkLocal' : 'bookmarkAccount'); }
    catch (error) { $('bookmark-status').textContent = t(error.message === 'bookmark_limit' ? 'bookmarkLimit' : 'bookmarkError'); }
    finally { $('toggle-bookmark').disabled = !['guest','registered'].includes(memberState); }
  });
  $('ayah-audio').addEventListener('error', () => { $('audio-status').textContent = t('audioUnavailable'); $('audio-status').hidden = false; $('audio-retry').hidden = false; });
  $('audio-retry').addEventListener('click', () => { $('audio-status').hidden = true; $('audio-retry').hidden = true; $('ayah-audio').load(); });
  start();
})();
