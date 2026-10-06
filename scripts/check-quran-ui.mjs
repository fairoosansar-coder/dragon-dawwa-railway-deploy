// Controller regression checks; real browser layout is checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function reader(fetch) {
  const elements = new Map();
  const store = new Map();
  for (const [, id] of source('quran.html').matchAll(/id="([^"]+)"/g)) {
    elements.set(id, {
      value: '', textContent: '', hidden: false, attrs: {}, listeners: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      replaceChildren() {},
    });
  }
  const modes = [...source('quran.html').matchAll(/data-mode="(verse|arabic|translation)"/g)].map(([, mode]) => ({
    dataset: { mode }, attrs: {}, listeners: {},
    setAttribute(name,value) { this.attrs[name] = value; },
    addEventListener(name,listener) { this.listeners[name] = listener; },
  }));
  const context = vm.createContext({
    fetch, URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key,value) => store.set(key,value) }, window: {},
    location: { search: '', assign() {} },
    document: {
      documentElement: {}, body: { classList: { add() {}, remove() {} }, dataset: {}, style: {setProperty() {}} },
      getElementById: id => elements.get(id), querySelectorAll: selector => selector === '[data-mode]' ? modes : [],
    },
  });
  vm.runInContext(source('quran-copy.js'), context);
  vm.runInContext(source('quran.js'), context);
  return {
    el: id => elements.get(id), copy: context.window.DD_QURAN_COPY,
    language(value) { elements.get('quran-language').listeners.change({ target: { value } }); },
    mode: value => modes.find(button => button.dataset.mode === value),
    preference: () => JSON.parse(store.get('dd-quran-reader') || '{}'),
  };
}

test('Reader modes, Arabic size and word-level preference are local and reversible', () => {
  const ui = reader(() => new Promise(() => {}));
  ui.mode('arabic').listeners.click();
  assert.equal(ui.el('verses').hidden,true);
  assert.equal(ui.el('reading-flow').hidden,false);
  assert.equal(ui.preference().view,'arabic');
  ui.el('arabic-size').listeners.input({target:{value:'52'}});
  assert.equal(ui.preference().size,52);
  ui.el('show-words').listeners.change({target:{checked:true}});
  assert.equal(ui.preference().words,true);
  assert.equal(ui.preference().view,'verse');
  ui.el('reset-reader').listeners.click();
  assert.deepEqual(ui.preference(), {view:'verse',script:'uthmani',size:38,words:false});
});

test('Reader loading status follows language changes while a request is pending', () => {
  const ui = reader(() => new Promise(() => {}));
  ui.language('ta');
  assert.equal(ui.el('reader-status').textContent, ui.copy.loading[1]);
  ui.language('si');
  assert.equal(ui.el('reader-status').textContent, ui.copy.loading[2]);
});

for (const [code, key] of [['not_configured', 'notConfigured'], ['access_pending', 'access'], ['rate_limited', 'rate']]) {
  test(`${code} remains localized after failure and retry`, async () => {
    const ui = reader(async () => ({ ok: false, json: async () => ({ error: code }) }));
    await settle();
    assert.equal(ui.el('reader-status').textContent, ui.copy[key][0]);
    ui.language('ta');
    assert.equal(ui.el('reader-status').textContent, ui.copy[key][1]);
    assert.equal(ui.el('retry-reader').hidden, false);
    ui.el('retry-reader').listeners.click();
    assert.equal(ui.el('reader-status').textContent, ui.copy.loading[1]);
    await settle();
    ui.language('si');
    assert.equal(ui.el('reader-status').textContent, ui.copy[key][2]);
    assert.equal(ui.el('verses').attrs['aria-busy'], 'false');
  });
}
