// Controller regression checks; real browser layout is checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function reader(fetch) {
  const elements = new Map();
  for (const [, id] of source('quran.html').matchAll(/id="([^"]+)"/g)) {
    elements.set(id, {
      value: '', textContent: '', hidden: false, attrs: {}, listeners: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      replaceChildren() {},
    });
  }
  const context = vm.createContext({
    fetch, URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }, window: {},
    document: {
      documentElement: {}, body: { classList: { add() {}, remove() {} } },
      getElementById: id => elements.get(id), querySelectorAll: () => [],
    },
  });
  vm.runInContext(source('quran-copy.js'), context);
  vm.runInContext(source('quran.js'), context);
  return {
    el: id => elements.get(id), copy: context.window.DD_QURAN_COPY,
    language(value) { elements.get('quran-language').listeners.change({ target: { value } }); },
  };
}

test('Reader loading status follows language changes while a request is pending', () => {
  const ui = reader(() => new Promise(() => {}));
  ui.language('ta');
  assert.equal(ui.el('reader-status').textContent, ui.copy.loading[1]);
  ui.language('si');
  assert.equal(ui.el('reader-status').textContent, ui.copy.loading[2]);
});

for (const [code, key] of [['not_configured', 'error'], ['access_pending', 'access'], ['rate_limited', 'rate']]) {
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
