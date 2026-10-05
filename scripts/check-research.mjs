// Script and data checks. This does not substitute for browser rendering QA.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'research.html'), 'utf8');
class Element {
  constructor(attrs = '') {
    this.dataset = {}; this.attrs = {}; this.listeners = {}; this.value = ''; this.hidden = false; this.disabled = false;
    for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) { this.attrs[m[1]] = m[2]; if (m[1].startsWith('data-')) this.dataset[m[1].slice(5)] = m[2]; }
  }
  set innerHTML(value) { this.content = value; if (value.includes('<option')) { const all = [...value.matchAll(/<option value="([^"]*)"([^>]*)>/g)]; this.value = (all.find(m => m[2].includes('selected')) || all[0])?.[1] || ''; } }
  get innerHTML() { return this.content || ''; }
  setAttribute(k,v) { this.attrs[k] = v; }
  addEventListener(k,v) { this.listeners[k] = v; }
  async fire(event = 'change') { this.listeners[event]?.({target:this}); await settle(); }
  click() { this.clicked = true; }
}
const elements = new Map();
for (const m of html.matchAll(/<([\w-]+)([^>]* id="([^"]+)"[^>]*)>/g)) {
  const el = new Element(m[2]); elements.set('#' + m[3], el);
  if (m[1] === 'select') el.innerHTML = html.slice(m.index + m[0].length).split('</select>')[0];
}
const translated = [...html.matchAll(/<([\w-]+)([^>]* data-r="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g)].map(m => {
  const el = new Element(m[2]); el.innerHTML = m[4]; return el;
});
const storage = new Map(); let csvBlob;
const context = vm.createContext({console,Intl,Map,Set,Blob,setTimeout,
  URL:{createObjectURL(blob){csvBlob=blob;return 'blob:test'},revokeObjectURL(){}},
  localStorage:{getItem:k => storage.get(k) ?? null,setItem:(k,v) => storage.set(k,v)},
  document:{documentElement:{},title:'',querySelector:s => { assert(elements.has(s),s); return elements.get(s); },querySelectorAll:s => s === '[data-r]' ? translated : [],createElement:() => new Element()},
  fetch:async p => ({ok:true,json:async () => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))}),
  window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'research-copy.js'),'utf8'),context);
const copy = context.window.DD_RESEARCH_COPY;
const allKeys = [...html.matchAll(/data-r="([^"]+)"/g)].map(m => m[1]);
for (const key of allKeys) assert(copy.ui[key]?.length === 2 && copy.ui[key].every(Boolean),`Translation missing: ${key}`);
for (const [key,texts] of Object.entries(copy.dynamic)) assert(texts.length === 3 && texts.every(Boolean),key);
for (const group of ['gaps','resources','activities','steps','methods']) for (const item of copy[group]) for (const field of ['title','body']) assert(item[field].length === 3 && item[field].every(Boolean));
const data = JSON.parse(fs.readFileSync(path.join(root,'data/population.json'),'utf8'));
assert.equal(data.districts.length,25); assert.equal(data.divisions.length,340);
for (const field of ['total','islam']) assert.equal(data.districts.reduce((n,r)=>n+r[field],0),data.national[field]);
let gnCount = 0;
for (const district of data.districts) {
  const ds = data.divisions.filter(d => d.district === district.id);
  const gn = JSON.parse(fs.readFileSync(path.join(root,`data/gn-${district.id}.json`),'utf8'));
  gnCount += gn.length;
  for (const field of ['total','islam']) assert.equal(ds.reduce((n,r)=>n+r[field],0),district[field]);
  for (const division of ds) assert.equal(gn.filter(r=>r.ds===division.id).reduce((n,r)=>n+r.total,0),division.total);
  assert(gn.every(r => r.islam === null || Number.isInteger(r.islam) && r.islam >= 10));
  assert.equal(new Set(gn.map(r=>r.id)).size,gn.length);
}
assert.equal(gnCount,14003);
const list=JSON.parse(fs.readFileSync(path.join(root,'data/mosques-anuradhapura.json'),'utf8'));
assert.equal(list.length,108); assert.equal(list[96].registration,'R/2141/A 112'); assert.equal(list[96].page,2);
vm.runInContext(fs.readFileSync(path.join(root,'research.js'),'utf8'),context);
async function settle(){await new Promise(resolve=>setImmediate(resolve));}
const $ = s => elements.get('#'+s);
await settle();
assert.equal($('district-select').value,'71');
assert.equal($('population-count').textContent,'22 results');
assert($('selected-stat').innerHTML.includes('83,979'));
assert.equal(($('population-rows').innerHTML.match(/<tr>/g)||[]).length,20);
await $('population-next').fire('click');
assert.equal(($('population-rows').innerHTML.match(/<tr>/g)||[]).length,2);
$('area-level').value='district'; await $('area-level').fire();
assert.equal($('population-count').textContent,'25 results'); assert($('district-select').disabled);
$('area-level').value='gn'; await $('area-level').fire();
assert.equal($('population-count').textContent,'694 results');
const east=data.divisions.find(d=>d.names.en==='Nuwaragam Palatha East');
$('division-select').value=east.id; await $('division-select').fire();
assert($('selected-stat').innerHTML.includes('3,135'));
assert($('population-rows').innerHTML.includes('Not separately reported'));
await $('export-population').fire('click');
const csv=await csvBlob.text();
assert(csv.includes('Census year'));assert(csv.includes('Not mosque membership.'));
assert(csv.includes('2024'));assert(csv.includes('GN_Level_Population_by_Religion'));
$('area-search').value='impossible-area-name';await $('area-search').fire('input');
assert($('population-rows').innerHTML.includes('No matching results'));assert($('export-population').disabled);
await $('find-our-mosque').fire('click');
assert.equal($('mosque-count').textContent,'1 results');
assert($('mosque-results').innerHTML.includes('JAMIA KADHEEJA JUMMAH MOSQUE'));
for(const lang of ['si','ta','en']){
 $('research-language').value=lang;await $('research-language').fire();
 assert.equal(context.document.documentElement.lang,lang);
 assert.equal(storage.get('dd-language'),JSON.stringify(lang));
 for(const [id,el]of elements)assert(!el.innerHTML.includes('undefined'),id);
}
console.log('Passed: translation coverage, census reconciliation, suppression, filtering, pagination, CSV export, mosque lookup and language persistence.');
