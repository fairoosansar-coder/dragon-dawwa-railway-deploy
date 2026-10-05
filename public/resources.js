(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const categories = [
    'Getting started with Quran study',
    'Finding source references',
    'Everyday learning and good character',
    'Family and community learning',
    'New Muslim learning resources',
    'Local community information',
  ];
  const words = {
    en: {
      skip: 'Skip to content', eyebrow: 'ORIGINAL PUBLISHERS · LINK-ONLY', heading: 'External learning resources',
      intro: 'Starting points from their original publishers. These are curated outbound links, not Dragon Dawwa-authored lessons, scholarly reviews, endorsements or copied works.',
      boundary: 'Read each source in its own context. We list only verified language and format details; summaries are original descriptions written for navigation. Any new religious explanations or translations require separate human editorial review before publication.',
      editorialLink: 'See separately reviewed editorial readings', memberLink: 'My learning and saved resources', searchLabel: 'Search resource, publisher or topic',
      themeLabel: 'Theme', allThemes: 'All themes', sourceLanguageLabel: 'Original-source language', allLanguages: 'All listed languages', clear: 'Clear filters', retry: 'Try again', previous: 'Previous', next: 'Next', footer: 'Curated links only · copyrights belong to the original publishers',
      type: 'External resource · curated link', source: 'Visit original publisher', save: 'Save to My Learning', remove: 'Remove saved resource', register: 'Create an invited member profile to save', unavailable: 'Sources are unavailable right now. Try again.', noResults: 'No resources match this search. Change a filter or search term.', loading: 'Checking reviewed-source catalogue…', count: n => `${n} curated external resource${n === 1 ? '' : 's'}`, page: (n, total) => `Page ${n} of ${total}`, saved: 'Saved across your signed-in devices.', removed: 'Removed from My Learning.', error: 'Could not save. Check member access and retry.', rights: 'Link only; rights stay with the original publisher.', languageNotice: 'The original publisher’s language is shown below. This English summary is not a translated religious lesson.', saveEligible: 'Save eligibility checked by the server.', saveUnavailable: 'This resource is not currently eligible to save.',
      themes: ['Getting started with Quran study','Finding source references','Everyday learning and good character','Family and community learning','New Muslim learning resources','Local community information'],
    },
    ta: {
      skip: 'உள்ளடக்கத்திற்குச் செல்லவும்', eyebrow: 'மூல வெளியீட்டாளர்கள் · இணைப்புகள் மட்டும்', heading: 'வெளிப்புறக் கற்றல் வளங்கள்',
      intro: 'மூல வெளியீட்டாளர்களிடம் உள்ள தொடக்க வளங்களுக்கான இணைப்புகள். இவை Dragon Dawwa எழுதிய பாடங்களோ அறிஞர் மதிப்பாய்வுகளோ அங்கீகாரங்களோ நகலெடுக்கப்பட்ட படைப்புகளோ அல்ல.',
      boundary: 'ஒவ்வொரு வளத்தையும் அதன் சூழலில் வாசியுங்கள். உறுதிப்படுத்தப்பட்ட மொழி மற்றும் வடிவ விவரங்கள் மட்டுமே குறிப்பிடப்பட்டுள்ளன. புதிய மார்க்க விளக்கங்கள் அல்லது மொழிபெயர்ப்புகள் வெளியிடுவதற்கு முன் தனியான மனித மதிப்பாய்வு தேவை.',
      editorialLink: 'தனியாக மதிப்பாய்வு செய்யப்பட்ட கட்டுரைகள்', memberLink: 'என் கற்றலும் சேமித்த வளங்களும்', searchLabel: 'வளம், வெளியீட்டாளர் அல்லது தலைப்பைத் தேடுங்கள்',
      themeLabel: 'தலைப்பு', allThemes: 'எல்லா தலைப்புகளும்', sourceLanguageLabel: 'மூல மொழி', allLanguages: 'பட்டியலிலுள்ள எல்லா மொழிகளும்', clear: 'வடிகட்டிகளை நீக்குக', retry: 'மீண்டும் முயலுங்கள்', previous: 'முந்தையது', next: 'அடுத்தது', footer: 'இணைப்புகள் மட்டும் · பதிப்புரிமை மூல வெளியீட்டாளர்களுக்கே',
      type: 'வெளிப்புற வளம் · தேர்ந்தெடுத்த இணைப்பு', source: 'மூல வெளியீட்டாளரிடம் வாசிக்கவும்', save: 'என் கற்றலில் சேமிக்கவும்', remove: 'சேமித்த வளத்தை நீக்குக', register: 'சேமிக்க அழைக்கப்பட்ட உறுப்பினர் பதிவை உருவாக்கவும்', unavailable: 'வளங்கள் இப்போது கிடைக்கவில்லை. மீண்டும் முயலுங்கள்.', noResults: 'இந்தத் தேடலுக்கு வளங்கள் இல்லை. வேறு சொல்லையோ வடிகட்டியையோ முயலுங்கள்.', loading: 'மூல வளப் பட்டியலைச் சரிபார்க்கிறோம்…', count: n => `${n} வெளிப்புற வளங்கள்`, page: (n, total) => `பக்கம் ${n} / ${total}`, saved: 'உங்கள் கணக்கின் சாதனங்களில் சேமிக்கப்பட்டது.', removed: 'என் கற்றலிலிருந்து நீக்கப்பட்டது.', error: 'சேமிக்க முடியவில்லை. உறுப்பினர் அணுகலைச் சரிபார்க்கவும்.', rights: 'இணைப்பு மட்டும்; உரிமைகள் மூல வெளியீட்டாளருக்கே.', languageNotice: 'மூல வெளியீட்டாளரின் மொழி கீழே காணலாம். ஆங்கிலச் சுருக்கம் மொழிபெயர்க்கப்பட்ட மார்க்கப் பாடம் அல்ல.',
      themes: ['குர்ஆன் படிப்பைத் தொடங்குதல்','ஆதாரக் குறிப்புகளைக் கண்டறிதல்','அன்றாடக் கற்றலும் நல்ல பண்பும்','குடும்ப மற்றும் சமூகக் கற்றல்','புதிய முஸ்லிம்களுக்கான வளங்கள்','உள்ளூர் சமூகத் தகவல்'],
    },
    si: {
      skip: 'අන්තර්ගතයට යන්න', eyebrow: 'මුල් ප්‍රකාශකයන් · සබැඳි පමණි', heading: 'බාහිර ඉගෙනුම් සම්පත්',
      intro: 'මුල් ප්‍රකාශකයන්ගේ ආරම්භක සම්පත් වෙත සබැඳි. මේවා Dragon Dawwa ලියූ පාඩම්, විද්වත් සමාලෝචන, අනුමත කිරීම් හෝ පිටපත් නොවේ.',
      boundary: 'සෑම මූලාශ්‍රයක්ම එහි මුල් සන්දර්භය තුළ කියවන්න. තහවුරු වූ භාෂා සහ ආකෘති පමණක් දක්වා ඇත. නව ආගමික විවරණ හෝ පරිවර්තන ප්‍රකාශයට පෙර වෙනම මානව සමාලෝචනයක් අවශ්‍ය වේ.',
      editorialLink: 'වෙනම සමාලෝචිත ලිපි බලන්න', memberLink: 'මගේ ඉගෙනුම සහ සුරකින ලද සම්පත්', searchLabel: 'සම්පත, ප්‍රකාශකයා හෝ මාතෘකාව සොයන්න',
      themeLabel: 'මාතෘකාව', allThemes: 'සියලු මාතෘකා', sourceLanguageLabel: 'මුල් මූලාශ්‍ර භාෂාව', allLanguages: 'සියලු ලැයිස්තුගත භාෂා', clear: 'පෙරහන් ඉවත් කරන්න', retry: 'නැවත උත්සාහ කරන්න', previous: 'පෙර', next: 'ඊළඟ', footer: 'සබැඳි පමණි · හිමිකම් මුල් ප්‍රකාශකයන් සතුය',
      type: 'බාහිර සම්පත · තෝරාගත් සබැඳිය', source: 'මුල් ප්‍රකාශකයා වෙත යන්න', save: 'මගේ ඉගෙනුමට සුරකින්න', remove: 'සුරකින සම්පත ඉවත් කරන්න', register: 'සුරැකීමට ආරාධිත සාමාජික පැතිකඩක් සාදන්න', unavailable: 'සම්පත් දැනට ලබාගත නොහැක. නැවත උත්සාහ කරන්න.', noResults: 'මෙම සෙවුමට සම්පත් හමු නොවීය. වෙනත් වචනයක් හෝ පෙරහනක් යොදන්න.', loading: 'මුල් සම්පත් ලැයිස්තුව පරීක්ෂා කරමින්…', count: n => `බාහිර සම්පත් ${n}`, page: (n, total) => `පිටුව ${n} / ${total}`, saved: 'ඔබගේ ගිණුමේ උපාංග අතර සුරකින ලදි.', removed: 'මගේ ඉගෙනුමෙන් ඉවත් කළා.', error: 'සුරැකිය නොහැකි විය. සාමාජික ප්‍රවේශය පරීක්ෂා කර නැවත උත්සාහ කරන්න.', rights: 'සබැඳියක් පමණි; අයිතිය මුල් ප්‍රකාශකයා සතුය.', languageNotice: 'මුල් ප්‍රකාශකයාගේ භාෂාව පහත දැක්වේ. ඉංග්‍රීසි සාරාංශය පරිවර්තනය කළ ආගමික පාඩමක් නොවේ.',
      themes: ['කුර්ආනය අධ්‍යයනය ආරම්භ කිරීම','මූලාශ්‍ර යොමු සොයාගැනීම','දෛනික ඉගෙනුම සහ යහපත් චරිතය','පවුල් සහ ප්‍රජා ඉගෙනුම','නව මුස්ලිම්වරුන්ට සම්පත්','ප්‍රාදේශීය ප්‍රජා තොරතුරු'],
    },
  };
  const validLanguages = new Set(['en','ta','si']);
  function language() {
    try { const stored = JSON.parse(localStorage.getItem('dd-language')); return validLanguages.has(stored) ? stored : 'en'; }
    catch { return 'en'; }
  }
  const state = { items: [], registered: false, saved: new Set(), page: 1, loading: false };
  const take = () => words[language()] || words.en;
  function notify(message, isError = false) { $('resource-status').textContent = message; $('resource-status').classList.toggle('error', isError); }
  function categoryLabel(category) {
    const index = categories.indexOf(category);
    return index < 0 ? category : take().themes[index];
  }
  function localize() {
    const copy = take();
    document.documentElement.lang = language();
    document.querySelectorAll('[data-resource-copy]').forEach(node => { node.textContent = copy[node.dataset.resourceCopy] || words.en[node.dataset.resourceCopy]; });
    $('resource-search').setAttribute('aria-label', copy.searchLabel);
    $('resource-theme').setAttribute('aria-label', copy.themeLabel);
    $('source-language').setAttribute('aria-label', copy.sourceLanguageLabel);
    for (const option of $('resource-theme').options) if (option.value) option.textContent = categoryLabel(option.value);
    render();
  }
  function add(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = String(value);
    return element;
  }
  function itemIsSaved(item) { return state.saved.has(item.id); }
  async function save(item, feedback, button) {
    if (item.saveEligible !== true) { feedback.textContent = take().saveUnavailable || words.en.saveUnavailable; return; }
    if (!state.registered) { location.href = '/member'; return; }
    const action = itemIsSaved(item) ? 'remove' : 'add';
    button.disabled = true;
    try {
      const response = await fetch('/api/member/save', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, kind: 'external', id: item.id}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'save_failed');
      if (action === 'add') state.saved.add(item.id); else state.saved.delete(item.id);
      button.textContent = itemIsSaved(item) ? take().remove : take().save;
      button.setAttribute('aria-pressed', String(itemIsSaved(item)));
      feedback.textContent = action === 'add' ? take().saved : take().removed;
    } catch { feedback.textContent = take().error; }
    finally { button.disabled = false; }
  }
  function renderCard(item) {
    const copy = take();
    const card = add('article','resource-entry');
    card.append(add('p','resource-type',copy.type));
    card.append(add('p','resource-category',categoryLabel(item.category)));
    card.append(add('h2','',item.title));
    card.append(add('p','resource-summary',item.summary));
    if (language() !== 'en') card.append(add('p','resource-language-note',copy.languageNotice));
    card.append(add('p','resource-meta',`${item.publisher} · ${item.format} · ${(item.languages || []).join(', ')}`));
    card.append(add('p','resource-eligibility',item.saveEligible === true ? (copy.saveEligible || words.en.saveEligible) : (copy.saveUnavailable || words.en.saveUnavailable)));
    card.append(add('p','resource-rights',copy.rights));
    const row = add('div','resource-actions');
    const external = add('a','',copy.source);
    external.href = item.url;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    row.append(external);
    const button = add('button','',state.registered ? (itemIsSaved(item) ? copy.remove : copy.save) : copy.register);
    button.type = 'button';
    button.disabled = item.saveEligible !== true;
    button.setAttribute('aria-label',`${button.textContent}: ${item.title}`);
    button.setAttribute('aria-pressed',String(state.registered && itemIsSaved(item)));
    const feedback = add('p','resource-feedback');
    feedback.setAttribute('role','status');
    button.addEventListener('click', () => save(item, feedback, button));
    row.append(button);
    card.append(row,feedback);
    return card;
  }
  function render() {
    const copy = take();
    const query = $('resource-search').value.trim().toLocaleLowerCase();
    const theme = $('resource-theme').value;
    const sourceLanguage = $('source-language').value;
    const filtered = state.items.filter(item => (!theme || item.category === theme) &&
      (!sourceLanguage || item.languages.some(value => value.toLocaleLowerCase() === sourceLanguage)) &&
      (!query || [item.title,item.publisher,item.category,item.summary].join(' ').toLocaleLowerCase().includes(query)));
    const pages = Math.max(1, Math.ceil(filtered.length / 6));
    state.page = Math.min(state.page, pages);
    $('resource-list').replaceChildren(...filtered.slice((state.page - 1) * 6, state.page * 6).map(renderCard));
    if (!filtered.length && state.items.length) $('resource-list').append(add('p','editorial-note',copy.noResults));
    $('resource-page').textContent = copy.page(state.page,pages);
    $('resource-prev').disabled = state.page < 2;
    $('resource-next').disabled = state.page >= pages;
    if (!state.loading && state.items.length) notify(copy.count(filtered.length));
  }
  async function load() {
    state.loading = true;
    notify(take().loading);
    $('resource-retry').hidden = true;
    try {
      const response = await fetch('/api/resources?page=1&pageSize=100', {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}});
      if (!response.ok) throw new Error('catalogue_unavailable');
      const catalogue = await response.json();
      const items = Array.isArray(catalogue.items) ? catalogue.items : [];
      state.items = items.filter(item => {
        if (item.saveEligible !== true || !categories.includes(item.category) || !Array.isArray(item.languages) || !item.languages.length || typeof item.summary !== 'string') return false;
        try { const url = new URL(item.url), publisher = new URL(item.publisherUrl); return url.protocol === 'https:' && publisher.protocol === 'https:' && !url.username && !url.password && !publisher.username && !publisher.password; }
        catch { return false; }
      });
      const knownLanguages = [...new Set(state.items.flatMap(item => item.languages.map(value => String(value).toLocaleLowerCase())))].sort();
      $('resource-theme').replaceChildren($('resource-theme').options[0], ...categories.map((category,index) => {
        const option = new Option(take().themes[index],category); return option;
      }));
      $('source-language').replaceChildren($('source-language').options[0],...knownLanguages.map(source => new Option(source.replace(/^./,char => char.toUpperCase()),source)));
      const me = await fetch('/api/member/me', {credentials:'same-origin'});
      if (me.ok) {
        const mine = await me.json();
        state.registered = mine.registered === true;
        state.saved = new Set((mine.saves || []).filter(save => save.kind === 'external').map(save => save.id ?? save.resourceId));
      }
      state.page = 1;
      state.loading = false;
      render();
      if (!state.items.length) notify(take().unavailable,true);
    } catch { state.items=[]; state.loading=false; render(); notify(take().unavailable,true); $('resource-retry').hidden=false; }
    finally { state.loading = false; }
  }
  $('resource-filters').addEventListener('submit',event => event.preventDefault());
  $('resource-filters').addEventListener('reset',event => { event.preventDefault(); $('resource-search').value=''; $('resource-theme').value=''; $('source-language').value=''; state.page=1; render(); });
  for (const id of ['resource-search','resource-theme','source-language']) $(id).addEventListener(id === 'resource-search' ? 'input' : 'change',() => { state.page=1;render(); });
  $('resource-prev').addEventListener('click',() => { if (state.page>1) {state.page--;render();$('resource-status').focus?.();} });
  $('resource-next').addEventListener('click',() => {state.page++;render();$('resource-status').focus?.();});
  $('resource-retry').addEventListener('click',load);
  document.addEventListener('dd:languagechange',localize);
  localize();
  load();
})();
