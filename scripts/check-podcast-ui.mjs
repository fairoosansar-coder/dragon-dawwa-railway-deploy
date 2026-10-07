import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [member, player, production, reports, css] = await Promise.all([
  readFile(new URL('../public/podcasts.html', import.meta.url), 'utf8'), readFile(new URL('../public/podcast-player.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/podcast-production.html', import.meta.url), 'utf8'), readFile(new URL('../public/hadith-reports.html', import.meta.url), 'utf8'), readFile(new URL('../public/podcast-ui.css', import.meta.url), 'utf8'),
]);
for (const required of ['15 seconds', '0.75×', '1.25×', '1.5×', 'Sources', 'Chain and narrators', 'Supporting chains and scholars', 'Translation and verdict', 'AI-voiced research discussion', 'dir="rtl"']) assert.match(member, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(member, /No reviewed episodes are available yet/, 'member view must remain honest without a published episode');
assert.match(member, /class="podcast-source-chip" disabled/, 'fixture source chip must be a separately disabled control without a claim');
assert.match(member, /موضع التلاوة البشرية/, 'recitation fixture must use an Arabic RTL placeholder rather than false English Arabic content');
assert.match(player, /dd:audio-start/, 'podcast player must coordinate one-audio-at-a-time events');
assert.match(player, /event\.detail\?\.audio !== audio/, 'a second podcast player must pause when another audio instance starts');
assert.match(player, /mediaSession/, 'podcast player must progressively enhance Media Session controls');
assert.match(player, /dd-podcast-resume:/, 'podcast player must retain resume position client-side pending authenticated cross-device storage');
for (const required of ['Production board', 'Script review', 'Recitation', 'Asset library', 'Render and line QA', 'Final listen']) assert.match(production, new RegExp(required));
assert.doesNotMatch(production, /<input[^>]+type="file"(?![^>]+disabled)/, 'asset/recitation uploads must stay disabled before private R2 exists');
for (const required of ['Source book', 'Edition checked', 'Quoted wording checked by reviewer', 'Named grader', 'Grading reference', 'Qualified reviewer attestation']) assert.match(reports, new RegExp(required));
assert.match(css, /@media\(max-width:760px\)/, 'podcast interface must have mobile controls');
console.log('Podcast UI static checks passed: fixture-only, private, accessible player and staged staff controls.');
