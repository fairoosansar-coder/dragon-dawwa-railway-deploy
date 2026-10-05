import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, name), 'utf8');
const [staffHtml, staffJs, staffNav, staffCss, adminHtml, adminJs, opsHtml, opsJs] = await Promise.all([
  read('public/staff.html'), read('public/staff.js'), read('public/staff-nav.js'), read('public/staff.css'),
  read('public/admin.html'), read('public/admin.js'), read('public/operations.html'), read('public/operations.js'),
]);

for (const required of ['Dashboard', 'Content', 'Reviews', 'Events', 'Mosques', 'Members', 'Team', 'Inbox', 'Audit History', 'Settings']) {
  assert.match(staffHtml, new RegExp(`>${required}<`), `staff hub must expose ${required}`);
  assert.match(staffNav, new RegExp(`label:'${required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), `shared nav must include ${required}`);
}
assert.match(staffHtml, /data-owner-only/, 'owner-only staff controls must be marked for role-aware hiding');
assert.match(staffJs, /\/api\/admin\/members\?/, 'member index must use the planned paginated endpoint');
assert.match(staffJs, /\/api\/admin\/audit\?/, 'unified owner audit must use its paginated endpoint');
assert.match(staffJs, /\/api\/admin\/mosque-corrections\?/, 'mosque queue must use the versioned correction endpoint');
assert.match(staffHtml, /id="correction-form"/, 'evidence-backed community correction proposals must be editable without altering government rows');
assert.match(staffHtml, /id="limits-settings-form"/, 'only bounded owner settings must be editable');
assert.match(staffHtml, /id="study-ops-counts"/, 'the owner must see real private study/audio usage counters');
assert.match(staffCss, /@media \(max-width: 760px\)/, 'staff nav needs a mobile layout');

for (const page of [adminHtml, opsHtml]) {
  assert.match(page, /\/staff-nav\.js/, 'legacy staff page must load the shared navigation');
  assert.match(page, /data-staff-nav/, 'legacy staff page must provide a shared navigation mount');
}
assert.match(adminHtml, /value="quran"/, 'editorial classification must offer Quran reference');
assert.match(adminHtml, /value="hadith"/, 'editorial classification must offer Hadith reference');
assert.match(adminHtml, /not authenticity grades or scholar endorsements/, 'Quran/Hadith labels must remain honest');
assert.match(adminJs, /Object\.entries\(content\.review\?\.languages\|\|\{\}\)/, 'preview must read review language records as an object');
assert.doesNotMatch(adminJs, /content\.review\?\.languages\?\.length/, 'preview must not treat review-language object as an array');
assert.match(adminJs, /document-state-filter/, 'documents need state filtering');
assert.match(adminJs, /documentPage/, 'documents need client pagination');
assert.match(opsHtml, /archive-recording-confirm/, 'operations must ask for authorised archive-recording confirmation');
assert.match(opsJs, /authorizedRecording = true/, 'operations must send the archive-recording confirmation only for the narrow update');
for (const code of ['event_in_past', 'archive_only', 'recording_rights_required']) assert.match(opsJs, new RegExp(code), `operations must explain ${code}`);
for (const control of ['event-state-filter', 'inbox-kind-filter', 'role-state-filter']) assert.match(opsHtml, new RegExp(control), `operations must expose ${control}`);
assert.match(opsJs, /The current API returns at most 200 records and has no server pages/, 'capped event/inbox lists must not silently truncate');
assert.match(opsJs, /The current API returns at most 100 records and has no server pages/, 'capped role list must not silently truncate');

console.log('staff UI static contract checks passed');
