import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');

test('study page carries the documented API contract and safe source structure', () => {
  const html = read('public/study.html');
  const js = read('public/study.js');
  assert.match(html, /id="study-form"/);
  assert.match(html, /id="study-audio"[^>]*controls/);
  assert.match(html, /id="audio-speed"/);
  assert.match(html, /id="study-report-form"/);
  assert.match(html, /id="study-report-details" maxlength="600"/);
  assert.match(html, /id="study-question"[^>]*maxlength="600"/);
  assert.match(js, /fetch\('\/api\/study\/generate'/);
  assert.match(js, /JSON\.stringify\(\{ question, verse, language:languageField\.value, saveHistory:/);
  assert.match(js, /fetch\('\/api\/study\/narrate'/);
  assert.match(js, /JSON\.stringify\(\{ responseId \}\)/);
  assert.match(js, /fetch\('\/api\/study\/transcribe'/);
  assert.match(js, /fetch\('\/api\/study\/report'/);
  assert.match(js, /body: JSON\.stringify\(\{ responseId, reason:/);
  assert.match(js, /MAX_RECORDING_MS = 30000/);
  assert.match(js, /MAX_RECORDING_BYTES = 2 \* 1024 \* 1024/);
  assert.match(js, /responseIsValid/);
  assert.match(js, /safeSourceUrl/);
  assert.match(js, /safeAudioUrl/);
  assert.match(html, /id="study-availability"[^>]*role="status"/);
  assert.match(html, /id="study-submit"[^>]*disabled/);
  assert.match(js, /fetch\('\/api\/study\/availability'/);
  assert.match(js, /studyEnabled = data\?\.enabled === true/);
  assert.match(js, /if \(!studyEnabled \|\| recordingStarting \|\| activeRecorder \|\| recordingController\) return;/);
  assert.match(js, /'voice-start'\)\.hidden = !studyEnabled \|\| !micSupported/);
  for (const language of ['en', 'ta', 'si']) assert.match(js, new RegExp('\\b' + language + ": ['\"]"));
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.doesNotMatch(js, /insertAdjacentHTML/);
});

test('rapid Record activations while permission is pending create only one microphone stream', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, disabled: false, value: '', handlers: new Map(),
      addEventListener(name, handler) { this.handlers.set(name, handler); },
      pause() {}, load() {}, replaceChildren() {},
    });
    return nodes.get(id);
  };
  let resolvePermission;
  let requested = 0;
  let constructed = 0;
  let recorder;
  let stopped = false;
  class Recorder {
    constructor() { constructed++; recorder = this; this.handlers = new Map(); this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.handlers.get('stop')(); }
  }
  vm.runInNewContext(read('public/study.js'), {
    document: {getElementById: node, querySelectorAll: () => [], documentElement: {}, addEventListener() {}},
    window: {location: {search: ''}, MediaRecorder: Recorder}, MediaRecorder: Recorder,
    navigator: {mediaDevices: {getUserMedia() { requested++; return new Promise(resolve => { resolvePermission = resolve; }); }}},
    localStorage: {getItem: () => null}, URLSearchParams, setTimeout, clearTimeout, AbortController, Blob, FormData,
    fetch: async url => { assert.equal(url, '/api/study/availability'); return {ok: true, json: async () => ({enabled: true})}; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('study-submit').disabled, false);
  assert.equal(node('voice-start').hidden, false);
  const start = node('voice-start').handlers.get('click');
  const first = start();
  const second = start();
  assert.equal(requested, 1);
  assert.equal(node('voice-start').disabled, true);
  resolvePermission({getTracks: () => [{stop() { stopped = true; }}]});
  await Promise.all([first, second]);
  assert.equal(constructed, 1);
  recorder.stop();
  assert.equal(stopped, true);
});

test('study styles cover narrow access, visible focus, and reduced motion', () => {
  const css = read('public/study.css');
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.study-provider-note/);
});

test('Quran reader receives delegated Study this ayah links without editing quran.js', () => {
  const quranCopy = read('public/quran-copy.js');
  assert.match(quranCopy, /data-study-ayah/);
  assert.match(quranCopy, /root\.addEventListener\('click'/);
  assert.match(quranCopy, /\/study\?verse=/);
  assert.doesNotMatch(read('public/quran.js'), /data-study-ayah/);
});

test('mosque default uses a transparent ambiguous-name group and retains source records', () => {
  const records = JSON.parse(read('public/data/mosques-anuradhapura.json'));
  const exactMohideen = records.filter(record => record.name === 'MOHIDEEN JUMMA MOSQUE');
  assert.equal(records.length, 108);
  assert.equal(exactMohideen.length, 15);
  assert.equal(records.find(record => record.entry === 97)?.registration, 'R/2141/A 112');
  const js = read('public/mosques.js');
  assert.match(js, /MOHIDEEN_NAME = 'MOHIDEEN JUMMA MOSQUE'/);
  assert.match(js, /groupTitle/);
  assert.match(js, /records\.filter\(record=>record\.name===MOHIDEEN_NAME\)/);
  assert.match(js, /fetch\('\/api\/mosques'\)/);
  assert.match(js, /governmentRecordsPreserved/);
  assert.match(js, /directory-community-overlay/);
  assert.match(js, /correction\.proposedFields/);
  assert.match(js, /correction\.evidenceUrl/);
  assert.match(js, /if\(query\)/);
  assert.match(js, /relevance\(a,query\)/);
});

test('factual policy routes are present and avoid unsupported privacy claims', () => {
  const privacy = read('public/privacy.html');
  assert.match(privacy, /Quran\.ai/);
  assert.match(privacy, /Google/);
  assert.match(privacy, /does not send an account ID/);
  assert.match(privacy, /privacy tier has not been verified/);
  assert.match(privacy, /do not assume a no-training or paid-tier protection/);
  for (const file of ['public/terms.html', 'public/sources.html', 'public/accessibility.html']) {
    assert.match(read(file), /<main class="community-main"/);
  }
});
