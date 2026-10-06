import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuranClient, audioUrl, quranResponse} from '../lib/quran.mjs';

const config = {QURAN_CLIENT_ID:'test-client',QURAN_CLIENT_SECRET:'test-secret',QURAN_ENVIRONMENT:'prelive'};
function fixture({rejectOnce=false, denied=false, optionalDenied=false}={}) {
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
    if(url.endsWith('/chapters'))return Response.json({chapters:[{id:1,name_simple:'Al-Fatihah',name_arabic:'الفاتحة',verses_count:7}]});
    if(url.endsWith('/resources/translations'))return Response.json({translations:[{id:85,name:'M.A.S. Abdel Haleem',author_name:'Abdul Haleem',language_name:'english',slug:'en-haleem'},{id:57,name:'Transliteration',language_name:'english',slug:'transliteration'}]});
    if(url.endsWith('/resources/recitations'))return Response.json({recitations:[{id:7,reciter_name:'Mishari Rashid al-`Afasy'}]});
    if(url.endsWith('/resources/tafsirs'))return Response.json({tafsirs:[{id:169,name:'Tafsir Ibn Kathir',author_name:'Hafiz Ibn Kathir',language_name:'english'}]});
    if(url.includes('/verses/by_key/1:1?'))return Response.json({verse:{verse_key:'1:1',text_uthmani:'بِسْمِ ٱللَّهِ',translations:[{resource_id:85,text:'Source translation'}],audio:{url:'Alafasy/mp3/001001.mp3'}}});
    if(url.includes('/quran/translations/85?verse_key=1:1&foot_notes=true'))return optionalDenied ? Response.json({error:'not_authorized'},{status:403}) : Response.json({translations:[{verse_key:'1:1',resource_id:85,text:'Source translation <sup>1</sup>',foot_notes:{1:'Translator source note.'}}]});
    if(url.includes('/quran/tafsirs/169?verse_key=1:1'))return optionalDenied ? Response.json({error:'not_authorized'},{status:403}) : Response.json({tafsirs:[{verse_key:'1:1',resource_id:169,text:'<p>Named commentary.</p>'}]});
    return Response.json({verses:[{verse_key:'1:1',text_uthmani:'بِسْمِ ٱللَّهِ',translations:[{resource_id:85,text:'Translation text'}],audio:{url:'Alafasy/mp3/001001.mp3'}}],pagination:{current_page:1,next_page:null,total_pages:1,total_records:1}});
  };
  return {calls,fetcher};
}
test('Live-shaped content uses server credentials, caches requests, and exposes only content',async()=>{
  const f=fixture(),client=createQuranClient(config,f.fetcher);
  const bootstrap=await client.bootstrap();assert.equal(bootstrap.environment,'prelive');assert.equal(bootstrap.translations.length,1);
  assert.equal(bootstrap.tafsirs[0].author,'Hafiz Ibn Kathir');
  const params=new URLSearchParams({chapter:'1',translation:'85',recitation:'7'});
  const verses=await client.verses(params);assert.equal(verses.verses[0].key,'1:1');assert.equal(verses.verses[0].audio,'https://verses.quran.com/Alafasy/mp3/001001.mp3');
  const count=f.calls.length;await client.verses(params);assert.equal(f.calls.length,count);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth2/token')).length,1);
  assert(!JSON.stringify({bootstrap,verses}).includes('test-secret'));assert(!JSON.stringify(verses).includes('test-token'));
  assert(f.calls.every(c=>c.url.startsWith('https://prelive-oauth2.quran.foundation/')||c.url.startsWith('https://apis-prelive.quran.foundation/')));
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
  for(const query of ['chapter=114','chapter=1&translation=999','chapter=1&url=https://example.com','chapter=1&chapter=2','chapter=../x','chapter=1&page=999']) await assert.rejects(()=>client.verses(new URLSearchParams(query)),e=>e.status===400);
  assert(f.calls.every(c=>!c.url.includes('example.com')));
});
test('A 401 obtains a fresh token once; a 403 is not retried',async()=>{
  const f=fixture({rejectOnce:true}),client=createQuranClient(config,f.fetcher);await client.bootstrap();assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth2/token')).length,2);
  const d=fixture({denied:true});await assert.rejects(()=>createQuranClient(config,d.fetcher).bootstrap(),e=>e.code==='access_pending'&&!e.message.includes('test-secret'));
  assert.equal(d.calls.filter(c=>c.url.endsWith('/chapters')).length,1);
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
