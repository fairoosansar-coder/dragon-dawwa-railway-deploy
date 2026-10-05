'use strict';
// Review homepage: legacy theological cards and proposed lessons are withheld.
// The historical source is archived outside the served public/ directory.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const copy = window.DD_HOME_COPY;
const english = Object.fromEntries($$('[data-i18n]').map(node => [node.dataset.i18n, node.innerHTML]));
const languages = new Set(['en', 'ta', 'si']);
let language = window.DDSharedNav?.language() || 'en';
let promptIndex = 0;
let toastTimer;

const words = {
  en: {
    noteTitle: 'Your private browser notebook', questionTitle: 'A question to keep for later',
    noteLabel: 'Your reflection', questionLabel: 'Your question',
    localNotice: 'Only in this browser. Your writing is not sent to Dragon Dawwa or a scholar; save or download a copy before clearing browser data.',
    save: 'Save in this browser', export: 'Download a copy', noteSaved: 'Saved in this browser.',
    clear: 'Clear my browser-only notes and old bookmarks', clearConfirm: 'Delete notes, questions and old bookmarks from only this browser? Your account and inbox records are not affected.', cleared: 'Browser-only notes and old bookmarks removed.',
    quietTitle: 'A quiet moment', quietHint: 'An optional pause, not a prescribed religious practice.', next: 'Another thought',
    prompts: ['What are you grateful for today?', 'Who could you approach more patiently?', 'What small kindness could you offer?'],
    communityTitle: 'Community updates', communityBody: 'No gathering, speaker, group invitation or channel has been confirmed. This invited review records interest only with explicit consent. Check Events for genuine published sessions.',
    sourcesTitle: 'Sources and review status', sourcesBody: 'The official directory records the mosque name, address and registration; it does not verify Dragon Dawwa’s relationship to that mosque. External learning links are curated pointers, not Dragon Dawwa scholarly approval. No reviewer has endorsed new religious teaching for this review.',
    privacyTitle: 'Privacy in this review', privacyBody: 'Your private notes and questions stay in this browser. An invited member may separately choose to store a display name, optional contact preference, saved resource links and Qur’an place in the review database. A submitted inquiry is kept in a restricted inbox, not in this notebook. Clearing browser-only notes does not delete account or inbox records; see My learning and Contact for their controls.',
    artwork: 'The garden artwork is imagined. It does not depict the listed mosque or a confirmed venue.',
    events: 'Check published events', resources: 'Explore original publishers', profile: 'Manage My learning', source: 'Official mosque directory',
  },
  ta: {
    noteTitle: 'உங்கள் தனியார் உலாவிக் குறிப்பேடு', questionTitle: 'பின்னர் கேட்க ஒரு கேள்வி', noteLabel: 'உங்கள் சிந்தனை', questionLabel: 'உங்கள் கேள்வி',
    localNotice: 'இந்த உலாவியில் மட்டுமே. உங்கள் எழுத்து Dragon Dawwa-விற்கோ அறிஞருக்கோ அனுப்பப்படாது; உலாவித் தரவை அழிக்கும் முன் நகலைச் சேமிக்கவும்.',
    save: 'இந்த உலாவியில் சேமி', export: 'நகலைப் பதிவிறக்கு', noteSaved: 'இந்த உலாவியில் சேமிக்கப்பட்டது.',
    clear: 'உலாவிக் குறிப்புகளையும் பழைய சேமிப்புகளையும் அழி', clearConfirm: 'இந்த உலாவியின் குறிப்புகள், கேள்விகள், பழைய சேமிப்புகளை மட்டும் அழிக்கவா? கணக்கு மற்றும் பதிவுகள் மாறாது.', cleared: 'உலாவிக் குறிப்புகளும் பழைய சேமிப்புகளும் அழிக்கப்பட்டன.',
    quietTitle: 'ஓர் அமைதியான தருணம்', quietHint: 'இது விருப்ப ஓய்வு; பரிந்துரைக்கப்பட்ட மார்க்க வழிபாடு அல்ல.', next: 'இன்னொரு சிந்தனை', prompts: ['இன்று எதற்கு நன்றி கூறுகிறீர்கள்?', 'யாரை இன்னும் பொறுமையுடன் அணுகலாம்?', 'என்ன சிறு நன்மையைச் செய்யலாம்?'],
    communityTitle: 'சமூகச் செய்திகள்', communityBody: 'சந்திப்பு, பேச்சாளர், குழு அழைப்பு அல்லது நாலிகை எதுவும் உறுதிப்படுத்தப்படவில்லை. இந்த அழைப்பு மதிப்பாய்வில் தெளிவான ஒப்புதலுடன் மட்டுமே விருப்பம் பதிவு செய்யப்படுகிறது. உண்மையான நிகழ்வுகளுக்கு நிகழ்வுகள் பக்கத்தைப் பாருங்கள்.',
    sourcesTitle: 'மூலங்களும் மதிப்பாய்வும்', sourcesBody: 'அரசின் பட்டியல் பள்ளிவாசலின் பெயர், முகவரி, பதிவு எண்ணைக் காட்டுகிறது; Dragon Dawwa-வின் தொடர்பை உறுதிப்படுத்தவில்லை. வெளிப்புற இணைப்புகள் குறிப்பு மட்டுமே; அறிஞர் அங்கீகாரம் அல்ல. இந்த மதிப்பாய்வின் புதிய மார்க்கப் போதனைக்கு மதிப்பாய்வாளர் அங்கீகாரம் இல்லை.',
    privacyTitle: 'இந்த மதிப்பாய்வின் தனியுரிமை', privacyBody: 'உங்கள் தனிப்பட்ட குறிப்புகளும் கேள்விகளும் இந்த உலாவியில் மட்டுமே உள்ளன. அழைக்கப்பட்ட உறுப்பினர் தனியாக பெயர், விருப்பத் தொடர்பு, இணைப்புகள் மற்றும் குர்ஆன் வாசிப்பு இடத்தை மதிப்பாய்வுத் தரவுத்தளத்தில் சேமிக்கலாம். சமர்ப்பித்த விசாரணை கட்டுப்படுத்தப்பட்ட பெட்டியில் இருக்கும். உலாவிக் குறிப்புகளை அழிப்பதால் கணக்கு அல்லது பெட்டிப் பதிவுகள் அழியாது; என் கற்றல் மற்றும் தொடர்பு பக்கங்களில் கட்டுப்பாடுகளைப் பாருங்கள்.',
    artwork: 'தோட்டப் படம் கற்பனை. அது பட்டியலிலுள்ள பள்ளிவாசலையோ உறுதியான நிகழ்விடத்தையோ காட்டவில்லை.',
    events: 'வெளியிடப்பட்ட நிகழ்வுகள்', resources: 'மூல வெளியீட்டாளர்கள்', profile: 'என் கற்றலை நிர்வகி', source: 'அரசின் பள்ளிவாசல் பட்டியல்',
  },
  si: {
    noteTitle: 'ඔබේ පුද්ගලික බ්‍රවුසර සටහන් පොත', questionTitle: 'පසුව ඇසිය යුතු ප්‍රශ්නයක්', noteLabel: 'ඔබේ සිතුවිල්ල', questionLabel: 'ඔබේ ප්‍රශ්නය',
    localNotice: 'මෙම බ්‍රවුසරයේ පමණයි. ඔබේ ලිවීම Dragon Dawwa වෙත හෝ විද්වතෙකු වෙත නොයයි; බ්‍රවුසර දත්ත මැකීමට පෙර පිටපතක් බාගන්න.',
    save: 'මෙම බ්‍රවුසරයේ සුරකින්න', export: 'පිටපතක් බාගන්න', noteSaved: 'මෙම බ්‍රවුසරයේ සුරැකිණි.',
    clear: 'බ්‍රවුසර සටහන් හා පැරණි සුරැකුම් මකන්න', clearConfirm: 'මෙම බ්‍රවුසරයේ සටහන්, ප්‍රශ්න හා පැරණි සුරැකුම් පමණක් මකන්නද? ගිණුම සහ ලැබුණු පණිවිඩ වෙනස් නොවේ.', cleared: 'බ්‍රවුසරයේ සටහන් හා පැරණි සුරැකුම් මකන ලදි.',
    quietTitle: 'සන්සුන් මොහොතක්', quietHint: 'මෙය විකල්ප විවේකයක්; නියමිත ආගමික වතාවතක් නොවේ.', next: 'තවත් සිතුවිල්ලක්', prompts: ['අද ඔබ ස්තුතිවන්ත වන්නේ කුමකටද?', 'ඔබට තවත් ඉවසීමෙන් හමුවිය හැක්කේ කාවද?', 'ඔබට කළ හැකි කුඩා කරුණාව කුමක්ද?'],
    communityTitle: 'ප්‍රජා පුවත්', communityBody: 'හමුවක්, කථිකයෙක්, කණ්ඩායම් ආරාධනාවක් හෝ නාලිකාවක් තහවුරු කර නැත. මෙම ආරාධිත සමාලෝචනයේ කැමැත්ත පැහැදිලි අනුමැතියක් ඇති විට පමණක් සටහන් වේ. සත්‍ය පළ කළ වැඩසටහන් සඳහා සිදුවීම් බලන්න.',
    sourcesTitle: 'මූලාශ්‍ර හා සමාලෝචන තත්ත්වය', sourcesBody: 'රජයේ ලේඛනය පල්ලියේ නම, ලිපිනය හා ලියාපදිංචිය සටහන් කරයි; Dragon Dawwa සම්බන්ධතාව එයින් තහවුරු නොවේ. බාහිර සබැඳි විද්වත් අනුමැතියක් නොවේ. මෙම සමාලෝචනයේ නව ආගමික ඉගැන්වීම් අනුමත කර නැත.',
    privacyTitle: 'මෙම සමාලෝචනයේ පෞද්ගලිකත්වය', privacyBody: 'ඔබේ පුද්ගලික සටහන් හා ප්‍රශ්න මෙම බ්‍රවුසරයේම රැඳේ. ආරාධිත සාමාජිකයෙකුට වෙනම තම නම, විකල්ප සම්බන්ධතා කැමැත්ත, සුරැකි සබැඳි හා කුර්ආන් ස්ථානය සමාලෝචන දත්ත ගබඩාවේ තබාගත හැක. ඉදිරිපත් කළ විමසීම සීමිත පෙට්ටියක රඳවයි. බ්‍රවුසර සටහන් මකා දැමීම ගිණුම් හෝ පෙට්ටි දත්ත මකා නොදමයි; මගේ ඉගෙනුම හා සම්බන්ධතා පිටු බලන්න.',
    artwork: 'උද්‍යාන කලා නිර්මාණය කල්පිතයකි. එය ලේඛනයේ පල්ලිය හෝ තහවුරු කළ ස්ථානයක් නොවේ.',
    events: 'පළ කළ සිදුවීම් බලන්න', resources: 'මුල් ප්‍රකාශකයන් බලන්න', profile: 'මගේ ඉගෙනුම පාලනය', source: 'රජයේ පල්ලි ලේඛනය',
  },
};
function t(key) { return (words[language] || words.en)[key]; }
function stored(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function toast(message) {
  const node = $('#toast');
  node.textContent = message; node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}
function renderLanguage(next) {
  language = languages.has(next) ? next : 'en';
  document.documentElement.lang = language;
  const dictionary = copy?.[language] || {};
  $$('[data-i18n]').forEach(node => { node.innerHTML = dictionary[node.dataset.i18n] ?? english[node.dataset.i18n]; });
  $('#language').value = language;
  $('.skip').textContent = {en:'Skip to content',ta:'உள்ளடக்கத்திற்குச் செல்லவும்',si:'අන්තර්ගතයට යන්න'}[language];
}
function openDialog(title, content) {
  const container = $('#dialog-content'); container.replaceChildren();
  const heading = document.createElement('h2'); heading.id = 'dialog-title'; heading.className = 'dialog-title'; heading.textContent = title;
  container.append(heading, content);
  if (!$('#dialog').open) $('#dialog').showModal();
  $('#dialog').scrollTop = 0;
}
function panelBody(message, links = []) {
  const content = document.createElement('div'); content.className = 'dialog-body';
  const paragraph = document.createElement('p'); paragraph.textContent = message; content.append(paragraph);
  for (const [href,label] of links) { const link = document.createElement('a'); link.href = href; link.textContent = label; link.className = 'text-button'; content.append(link); }
  return content;
}
function openNotebook(question = false) {
  const key = question ? 'dd-question' : 'dd-note';
  const content = panelBody(t('localNotice'));
  const label = document.createElement('label'); label.className = 'journal-label'; label.htmlFor = 'note-text'; label.textContent = t(question ? 'questionLabel' : 'noteLabel');
  const textarea = document.createElement('textarea'); textarea.id = 'note-text'; textarea.maxLength = 15000; textarea.value = String(stored(key) ?? '');
  const controls = document.createElement('div'); controls.className = 'dialog-actions';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'button'; save.textContent = t('save');
  save.addEventListener('click', () => { try { localStorage.setItem(key, JSON.stringify(textarea.value)); toast(t('noteSaved')); } catch { toast(t('localNotice')); } });
  const download = document.createElement('button'); download.type = 'button'; download.className = 'button secondary'; download.textContent = t('export');
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([textarea.value], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = question ? 'dragon-dawwa-question.txt' : 'dragon-dawwa-note.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  controls.append(save, download); content.append(label, textarea, controls);
  openDialog(t(question ? 'questionTitle' : 'noteTitle'), content);
}
function openQuiet() {
  const content = panelBody(t('quietHint'));
  const prompt = document.createElement('p'); prompt.className = 'quiet-prompt'; prompt.textContent = t('prompts')[promptIndex];
  const next = document.createElement('button'); next.type = 'button'; next.className = 'text-button'; next.textContent = t('next');
  next.addEventListener('click', () => { promptIndex = (promptIndex + 1) % t('prompts').length; prompt.textContent = t('prompts')[promptIndex]; });
  content.append(prompt, next); openDialog(t('quietTitle'), content);
}
function openPrivacy() {
  const content = panelBody(t('privacyBody'), [['/member',t('profile')]]);
  const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'button secondary'; clear.textContent = t('clear');
  clear.addEventListener('click', () => {
    if (!window.confirm(t('clearConfirm'))) return;
    try { ['dd-saved','dd-note','dd-question'].forEach(key => localStorage.removeItem(key)); toast(t('cleared')); $('#saved-count').hidden = true; }
    catch { toast(t('localNotice')); }
  });
  content.append(clear); openDialog(t('privacyTitle'), content);
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-open]');
  if (!button) return;
  switch (button.dataset.open) {
    case 'notebook': openNotebook(); break;
    case 'question': openNotebook(true); break;
    case 'quiet': openQuiet(); break;
    case 'community': openDialog(t('communityTitle'), panelBody(t('communityBody'), [['/events',t('events')]])); break;
    case 'sources': openDialog(t('sourcesTitle'), panelBody(t('sourcesBody') + ' ' + t('artwork'), [['https://muslimaffairs.gov.lk/wp-content/uploads/2023/12/ANURADHAPURA-DISTRICT.pdf',t('source')],['/resources',t('resources')]])); break;
    case 'privacy': openPrivacy(); break;
  }
});
$('#dialog-close').addEventListener('click', () => $('#dialog').close());
$('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) $('#dialog').close(); });
document.addEventListener('dd:languagechange', event => renderLanguage(event.detail?.language));
renderLanguage(language);
