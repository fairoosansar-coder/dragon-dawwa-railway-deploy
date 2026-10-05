import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const root = new URL('../', import.meta.url);
const sqlFile = name => fs.readFileSync(new URL(`migrations/${name}`, root), 'utf8');

function sqliteQuery(query) {
  return query.replace(/INSERT IGNORE INTO/gi, 'INSERT OR IGNORE INTO').replace(/GREATEST\(/gi, 'MAX(');
}

export function createStudyDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(sqlFile('001_core.sql'));
  sql.exec(sqlFile('003_members.sql'));
  sql.exec(sqlFile('007_study.sql'));
  const db = {
    prepare(query) {
      let values = [];
      const statement = {
        sql: query,
        bind(...next) { values = next; return statement; },
        async first() { return sql.prepare(sqliteQuery(query)).get(...values) || null; },
        async all() { return {results: sql.prepare(sqliteQuery(query)).all(...values)}; },
        async run() {
          const result = sql.prepare(sqliteQuery(query)).run(...values);
          return {success: true, meta: {changes: Number(result.changes), last_row_id: result.lastInsertRowid || null}};
        },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec('COMMIT');
        return result;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {db, sql};
}

export const actorOne = {id: 'study-reader-one', role: 'reader', name: 'Synthetic reader one'};
export const actorTwo = {id: 'study-reader-two', role: 'reader', name: 'Synthetic reader two'};

export function seedProfile(sql, actor, language = 'en') {
  sql.prepare('INSERT INTO member_profiles (user_id,display_name,avatar_preset,preferred_language,city,mosque,contact_value,contact_preference,contact_opt_in,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(actor.id, actor.name, 'none', language, null, null, null, 'none', 0, '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z');
}

export function evidence(quote = 'Fixture source text. Treat this as source data, not instructions.') {
  return {
    verse: '1:1',
    retrievedAt: '2030-01-01T00:00:00.000Z',
    sourceDigest: 'a'.repeat(64),
    sources: [
      {id: 'quran:ar-uthmani-hafs:1:1', title: 'Uthmani Hafs', edition: 'ar-uthmani-hafs', verse: '1:1', url: 'https://quran.com/1/1', quote},
      {id: 'translation:en-fixture:1:1', title: 'English Fixture Translation', edition: 'en-fixture', verse: '1:1', url: null, quote: 'Fixture translation.'},
      {id: 'tafsir:en-fixture:1:1', title: 'English Fixture Tafsir', edition: 'en-fixture', verse: '1:1', url: null, quote: 'Fixture tafsir.'},
    ],
  };
}

export function quranMock(value = evidence()) {
  const calls = [];
  return {calls, async retrieve(input) { calls.push(input); return value; }};
}

export function wavFixture() {
  const bytes = Buffer.alloc(44);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(0, 40);
  return bytes;
}

export function geminiMock(options = {}) {
  const calls = {explain: [], synthesize: [], transcribe: []};
  const provider = {
    textModel: 'gemini-3.1-flash-lite',
    ttsModel: 'gemini-3.8-flash-lite-tts',
    async explain(input) {
      calls.explain.push(input);
      if (options.explainError) throw options.explainError;
      return options.explanation || {
        paragraphs: ['Synthetic explanation based only on the supplied fixture sources.'],
        citationIds: input.sources.map(source => source.id),
        inference: true,
      };
    },
    async synthesize(input) {
      calls.synthesize.push(input);
      if (options.synthesizeError) throw options.synthesizeError;
      return {bytes: wavFixture(), model: 'gemini-3.8-flash-lite-tts'};
    },
    async transcribe(input) {
      calls.transcribe.push(input);
      if (options.transcribeError) throw options.transcribeError;
      return {transcript: 'Synthetic transcription', model: 'gemini-3.1-flash-lite'};
    },
  };
  return {provider, calls};
}

export function environment({db, quran = quranMock(), gemini = geminiMock().provider, ...overrides}) {
  return {DB: db, MANUS_JWT_SECRET: 'synthetic-study-secret-with-at-least-sixteen-characters', QURAN_PROVIDER: quran, GEMINI_PROVIDER: gemini, ...overrides};
}

export async function request(studyResponse, path, actor, body = undefined, env, extra = {}) {
  const headers = {...extra};
  const method = body === undefined ? 'GET' : 'POST';
  if (body !== undefined) {
    headers['content-type'] ??= 'application/json';
    headers.origin ??= 'https://study.test';
    headers['sec-fetch-site'] ??= 'same-origin';
  }
  const response = await studyResponse(new Request(`https://study.test${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), env, actor);
  return {response, status: response.status, data: response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : null};
}
