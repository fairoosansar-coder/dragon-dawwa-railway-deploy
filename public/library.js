(() => {
  'use strict';
  const $=id=>document.getElementById(id), node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const copy={
    home:['Home','முகப்பு','මුල් පිටුව'],quran:['Qur’an','குர்ஆன்','කුර්ආනය'],learn:['Learn','கற்றல்','ඉගෙන ගන්න'],resources:['Resources','வளங்கள்','සම්පත්'],member:['My learning','என் கற்றல்','මගේ ඉගෙනුම'],mosque:['Mosque','பள்ளிவாசல்','පල්ලිය'],research:['Research','சமூக ஆய்வு','ප්‍රජා තොරතුරු'],events:['Events','நிகழ்வுகள்','වැඩසටහන්'],about:['About','பற்றி','පිළිබඳ'],contact:['Contact / participate','தொடர்பு / பங்கேற்பு','සම්බන්ධ වන්න / සහභාගී වන්න'],eyebrow:['READ · CONSIDER · REFLECT','வாசிப்போம் · ஆராய்வோம் · சிந்திப்போம்','කියවන්න · සලකා බලන්න · මෙනෙහි කරන්න'],title:['Editorial library','ஆசிரியர் பதிவுகள்','සංස්කාරක ලිපි'],
    intro:['Source-linked readings published through the editorial workspace. Translations are attributed renderings; editorial approval is not scholarly endorsement.','ஆசிரியர் பணிப்பகுதி வழியாக வெளியிடப்பட்ட, மூல இணைப்புகளைக் கொண்ட பதிவுகள். மொழிபெயர்ப்பாளர்கள் குறிப்பிடப்படுவர்; ஆசிரியர் ஒப்புதல் அறிஞர் அங்கீகாரம் அல்ல.','සංස්කාරක කාර්ය අවකාශයෙන් පළ කළ මූලාශ්‍ර සහිත ලිපි. පරිවර්තකයන් නම් කර ඇත; සංස්කාරක අනුමැතිය ශාස්ත්‍රීය අනුමැතියක් නොවේ.'],
    retry:['Try again','மீண்டும் முயலுங்கள்','නැවත උත්සාහ කරන්න'],close:['Close reading','பதிவை மூடுக','ලිපිය වසන්න'],read:['Read','வாசிக்க','කියවන්න'],save:['Save to My Learning','என் கற்றலில் சேமிக்கவும்','මගේ ඉගෙනුමට සුරකින්න'],removeSave:['Remove saved reading','சேமித்த பதிவை நீக்குக','සුරකින ලද ලිපිය ඉවත් කරන්න'],joinToSave:['Create an invited member profile to save','சேமிக்க அழைக்கப்பட்ட உறுப்பினர் பதிவை உருவாக்கவும்','සුරැකීමට ආරාධිත සාමාජික පැතිකඩක් සාදන්න'],saveFailed:['Could not save this reading. Check member access and retry.','இந்தப் பதிவைச் சேமிக்க முடியவில்லை. அணுகலைச் சரிபார்க்கவும்.','ලිපිය සුරැකිය නොහැකි විය. සාමාජික ප්‍රවේශය පරීක්ෂා කරන්න.'],sources:['Source references','மூல ஆதாரங்கள்','මූලාශ්‍ර'],empty:['No readings have been published in this language yet.','இந்த மொழியில் இன்னும் பதிவுகள் வெளியிடப்படவில்லை.','මෙම භාෂාවෙන් තවම ලිපි පළ කර නැත.'],filteredEmpty:['No published readings match these filters.','இந்த வடிகட்டல்களுக்கு ஏற்ற வெளியிடப்பட்ட பதிவுகள் இல்லை.','මෙම පෙරහන් වලට ගැලපෙන පළ කළ ලිපි නැත.'],
    loading:['Loading readings…','பதிவுகள் பெறப்படுகின்றன…','ලිපි ලබා ගනිමින්…'],error:['Readings could not load. Check your sign-in and try again.','பதிவுகளைப் பெற முடியவில்லை. உள்நுழைவைச் சரிபார்த்து மீண்டும் முயலுங்கள்.','ලිපි ලබාගත නොහැක. පිවිසුම පරීක්ෂා කර නැවත උත්සාහ කරන්න.'],credit:['Contributor','பங்களிப்பாளர்','දායකයා'],
    search:['Search readings','பதிவுகளைத் தேடுங்கள்','ලිපි සොයන්න'],searchPlaceholder:['Search title, topic or source','தலைப்பு, தலைப்பு வகை அல்லது மூலத்தைத் தேடுங்கள்','මාතෘකාව, තේමාව හෝ මූලාශ්‍රය සොයන්න'],topic:['Topic','தலைப்பு','මාතෘකාව'],type:['Reading type','வாசிப்பு வகை','කියවීම් වර්ගය'],allTopics:['All topics','அனைத்து தலைப்புகள்','සියලු මාතෘකා'],allTypes:['All types','அனைத்து வகைகள்','සියලු වර්ග'],clear:['Clear filters','வடிகட்டல்களை அழி','පෙරහන් හිස් කරන්න'],
    quran:['Qur’an source','குர்ஆன் மூல உரை','කුර්ආන් මූලාශ්‍රය'],hadith:['Hadith source (grading not asserted)','ஹதீஸ் மூலம் (தரம் உறுதிப்படுத்தப்படவில்லை)','හදීස් මූලාශ්‍රය (ශ්‍රේණිය තහවුරු කර නැත)'],source_text:['Source text · legacy / unspecified','மூல உரை · வகை குறிப்பிடப்படவில்லை','මූලාශ්‍ර පාඨය · වර්ගය සඳහන් නැත'],translation:['Translation','மொழிபெயர்ப்பு','පරිවර්තනය'],interpretation:['Interpretation / commentary','விளக்கம் / உரை','අර්ථකථනය / විවරණය'],editorial:['Editorial note','ஆசிரியர் குறிப்பு','සංස්කාරක සටහන'],
    skip:['Skip to content','உள்ளடக்கத்திற்குச் செல்லவும்','අන්තර්ගතයට යන්න'],navLabel:['Library and visitor navigation','நூலகம் மற்றும் பார்வையாளர் வழிசெலுத்தல்','පුස්තකාල සහ අමුත්තන්ගේ මාර්ගෝපදේශය'],languageLabel:['Choose language','மொழியைத் தேர்வு செய்க','භාෂාව තෝරන්න'],reading:['Reading','வாசிப்பு','කියවීම'],workspace:['Editorial workspace','ஆசிரியர் பணிப்பகுதி','සංස්කාරක කාර්ය අවකාශය'],
    clarity:['Editorial context','ஆசிரியர் சூழல்','සංස්කාරක සන්දර්භය'],topics:['Topics','தலைப்புகள்','මාතෘකා'],review:['Review record','மதிப்பாய்வு பதிவு','සමාලෝචන සටහන'],reviewIdentityMissing:['A verified site account reviewed this revision. Reviewer name and qualifications have not been provided for public attribution.','சரிபார்க்கப்பட்ட தளக் கணக்கு இந்தத் திருத்தத்தை மதிப்பாய்வு செய்துள்ளது. மதிப்பாய்வாளரின் பெயரும் தகுதிகளும் பொதுக் குறிப்புக்காக வழங்கப்படவில்லை.','සත්‍යාපිත අඩවි ගිණුමක් මෙම සංස්කරණය සමාලෝචනය කර ඇත. සමාලෝචකයාගේ නම සහ සුදුසුකම් ප්‍රසිද්ධ උපුටා දැක්වීම සඳහා ලබා දී නැත.'],missingLanguage:['This published reading is not available in the selected language. Choose another language to see an attributed rendering if one was published.','இந்த வெளியிடப்பட்ட பதிவு தேர்ந்தெடுத்த மொழியில் இல்லை. வெளியிடப்பட்ட மொழிபெயர்ப்பு இருந்தால் வேறு மொழியைத் தேர்வுசெய்க.','තෝරාගත් භාෂාවෙන් මෙම පළ කළ ලිපිය නොමැත. පළ කළ අනුවාදයක් තිබේ නම් වෙනත් භාෂාවක් තෝරන්න.'],notFound:['This reading is unavailable or has not been published.','இந்த பதிவு கிடைக்கவில்லை அல்லது வெளியிடப்படவில்லை.','මෙම ලිපිය නොමැත හෝ පළ කර නොමැත.'],reviewCaveat:['An editorial review record is not a scholarly endorsement.','ஆசிரியர் மதிப்பாய்வு பதிவு அறிஞர் அங்கீகாரம் அல்ல.','සංස්කාරක සමාලෝචන සටහනක් ශාස්ත්‍රීය අනුමැතියක් නොවේ.']
  };
  const languageIndex={en:0,ta:1,si:2};
  let lang='en',items=[],state='loading',openItem=null,memberRegistered=false,savedEditorial=new Set();
  try{const saved=JSON.parse(localStorage.getItem('dd-language'));if(Object.hasOwn(languageIndex,saved))lang=saved;}catch{}
  const t=key=>copy[key]?.[languageIndex[lang]]||key;
  const sourceLabel=kind=>t(kind==='source'?'source_text':kind||'editorial');
  const text=value=>String(value||'').toLocaleLowerCase();
  function metadata(item){return item?.content?.metadata||{topics:[],classification:'',clarity:''};}
  function filtersActive(){return !!($('library-search').value.trim()||$('topic-filter').value||$('classification-filter').value);}
  function visibleItems(){
    const needle=text($('library-search').value.trim()),topic=text($('topic-filter').value),classification=$('classification-filter').value;
    return items.filter(item=>{
      const rendition=item.content?.translations?.[lang];if(!rendition)return false;
      const meta=metadata(item);if(topic&&!meta.topics.some(value=>text(value)===topic))return false;
      if(classification&&meta.classification!==classification)return false;
      if(!needle)return true;
      const haystack=[rendition.title,rendition.summary,rendition.body,rendition.contributor,...(item.content.sources||[]).flatMap(source=>[source.label,source.author,source.locator,source.kind]),...(meta.topics||[]),meta.classification,meta.clarity].map(text).join('\n');
      return haystack.includes(needle);
    });
  }
  function populateTopics(){
    const select=$('topic-filter'),selected=select.value;select.replaceChildren();const all=node('option',t('allTopics'));all.value='';select.append(all);
    const values=new Map();items.forEach(item=>(metadata(item).topics||[]).forEach(topic=>{const key=text(topic);if(key&&!values.has(key))values.set(key,topic);}));
    [...values.values()].sort((a,b)=>a.localeCompare(b,lang)).forEach(topic=>{const option=node('option',topic);option.value=topic;select.append(option);});
    select.value=[...select.options].some(option=>option.value===selected)?selected:'';
  }
  function setCopy(){
    document.documentElement.lang=lang;document.title=t('title')+' · Dragon Dawwa';$('library-language').value=lang;
    document.querySelectorAll('[data-copy]').forEach(e=>e.textContent=t(e.dataset.copy));
    document.querySelectorAll('[data-copy-placeholder]').forEach(e=>e.placeholder=t(e.dataset.copyPlaceholder));
    document.querySelectorAll('[data-copy-aria]').forEach(e=>e.setAttribute('aria-label',t(e.dataset.copyAria)));
    if(!$('reading-dialog').open)$('reading-title').textContent=t('reading');
  }
  function link(url,label){
    const a=node('a',label||url);
    try {
      const parsed=new URL(url,location.origin),internal=parsed.origin===location.origin;
      if(!internal&&parsed.protocol!=='https:')throw new Error('Only HTTPS source links are allowed');
      a.href=parsed.href;
      if(!internal){a.target='_blank';a.rel='noopener noreferrer';}
    } catch {a.removeAttribute('href');}
    return a;
  }
  function appendSources(container,sources){
    (sources||[]).forEach(source=>{const p=node('p',''),a=link(source.url,source.label||t('sources'));p.append(a,node('span',` · ${sourceLabel(source.kind)}${source.author?` · ${source.author}`:''}${source.locator?` · ${source.locator}`:''}`));container.append(p);});
  }
  function addBadges(container,item){
    const meta=metadata(item);if(meta.classification)container.append(node('p',sourceLabel(meta.classification),'article-badge'));
    if(meta.topics?.length)container.append(node('p',`${t('topics')}: ${meta.topics.join(', ')}`,'editorial-note'));
  }
  function memberSaveButton(item){
    const button=node('button',memberRegistered?(savedEditorial.has(item.id)?t('removeSave'):t('save')):t('joinToSave'),'library-save');
    button.type='button';button.setAttribute('aria-pressed',String(memberRegistered&&savedEditorial.has(item.id)));
    button.addEventListener('click',async()=>{
      if(!memberRegistered){location.href='/member';return;}
      const action=savedEditorial.has(item.id)?'remove':'add';button.disabled=true;
      try{
        const response=await fetch('/api/member/save',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,kind:'editorial',id:item.id})});
        if(!response.ok)throw new Error('save_failed');
        if(action==='add')savedEditorial.add(item.id);else savedEditorial.delete(item.id);
        render();if(openItem?.id===item.id&&$('reading-dialog').open)renderDetail(item,false);
      }catch{$('library-status').textContent=t('saveFailed');$('library-status').classList.add('error');button.disabled=false;}
    });
    return button;
  }
  function render(){
    setCopy();$('library-status').textContent=state?t(state):'';$('library-status').classList.toggle('error',state==='error');$('retry-library').hidden=state!=='error';$('library-items').replaceChildren();
    if(state)return;
    const visible=visibleItems();if(!visible.length){$('library-items').append(node('p',filtersActive()?t('filteredEmpty'):t('empty'),'empty-library'));return;}
    visible.forEach(item=>{const rendition=item.content.translations[lang],card=node('article',undefined,'editorial-panel library-card');card.append(node('h2',rendition.title));addBadges(card,item);card.append(node('p',rendition.summary),node('p',t('credit')+': '+rendition.contributor,'library-credit'));const read=link('/library/'+encodeURIComponent(item.id),t('read'));read.className='library-read';card.append(read,memberSaveButton(item));$('library-items').append(card);});
  }
  function renderDetail(item,show=true){
    openItem=item;const container=$('reading-content');container.replaceChildren();const rendition=item?.content?.translations?.[lang];
    if(!rendition){container.append(node('p',t('missingLanguage'),'empty-library'));$('reading-title').textContent=t('title');if(show&&!$('reading-dialog').open)$('reading-dialog').showModal();return;}
    $('reading-title').textContent=rendition.title;addBadges(container,item);const meta=metadata(item);if(meta.clarity)container.append(node('p',`${t('clarity')}: ${meta.clarity}`,'editorial-note'));
    const section=node('article');section.lang=lang;section.append(node('p',rendition.summary),node('p',rendition.body,'library-body'),node('p',t('credit')+': '+rendition.contributor,'library-credit'),node('h3',t('sources')));appendSources(section,item.content.sources);container.append(section,memberSaveButton(item));
    const review=item.content.review;if(review?.languages?.length){const names=review.languages.map(code=>({en:'English',ta:'Tamil',si:'Sinhala'}[code]||code)).join(', ');container.append(node('p',`${t('review')}: ${names} checked for submitted revision ${review.reviewedRevision}.`,'library-credit'),node('p',t('reviewIdentityMissing'),'editorial-note'),node('p',t('reviewCaveat'),'editorial-note'));}
    if(show&&!$('reading-dialog').open)$('reading-dialog').showModal();
  }
  async function detail(id){
    try{const r=await fetch('/api/content/'+encodeURIComponent(id),{credentials:'same-origin'});if(!r.ok)throw new Error();const data=await r.json();renderDetail(data.item);}catch{$('library-status').textContent=t('notFound');$('library-status').classList.add('error');}
  }
  function directId(){const path=new URL(location.href).pathname.match(/^\/library\/([A-Za-z0-9-]{1,64})$/);return path?path[1]:new URL(location.href).searchParams.get('id');}
  async function load(){
    state='loading';render();
    try{
      const r=await fetch('/api/content',{credentials:'same-origin'});if(!r.ok)throw new Error();
      items=(await r.json()).items||[];
      try{
        const me=await fetch('/api/member/me',{credentials:'same-origin'});
        if(me.ok){const account=await me.json();memberRegistered=account.registered===true;savedEditorial=new Set((account.saves||[]).filter(save=>save.kind==='editorial').map(save=>save.id));}
      }catch{/* Public reading is never blocked by the optional member endpoint. */}
      populateTopics();state='';render();const id=directId();if(id)await detail(id);
    }catch{state='error';render();}
  }
  $('library-language').addEventListener('change',e=>{lang=e.target.value;try{localStorage.setItem('dd-language',JSON.stringify(lang));}catch{}render();if(openItem&&$('reading-dialog').open)renderDetail(openItem,false);});
  $('library-search').addEventListener('input',render);$('topic-filter').addEventListener('change',render);$('classification-filter').addEventListener('change',render);
  $('clear-filters').addEventListener('click',()=>{$('library-search').value='';$('topic-filter').value='';$('classification-filter').value='';render();$('library-search').focus();});
  $('retry-library').addEventListener('click',load);$('close-reading').addEventListener('click',()=>{$('reading-dialog').close();if(directId())history.replaceState({},'', '/library');});
  $('reading-dialog').addEventListener('cancel',()=>{if(directId())history.replaceState({},'', '/library');});
  load();
})();
