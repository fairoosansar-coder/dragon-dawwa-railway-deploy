(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let user, current = null, dirty = false, busy = false, items = [];
  const documentPage = {value:1, size:12};
  const languages = {en:'English',ta:'தமிழ் · Tamil',si:'සිංහල · Sinhala'};
  const kindLabels = {quran:'Qur’an reference',hadith:'Hadith reference',source_text:'Source text',translation:'Translation',interpretation:'Interpretation / commentary',editorial:'Editorial context',source:'Source text'};
  const messages = {
    sign_in_required:'Sign in with ChatGPT to continue.',forbidden:'Your role does not permit this action.',
    revision_conflict:'A newer revision was saved. Your text is still in the form. Copy it, then reload the document before trying again.',
    complete_each_language:'Complete title, summary, body and contributor for every included language, or leave that language entirely blank.',
    source_required:'Add at least one source reference before submitting for review.',language_required:'Add content in at least one language.',
    invalid_source_url:'Source links must be valid HTTPS URLs without embedded credentials.',invalid_content:'Check field lengths and required content.',invalid_sources:'Use at most 30 source references.',
    invalid_metadata:'Check the optional topic and clarity fields.',invalid_topics:'Use at most 12 distinct topics, each no longer than 80 characters.',invalid_classification:'Choose a listed reading type.',
    invalid_source_kind:'Choose a listed source-reference type.',review_confirmation_required:'Confirm your personal review and add review notes of at least 10 characters.',
    review_languages_required:'Acknowledge every included language, and no omitted language, before approval.',review_revision_mismatch:'This approval no longer matches the submitted revision. Reload it before reviewing again.',
    approval_required:'This exact revision needs approval before publication.',invalid_transition:'This action is unavailable in the current state. Reload to see the latest revision.',
    storage_unavailable:'The workspace could not connect to storage. Your unsaved text is still here. Please try again.',
    same_origin_required:'This request could not be verified. Reload the workspace and try again.',not_found:'The document or revision was not found.',too_large:'This draft is too large. Shorten it before saving.',
    invalid_revision:'The requested revision is not available.',invalid_language:'Choose a supported language.',invalid_search:'Shorten the search text.',not_published:'There is no current publication to withdraw.'
  };
  const status = (text,error=false) => { $('admin-status').textContent=text; $('admin-status').classList.toggle('error',error); };
  const node = (tag,text,cls) => { const el=document.createElement(tag); if(text!==undefined)el.textContent=text; if(cls)el.className=cls; return el; };
  function confirmAction(message) {
    const dialog=$('confirm-action');$('confirm-message').textContent=message;dialog.showModal();
    return new Promise(resolve=>{
      const finish=value=>{dialog.close();dialog.removeEventListener('cancel',cancel);$('confirm-cancel').onclick=null;$('confirm-continue').onclick=null;resolve(value);};
      const cancel=e=>{e.preventDefault();finish(false);};dialog.addEventListener('cancel',cancel);
      $('confirm-cancel').onclick=()=>finish(false);$('confirm-continue').onclick=()=>finish(true);
    });
  }
  async function api(path,body) {
    let response; try { response=await fetch('/api/admin/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined}); }
    catch { throw new Error(messages.storage_unavailable); }
    let data; try { data=await response.json(); } catch { throw new Error('Could not read the response. Check your sign-in and retry.'); }
    if(!response.ok)throw new Error(messages[data.error]||'The request could not be completed. Please reload and try again.'); return data;
  }
  function editable() { return !!user && (user.role==='owner'||(user.role==='author'&&(!current||current.created_by===user.id))); }
  function includedLanguages(){return Object.keys(current?.current?.content?.translations||{});}
  function controls() {
    $('content-fields').disabled=busy||!editable(); $('save-draft').disabled=busy||!editable(); $('new-document').disabled=busy||!editable();
    $('submit-review').disabled=busy||dirty||!current||!editable()||!['draft','changes_requested'].includes(current.current.state);
    $('preview-document').disabled=busy||!current;
    const review=user&&['owner','reviewer'].includes(user.role), publish=user&&['owner','publisher'].includes(user.role);
    for(const id of ['approve','request-changes'])$(id).disabled=busy||dirty||!review||current?.current.state!=='in_review';
    $('publish').disabled=busy||dirty||!publish||current?.current.state!=='approved';
    $('unpublish').disabled=busy||dirty||!publish||!current?.published;
    $('review-panel').hidden=!current; $('history-panel').hidden=!current;
    $('dirty-note').textContent=dirty?'Unsaved changes — save before review or publication.':'';
    document.querySelectorAll('.document-choice,.restore-button').forEach(b=>b.disabled=busy);
    document.querySelectorAll('.language-review-check').forEach(input=>input.disabled=busy||!review||current?.current.state!=='in_review');
    $('review-confirm').disabled=busy||!review||current?.current.state!=='in_review';
  }
  function changed(){dirty=true;controls();}
  function field(parent,label,id,value='',multiline=false) {
    const wrapper=node('label',label),input=node(multiline?'textarea':'input'); input.id=id; input.value=value;
    wrapper.append(input);parent.append(wrapper);return input;
  }
  for(const [lang,title] of Object.entries(languages)) {
    const details=node('details');details.open=lang==='en';details.append(node('summary',title));
    details.append(node('p','Leave all fields blank to omit this language. Translation and authorship credits must name the actual contributor.','editorial-note'));
    for(const [key,label,max] of [['title','Title',180],['summary','Summary',800],['body','Body · plain text',15000],['contributor','Author / translator credit',180]]) {
      const input=field(details,label,`${lang}-${key}`,'',key==='body'||key==='summary');input.lang=lang;input.maxLength=max;if(key==='body')input.className='body-input';
    }
    $('languages').append(details);
  }
  function addSource(value={}) {
    const row=node('div',undefined,'source-row'),grid=node('div',undefined,'source-grid');row.append(grid);
    for(const [key,label,max] of [['label','Source title',250],['url','HTTPS source link',2000],['author','Source author / institution',250],['locator','Verse, page, section or passage',400]]) {
      const input=field(grid,label,'',value[key]||'');input.removeAttribute('id');input.dataset.field=key;input.maxLength=max;if(key==='url')input.type='url';
    }
    const label=node('label','Reference type'),select=node('select');select.dataset.field='kind';
    for(const [val,text] of Object.entries({quran:'Qur’an reference',hadith:'Hadith reference',source_text:'Source text',translation:'Translation',interpretation:'Interpretation / commentary',editorial:'Editorial context'})){const option=node('option',text);option.value=val;select.append(option);} select.value=value.kind==='source'?'source_text':(value.kind||'source_text');label.append(select);row.append(label);
    const remove=node('button','Remove reference');remove.type='button';remove.addEventListener('click',()=>{row.remove();changed();});row.append(remove);$('source-list').append(row);
  }
  function content() {
    const translations={};for(const lang of Object.keys(languages)){translations[lang]={};for(const key of ['title','summary','body','contributor'])translations[lang][key]=$(`${lang}-${key}`).value;}
    const sources=[...document.querySelectorAll('.source-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el.value])));
    const topics=$('topics').value.split(',').map(value=>value.trim()).filter(Boolean);
    return {translations,sources,metadata:{topics,classification:$('classification').value,clarity:$('clarity').value}};
  }
  function title(data){return Object.values(data.translations||{}).find(t=>t.title)?.title||'Untitled draft';}
  function renderReviewAcknowledgements(){
    const box=$('language-review-acks');box.replaceChildren();
    const included=includedLanguages();
    if(!included.length){box.append(node('p','There is no included language to review.','editorial-note'));return;}
    box.append(node('h3','Language acknowledgements'));
    const review=current?.current?.content?.review;
    included.forEach(lang=>{
      const label=node('label',undefined,'check-label'),input=node('input');input.type='checkbox';input.className='language-review-check';input.dataset.language=lang;
      input.checked=review?.languages?.[lang]?.acknowledged===true;label.append(input,node('span',`${languages[lang]} — I reviewed this rendered text for this submission.`));box.append(label);
    });
    $('review-revision').textContent=`Approval must identify revision ${current?.head||'—'} exactly. Language checks are saved with that submitted revision.`;
  }
  function form(doc=null) {
    current=doc;dirty=false;$('revision-note').value='';$('review-confirm').checked=false;
    const data=doc?.current.content||{translations:{},sources:[],metadata:{topics:[],classification:'',clarity:''}};
    for(const lang of Object.keys(languages))for(const key of ['title','summary','body','contributor'])$(`${lang}-${key}`).value=data.translations[lang]?.[key]||'';
    $('topics').value=(data.metadata?.topics||[]).join(', ');$('classification').value=data.metadata?.classification||'';$('clarity').value=data.metadata?.clarity||'';
    $('source-list').replaceChildren();(data.sources||[]).forEach(addSource);
    $('editor-title').textContent=doc?title(data):'New draft';
    $('document-meta').textContent=doc?`Revision ${doc.head} · ${doc.current.state.replaceAll('_',' ')} · ${doc.published?'Published revision '+doc.published:'Not published'}`:'Not saved';
    renderReviewAcknowledgements();controls();renderList();
  }
  function documentMatches(item, query, state){
    if(state && item.state!==state)return false;
    if(!query)return true;
    const haystack=[title(item.content),item.state,...(item.content.metadata?.topics||[]),item.content.metadata?.classification||'',item.content.metadata?.clarity||''].join('\n').toLocaleLowerCase();
    return haystack.includes(query);
  }
  function renderList(){
    const query=$('document-search').value.trim().toLocaleLowerCase(),state=$('document-state-filter').value;
    const matched=items.filter(item=>documentMatches(item,query,state));
    const pages=Math.max(1,Math.ceil(matched.length/documentPage.size));documentPage.value=Math.min(documentPage.value,pages);
    const start=(documentPage.value-1)*documentPage.size,shown=matched.slice(start,start+documentPage.size);
    $('document-list').replaceChildren();
    if(!items.length)$('document-list').append(node('p','No documents are stored yet. Create a draft to begin.','editorial-note'));
    else if(!shown.length)$('document-list').append(node('p','No documents match these filters.','editorial-note'));
    shown.forEach(item=>{const b=node('button',`${title(item.content)} · ${item.state.replaceAll('_',' ')} · v${item.head}`,'document-choice');b.type='button';b.setAttribute('aria-current',String(current?.id===item.id));b.addEventListener('click',async()=>{if(dirty&&!await confirmAction('Discard unsaved edits and open another document?'))return;task(()=>open(item.id));});$('document-list').append(b);});
    $('document-count').textContent=items.length?`Showing ${shown.length?start+1:0}–${start+shown.length} of ${matched.length} matching document${matched.length===1?'':'s'} from ${items.length} returned by the server. The current documents API returns at most 200 records and does not expose server pages.`:'The current documents API returns at most 200 records and does not expose server pages.';
    $('document-page').textContent=`Page ${documentPage.value} of ${pages}`;$('document-prev').disabled=documentPage.value<=1;$('document-next').disabled=documentPage.value>=pages;
  }
  async function list(){items=(await api('documents')).items;documentPage.value=1;renderList();}
  function appendSources(container,sources){
    (sources||[]).forEach(source=>{const p=node('p',''),a=node('a',source.label||'Source');try{const parsed=new URL(source.url);if(parsed.protocol!=='https:')throw new Error();a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';}catch{a.removeAttribute('href');}p.append(a,node('span',` · ${kindLabels[source.kind]||source.kind} · ${source.author||'No author listed'}${source.locator?` · ${source.locator}`:''}`));container.append(p);});
  }
  async function history(before=null){
    const data=await api(`documents/${current.id}/history${before?'?before='+before:''}`),rows=data.items;
    if(!before)$('history-list').replaceChildren();
    $('older-revisions')?.remove();
    rows.forEach(r=>{const item=node('article',undefined,'history-item');item.append(node('h3',`Revision ${r.version} · ${r.action} · ${r.state.replaceAll('_',' ')}`),node('p',`${r.created_at} · ${r.role} · ${r.actor}`,'editorial-note'),node('p',r.note));
      const details=node('details');details.append(node('summary','View saved snapshot'));
      const info=[];if(r.content.metadata?.classification)info.push(kindLabels[r.content.metadata.classification]||r.content.metadata.classification);if(r.content.metadata?.topics?.length)info.push('Topics: '+r.content.metadata.topics.join(', '));if(info.length)details.append(node('p',info.join(' · '),'editorial-note'));
      for(const [lang,text] of Object.entries(r.content.translations)){details.append(node('h3',`${languages[lang]}: ${text.title}`),node('p',text.summary),node('pre',text.body),node('p',text.contributor));}
      appendSources(details,r.content.sources);item.append(details);
      if(editable()){const restore=node('button','Restore as new draft','restore-button');restore.type='button';restore.addEventListener('click',async()=>{if(dirty){status('Save or discard your unsaved edits before restoring.',true);return;}if(await confirmAction(`Restore revision ${r.version} as a new draft? The current publication will stay visible.`))task(async()=>{const doc=await api(`documents/${current.id}/restore`,{baseVersion:current.head,version:r.version,note:`Restored revision ${r.version}`});form(doc);await list();await history();status('Historical content restored as a new draft. Fresh review is required.');});});item.append(restore);}
      $('history-list').append(item);
    });
    if(data.nextBefore){const more=node('button','Load older revisions');more.id='older-revisions';more.type='button';more.addEventListener('click',()=>task(()=>history(data.nextBefore)));$('history-list').append(more);}
  }
  async function open(id){form(await api('documents/'+id));await history();status('Document loaded.');}
  function renderPreview(item){
    const content=item.content,box=$('preview-content');box.replaceChildren();
    $('preview-meta').textContent=`Private preview · revision ${item.version} · ${item.state.replaceAll('_',' ')}. This does not publish or make the revision visitor-visible.`;
    const metadata=content.metadata||{};if(metadata.classification)box.append(node('p',kindLabels[metadata.classification]||metadata.classification,'article-badge'));
    if(metadata.topics?.length)box.append(node('p','Topics: '+metadata.topics.join(', '),'editorial-note'));
    if(metadata.clarity)box.append(node('p',metadata.clarity,'editorial-note'));
    for(const [lang,text] of Object.entries(content.translations||{})){const section=node('section',undefined,'preview-language');section.lang=lang;section.append(node('h2',text.title),node('p',text.summary),node('p',text.body,'library-body'),node('p','Contributor: '+text.contributor,'library-credit'));box.append(section);}
    box.append(node('h3','Source references'));appendSources(box,content.sources);
    const reviewedLanguages=Object.entries(content.review?.languages||{}).filter(([lang,entry])=>languages[lang]&&entry?.acknowledged===true).map(([lang])=>languages[lang]);
    if(reviewedLanguages.length)box.append(node('p',`Review record: ${reviewedLanguages.join(', ')} checked for submitted revision ${content.review.reviewedRevision} by ${content.review.reviewedBy}.`,'editorial-note'));
  }
  async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){status(e.message,true);}finally{busy=false;controls();}}
  async function initialize(){
    const session=await api('session');user=session.user;
    $('session').textContent=`Signed-in Site user: ${user.id} · Role: ${user.role}`;
    $('sign-in').hidden=true;
    if(!session.configured){status('Owner access has not been configured yet. This workspace is locked until the Site owner is configured.',true);return;}
    if(user.role==='reader'){status('Your account can read published content but has no editorial permission.',true);return;}
    $('workspace').hidden=false;await list();form();status('Workspace ready.');
  }
  $('content-fields').addEventListener('input',changed);$('content-fields').addEventListener('change',changed);
  $('document-search').addEventListener('input',()=>{documentPage.value=1;renderList();});$('document-state-filter').addEventListener('change',()=>{documentPage.value=1;renderList();});
  $('document-prev').addEventListener('click',()=>{documentPage.value--;renderList();});$('document-next').addEventListener('click',()=>{documentPage.value++;renderList();});
  $('add-source').addEventListener('click',()=>{addSource();changed();});
  $('new-document').addEventListener('click',async()=>{if(dirty&&!await confirmAction('Discard unsaved edits and start a new draft?'))return;form();status('New draft. Nothing is saved yet.');});
  $('reload-workspace').addEventListener('click',async()=>{if(dirty&&!await confirmAction('Discard unsaved edits and reload?'))return;task(async()=>{if(current)await open(current.id);else await initialize();});});
  $('preview-document').addEventListener('click',()=>task(async()=>{if(!current)return;const data=await api(`documents/${current.id}/preview?version=${current.head}`);renderPreview(data.item);$('preview-dialog').showModal();}));
  $('close-preview').addEventListener('click',()=>$('preview-dialog').close());
  $('editor-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{
    const data={content:content(),note:$('revision-note').value||'Saved draft edits',baseVersion:current?.head};
    const doc=await api(current?`documents/${current.id}/save`:'documents',data);form(doc);await list();await history();status('Draft saved to the server.');
  });});
  for(const action of ['submit','approve','request-changes','publish','unpublish'])$(action==='submit'?'submit-review':action).addEventListener('click',()=>task(async()=>{
    if(dirty)throw new Error('Save your edits before changing workflow state.');
    if(!current)return;
    const note=$('revision-note').value.trim();if(!note)throw new Error('Add a revision reason or review note before continuing.');
    if(action==='publish'&&!await confirmAction('Publish this approved revision to the existing private Site audience?'))return;
    if(action==='unpublish'&&!await confirmAction('Withdraw the current publication? Revision history will be retained.'))return;
    const body={baseVersion:current.head,note};
    if(action==='approve'){
      body.reviewed=$('review-confirm').checked;body.reviewedRevision=current.head;body.reviewedLanguages=Object.fromEntries([...document.querySelectorAll('.language-review-check')].map(input=>[input.dataset.language,input.checked]));
      if(!Object.values(body.reviewedLanguages).every(Boolean))throw new Error(messages.review_languages_required);
    }
    const doc=await api(`documents/${current.id}/${action}`,body);form(doc);await list();await history();status(`Revision ${doc.head} saved: ${doc.current.state.replaceAll('_',' ')}.`);
  }));
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  task(async()=>{try{await initialize();}catch(e){$('sign-in').hidden=false;throw e;}});
})();
