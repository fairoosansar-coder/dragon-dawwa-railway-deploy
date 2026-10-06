import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuranClient, audioUrl, quranResponse} from '../lib/quran.mjs';

const config = {QURAN_CLIENT_ID:'test-client',QURAN_CLIENT_SECRET:'test-secret',QURAN_ENVIRONMENT:'prelive'};
function fixture({rejectOnce=false, denied=false, optionalDenied=false, omitScriptText=false, malformedTajweed=false, chapterInfoUnavailable=false, chapterRecitersUnavailable=false, locationMismatch=false, chapterAudioUrl='https://download.quranicaudio.com/quran/test/001.mp3'}={}) {
  const calls=[];let first=true;
  const fetcher=async (url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/oauth2/token')) {
      assert.equal(options.body,'grant_type=client_credentials&scope=content');
      assert.equal(options.headers.Authorization,'Basic '+btoa('test-client:test-secret'));
      return Response.json({access_token:'test-token',expires_in:3600});
    }
    assert.equal(options.headers['x-client-id'],'test-client');assert.equal(options.headers['x-auth-token'],'test-token');
    if(denied)return Response.json({message:'private upstream detail test-secret'},{status:403});
    if(rejectOnce&&first){first=false;return Response.json({error:'expired'},{status:401});}
    if(url.endsWith('/chapters'))return Response.json({chapters:[{id:1,name_simple:'Al-Fatihah',name_arabic:'الفاتحة',verses_count:7,revelation_place:'makkah',translated_name:{name:'The Opening'}}]});
    if(url.endsWith('/resources/translations'))return Response.json({translations:[{id:85,name:'M.A.S. Abdel Haleem',author_name:'Abdul Haleem',language_name:'english',slug:'en-haleem'},{id:203,name:'Al-Hilali & Khan',author_name:'Al-Hilali & Khan',language_name:'english',slug:'en-hilali'},{id:57,name:'Transliteration',language_name:'english',slug:'transliteration'}]});
    if(url.endsWith('/resources/recitations'))return Response.json({recitations:[{id:7,reciter_name:'Mishari Rashid al-`Afasy'}]});
    if(url.endsWith('/resources/tafsirs'))return Response.json({tafsirs:[{id:169,name:'Tafsir Ibn Kathir',author_name:'Hafiz Ibn Kathir',language_name:'english'}]});
    if(url.endsWith('/resources/chapter_reciters'))return chapterRecitersUnavailable ? Response.json({error:'not_authorized'},{status:403}) : Response.json({reciters:[{id:77,name:'Chapter Reciter',style:{name:'Murattal',language_name:'english'}}]});
    if(url.includes('/chapters/1/info?language=en&include_resources=true'))return chapterInfoUnavailable ? Response.json({error:'not_authorized'},{status:403}) : Response.json({chapter_info:{chapter_id:1,source:'Quran Foundation test source',short_text:'<p>Provider description <script>untrusted()</script></p>'}});
    if(url.endsWith('/chapter_recitations/77/1'))return Response.json({audio_file:{audio_url:chapterAudioUrl}});
    if(/\/verses\/by_(?:page|juz|hizb)\//.test(url)) {
      const match=/\/verses\/by_(page|juz|hizb)\/(\d+)\?/.exec(url);
      assert(match);assert.equal(new URL(url).searchParams.get('per_page'),'1');assert.equal(new URL(url).searchParams.has('fields'),false);
      return Response.json({verses:[{verse_key:'1:1',page_number:locationMismatch?2:1,juz_number:1,hizb_number:1}]});
    }
    if(url.includes('/verses/by_key/1:1?'))return Response.json({verse:{verse_key:'1:1',text_uthmani:'بِسْمِ ٱللَّهِ',translations:[{resource_id:85,text:'Source translation'}],audio:{url:'Alafasy/mp3/001001.mp3'}}});
    if(url.includes('/quran/translations/85?verse_key=1:1&foot_notes=true'))return optionalDenied ? Response.json({error:'not_authorized'},{status:403}) : Response.json({translations:[{verse_key:'1:1',resource_id:85,text:'Source translation <sup>1</sup>',foot_notes:{1:'Translator source note.'}}]});
    if(url.includes('/quran/translations/203?verse_key=1:1&foot_notes=true'))return Response.json({translations:[{verse_key:'1:1',resource_id:203,text:'Named source <sup foot_note=254690>1</sup> with a cited note.'}]});
    if(url.endsWith('/foot_notes/254690'))return optionalDenied ? Response.json({error:'not_authorized'},{status:403}) : Response.json({foot_note:{id:254690,text:'Verified standalone source footnote.',language_name:'english'}});
    if(url.includes('/quran/tafsirs/169?verse_key=1:1'))return optionalDenied ? Response.json({error:'not_authorized'},{status:403}) : Response.json({tafsirs:[{verse_key:'1:1',resource_id:169,text:'<p>Named commentary.</p>'}]});
    const requestUrl=new URL(url),fields=requestUrl.searchParams.get('fields')||'';
    const verse={verse_key:'1:1',text_uthmani:'بِسْمِ ٱللَّهِ',page_number:1,juz_number:1,hizb_number:1,translations:[{resource_id:85,text:'Translation text'}],audio:{url:'Alafasy/mp3/001001.mp3'}};
    if(!omitScriptText&&fields.includes('text_indopak'))verse.text_indopak='بِسْمِ اللّٰهِ';
    if(!omitScriptText&&fields.includes('text_uthmani_tajweed'))verse.text_uthmani_tajweed=malformedTajweed?'<img src=x onerror="evil()">':'<tajweed class="ghn">بِسْمِ</tajweed><script>provider()</script>';
    if(requestUrl.searchParams.get('words')==='true')verse.words=Array.from({length:81},(_,index)=>({position:index+1,text_uthmani:`و${index+1}`,translation:{text:`meaning ${index+1}`,language_name:'english'},transliteration:{text:`word${index+1}`},audio_url:index===1?'https://evil.test/word.mp3':'https://audio.qurancdn.com/word.mp3'}));
    return Response.json({verses:[verse],pagination:{current_page:1,next_page:null,total_pages:1,total_records:1}});
  };
  return {calls,fetcher};
}
test('Live-shaped content uses server credentials, caches requests, and exposes only content',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  const bootstrap=await client.bootstrap();assert.equal(bootstrap.environment,'prelive');assert.equal(bootstrap.translations.length,2);
  assert.equal(bootstrap.tafsirs[0].author,'Hafiz Ibn Kathir');
  assert.equal(bootstrap.chapters[0].revelationPlace,'makkah');assert.equal(bootstrap.chapters[0].translatedName,'The Opening');
  assert.deepEqual(bootstrap.chapterReciters,[{id:77,name:'Chapter Reciter',style:'Murattal'}]);
  const params=new URLSearchParams({chapter:'1',translation:'85',recitation:'7'});
  const verses=await client.verses(params);assert.equal(verses.verses[0].key,'1:1');assert.equal(verses.verses[0].audio,'https://verses.quran.com/Alafasy/mp3/001001.mp3');
  const count=f.calls.length;await client.verses(params);assert.equal(f.calls.length,count);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth2/token')).length,1);
  assert(!JSON.stringify({bootstrap,verses}).includes('test-secret'));assert(!JSON.stringify(verses).includes('test-token'));
  assert(f.calls.every(c=>c.url.startsWith('https://prelive-oauth2.quran.foundation/')||c.url.startsWith('https://apis-prelive.quran.foundation/')));
});
test('Verse script and word opt-ins preserve source Arabic, use documented fields, and fail closed when absent',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  const result=await client.verses(new URLSearchParams('chapter=1&script=tajweed&words=1'));
  const verse=result.verses[0];
  assert.equal(result.script,'tajweed');assert.equal(result.wordsAvailable,true);
  assert.equal(verse.arabic,'بِسْمِ ٱللَّهِ');assert.equal(verse.scriptAvailable,true);
  assert.equal(verse.scriptText,'<tajweed class="ghn">بِسْمِ</tajweed><script>provider()</script>');
  assert.equal(verse.pageNumber,1);assert.equal(verse.juzNumber,1);assert.equal(verse.hizbNumber,1);
  assert.equal(verse.words.length,80);assert.equal(verse.words[0].audio,'https://audio.qurancdn.com/word.mp3');assert.equal(verse.words[1].audio,null);
  assert.deepEqual(verse.words[0],{position:1,text:'و1',meaning:'meaning 1',meaningLanguage:'english',transliteration:'word1',audio:'https://audio.qurancdn.com/word.mp3'});
  const request=new URL(f.calls.find(call=>call.url.includes('/verses/by_chapter/1?')).url);
  assert.equal(request.searchParams.get('fields'),'text_uthmani,text_uthmani_tajweed');assert.equal(request.searchParams.get('words'),'true');assert.equal(request.searchParams.get('word_fields'),'text_uthmani');
  const missing=await createQuranClient(config,fixture({omitScriptText:true}).fetcher).verses(new URLSearchParams('chapter=1&script=indopak'));
  assert.equal(missing.verses[0].arabic,'بِسْمِ ٱللَّهِ');assert.equal(missing.verses[0].scriptText,null);assert.equal(missing.verses[0].scriptAvailable,false);
  assert.deepEqual(missing.verses[0].words,[]);assert.equal(missing.wordsAvailable,false);
  const malformed=await createQuranClient(config,fixture({malformedTajweed:true}).fetcher).verses(new URLSearchParams('chapter=1&script=tajweed'));
  assert.equal(malformed.verses[0].scriptAvailable,false);
  assert.equal(malformed.verses[0].scriptText,null);
});
test('Optional chapter information returns bounded provider description and clear unavailability',async()=>{
  const info=await createQuranClient(config,fixture().fetcher).chapterInfo(new URLSearchParams('chapter=1'));
  assert.deepEqual(info,{chapter:1,description:'<p>Provider description <script>untrusted()</script></p>',source:'Quran Foundation test source',available:true});
  const unavailable=await createQuranClient(config,fixture({chapterInfoUnavailable:true}).fetcher).chapterInfo(new URLSearchParams('chapter=1'));
  assert.deepEqual(unavailable,{chapter:1,description:null,source:null,available:false});
});
test('Whole-surah audio uses its separate listed reciter catalogue and strict HTTPS host validation',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  const audio=await client.chapterAudio(new URLSearchParams('chapter=1&reciter=77'));
  assert.deepEqual(audio,{audio:'https://download.quranicaudio.com/quran/test/001.mp3',reciter:{id:77,name:'Chapter Reciter',style:'Murattal'},available:true});
  await assert.rejects(()=>client.chapterAudio(new URLSearchParams('chapter=1&reciter=7')),error=>error.code==='unavailable_resource'&&error.status===400);
  assert.equal(f.calls.some(call=>call.url.includes('/chapter_recitations/7/1')),false);
  const badHost=await createQuranClient(config,fixture({chapterAudioUrl:'https://evil.test/001.mp3'}).fetcher).chapterAudio(new URLSearchParams('chapter=1&reciter=77'));
  assert.deepEqual(badHost,{audio:null,reciter:{id:77,name:'Chapter Reciter',style:'Murattal'},available:false});
  const catalogueUnavailable=await createQuranClient(config,fixture({chapterRecitersUnavailable:true}).fetcher).chapterAudio(new URLSearchParams('chapter=1&reciter=77'));
  assert.deepEqual(catalogueUnavailable,{audio:null,reciter:null,available:false});
});
test('Mushaf page, juz and hizb jumps return only a verified first ayah and bounded chapter chunk',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  for (const unit of ['page','juz','hizb']) {
    const value=await client.navigate(new URLSearchParams({unit,number:'1'}));
    assert.deepEqual(value,{key:'1:1',chapter:1,page:1,unit,number:1});
    assert(f.calls.some(call=>call.url.includes(`/verses/by_${unit}/1?per_page=1&page=1`)));
  }
  const before=f.calls.length;
  await client.navigate(new URLSearchParams('unit=page&number=1'));
  assert.equal(f.calls.length,before,'first-verse navigation is short-cached');
  for (const query of ['unit=page&number=605','unit=juz&number=31','unit=hizb&number=61','unit=page&number=00','unit=page&number=1&number=2','unit=evil&number=1','unit=page&number=1&url=https://evil.test'])
    await assert.rejects(()=>client.navigate(new URLSearchParams(query)),error=>error.status===400,query);
  const bad=createQuranClient(config,fixture({locationMismatch:true}).fetcher);
  await assert.rejects(()=>bad.navigate(new URLSearchParams('unit=page&number=1')),error=>error.code==='provider_unavailable');
});
test('Exact internal ayah study returns only verified provider verse, named translation, notes, tafsir and recitation',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  const study=await client.ayah(new URLSearchParams({key:'1:1',translation:'85',recitation:'7',tafsir:'169'}));
  assert.equal(study.key,'1:1');assert.equal(study.chapterName,'Al-Fatihah');assert.equal(study.page,1);
  assert.match(study.translation, /<sup>1<\/sup>/);assert.equal(study.footnotes[0].text,'Translator source note.');
  assert.equal(study.tafsir,'<p>Named commentary.</p>');assert.equal(study.tafsirSource.author,'Hafiz Ibn Kathir');
  assert.equal(study.audio,'https://verses.quran.com/Alafasy/mp3/001001.mp3');
  assert(!JSON.stringify(study).includes('test-secret'));assert(!JSON.stringify(study).includes('test-token'));
  assert(f.calls.every(c=>!c.url.includes('example.com')));
});
test('Referenced translation footnotes load from official bounded foot_notes/{id} API and cache by ID',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  const params=new URLSearchParams({key:'1:1',translation:'203'});
  const verse=await client.ayah(params);
  assert.match(verse.translation, /<sup foot_note=254690>1<\/sup>/);
  assert.deepEqual(verse.footnotes,[{id:'1',text:'Verified standalone source footnote.'}]);
  assert.equal(verse.footnotesIncomplete,false);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/foot_notes/254690')).length,1);
  await client.ayah(params);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/foot_notes/254690')).length,1);
  const denied=await createQuranClient(config,fixture({optionalDenied:true}).fetcher).ayah(params);
  assert.equal(denied.footnotesAvailable,false);
  assert.equal(denied.footnotesIncomplete,true);
  assert.deepEqual(denied.footnotes,[]);
});
test('Ayah study rejects duplicate, unlisted or malformed resources before the provider detail call',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  for(const input of ['key=../1%3A1','key=1%3A8','key=01%3A1','key=1%3A1&key=1%3A1','key=1%3A1&tafsir=999','key=1%3A1&translation=999','key=1%3A1&url=https%3A%2F%2Fevil.test'])
    await assert.rejects(()=>client.ayah(new URLSearchParams(input)), e=>e.status===400, input);
  assert.equal(f.calls.some(c=>c.url.includes('evil.test')),false);
});
test('Unsupported optional footnotes and tafsir remain visibly unavailable without replacing the Quranic verse',async()=>{
  const f=fixture({optionalDenied:true}),client=createQuranClient(config,f.fetcher);
  const study=await client.ayah(new URLSearchParams({key:'1:1',translation:'85',tafsir:'169'}));
  assert.equal(study.arabic,'بِسْمِ ٱللَّهِ');
  assert.equal(study.translation,'Source translation');
  assert.equal(study.footnotesAvailable,false);assert.equal(study.tafsirAvailable,false);
  assert.deepEqual(study.footnotes,[]);assert.equal(study.tafsir,null);
});
test('Reject unavailable resources, duplicate parameters and arbitrary upstream targets',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  for(const query of ['chapter=114','chapter=1&translation=999','chapter=1&url=https://example.com','chapter=1&chapter=2','chapter=../x','chapter=1&page=999','chapter=1&script=evil','chapter=1&script=uthmani&script=indopak','chapter=1&words=0','chapter=1&words=1&words=1']) await assert.rejects(()=>client.verses(new URLSearchParams(query)),e=>e.status===400);
  for(const query of ['chapter=1&chapter=1','chapter=1&url=https://example.com']) await assert.rejects(()=>client.chapterInfo(new URLSearchParams(query)),e=>e.status===400);
  for(const query of ['chapter=1&reciter=77&reciter=77','chapter=1&reciter=77&url=https://example.com','chapter=1&reciter=0']) await assert.rejects(()=>client.chapterAudio(new URLSearchParams(query)),e=>e.status===400);
  assert(f.calls.every(c=>!c.url.includes('example.com')));
});
test('A 401 obtains a fresh token once; a 403 is not retried',async()=>{
  const f=fixture({rejectOnce:true}),client=createQuranClient(config,f.fetcher);await client.bootstrap();assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth2/token')).length,2);
  const d=fixture({denied:true});await assert.rejects(()=>createQuranClient(config,d.fetcher).bootstrap(),e=>e.code==='access_pending'&&!e.message.includes('test-secret'));
  assert.equal(d.calls.filter(c=>c.url.endsWith('/chapters')).length,1);
});
test('Quran response routes only the two exact optional GET paths with deterministic provider data',async()=>{
  const f=fixture(),originalFetch=globalThis.fetch;globalThis.fetch=f.fetcher;
  try {
    const info=await quranResponse(new Request('https://dragon.test/api/quran/chapter?chapter=1'),config);
    assert.equal(info.status,200);assert.equal((await info.json()).available,true);
    const audio=await quranResponse(new Request('https://dragon.test/api/quran/chapter-audio?chapter=1&reciter=77'),config);
    assert.equal(audio.status,200);assert.equal((await audio.json()).audio,'https://download.quranicaudio.com/quran/test/001.mp3');
    const duplicate=await quranResponse(new Request('https://dragon.test/api/quran/chapter?chapter=1&chapter=1'),config);assert.equal(duplicate.status,400);
    const wrongPath=await quranResponse(new Request('https://dragon.test/api/quran/chapter/extra?chapter=1'),config);assert.equal(wrongPath.status,404);
  } finally { globalThis.fetch=originalFetch; }
});
test('Unsafe audio, cross-site requests and writes are rejected',async()=>{
  assert.equal(audioUrl('//mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3'),'https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3');
  for(const path of ['javascript:alert(1)','//evil.test/a.mp3','https://evil.test/a.mp3','https://user:password@verses.quran.com/a.mp3'])assert.equal(audioUrl(path),null);
  const cross=await quranResponse(new Request('https://dragon.test/api/quran/bootstrap',{headers:{origin:'https://other.test'}}),config);assert.equal(cross.status,403);
  const write=await quranResponse(new Request('https://dragon.test/api/quran/bootstrap',{method:'POST'}),config);assert.equal(write.status,405);
});
test('Missing runtime secrets return a safe error instead of fallback content',async()=>{
  const response=await quranResponse(new Request('https://dragon.test/api/quran/bootstrap'),{});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'not_configured'});assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
