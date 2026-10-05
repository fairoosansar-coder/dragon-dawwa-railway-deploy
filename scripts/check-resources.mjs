import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const catalogue = JSON.parse(await readFile(new URL('../public/data/starter-resources.json',import.meta.url),'utf8'));
const routes = JSON.parse(await readFile(new URL('../public/manus-routes.json',import.meta.url),'utf8'));
const categories = new Set([
  'Getting started with Quran study',
  'Finding source references',
  'Everyday learning and good character',
  'Family and community learning',
  'New Muslim learning resources',
  'Local community information',
]);
assert.equal(catalogue.reviewedAt,'2026-10-05');
assert.equal(catalogue.items?.length,12,'twelve curated originals, not duplicate source URLs');
assert.equal(new Set(catalogue.items.map(item=>item.id)).size,12);
assert.equal(new Set(catalogue.items.map(item=>item.url)).size,12);
assert.deepEqual(new Set(catalogue.items.map(item=>item.category)),categories);
for (const item of catalogue.items) {
  assert.equal(item.verified,true,`unverified source: ${item.id}`);
  assert.match(item.id,/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/);
  for (const field of ['title','publisher','summary','format','rightsNote','evidence_url'])
    assert.ok(typeof item[field] === 'string' && item[field].trim(),`${item.id}: ${field}`);
  assert.ok(item.summary.length > 55 && item.summary.length < 820,`${item.id}: original navigational summary is neither empty nor reproduced long-form content`);
  assert.ok(Array.isArray(item.languages) && item.languages.length > 0,`${item.id}: observed languages`);
  const u = new URL(item.url), evidence = new URL(item.evidence_url);
  assert.equal(u.protocol,'https:');assert.equal(evidence.protocol,'https:');
  assert.ok(!u.username && !u.password && !/javascript:|<iframe|<script/i.test(JSON.stringify(item)),`${item.id}: unsafe URL or embedded work`);
  assert.match(item.rightsNote,/LINK ONLY/i,`${item.id}: no unrestricted reuse claim`);
}
const paths = new Set(routes.routes.map(entry=>entry.path));
for (const route of ['/resources','/member','/staff','/recover','/signed-out']) assert.ok(paths.has(route),`missing route ${route}`);
console.log('PASS catalogue: 12 unique, verified, HTTPS, link-only originals across 6 themes with source/language/format, and new routes declared. This is metadata and source provenance validation, not scholarly or copyright certification.');
