// Object storage is intentionally an injected server-side dependency. This module never issues
// a public object URL and is usable with R2, another S3-compatible private bucket, or a future
// private store after the owner chooses one.
const KEY = /^podcasts\/[A-Za-z0-9][A-Za-z0-9._/-]{0,399}$/;

export class PodcastStorageError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function assertPrivateStorageKey(key) {
  if (typeof key !== 'string' || !KEY.test(key) || key.includes('..') || key.includes('//')) throw new PodcastStorageError('invalid_storage_key');
  return key;
}

export function assertPrivateAudioStore(store) {
  if (!store || typeof store.put !== 'function' || typeof store.get !== 'function' || typeof store.remove !== 'function')
    throw new PodcastStorageError('private_storage_not_configured');
  return store;
}

export function unavailablePrivateAudioStore(reason = 'private_storage_not_configured') {
  const unavailable = async () => { throw new PodcastStorageError(reason); };
  return Object.freeze({kind: 'unconfigured', put: unavailable, get: unavailable, remove: unavailable});
}

// Test-only implementation. Production composition must inject an approved durable private store.
export function memoryPrivateAudioStore() {
  const objects = new Map();
  return {
    kind: 'memory-test-only',
    async put({key, bytes, contentType = 'audio/mpeg'}) {
      assertPrivateStorageKey(key);
      if (!Buffer.isBuffer(bytes) || !bytes.length) throw new PodcastStorageError('invalid_audio_bytes');
      objects.set(key, {bytes: Buffer.from(bytes), contentType});
      return {key, byteLength: bytes.length};
    },
    async get({key}) {
      assertPrivateStorageKey(key);
      const object = objects.get(key);
      if (!object) throw new PodcastStorageError('audio_not_found');
      return {bytes: Buffer.from(object.bytes), contentType: object.contentType};
    },
    async remove({key}) { assertPrivateStorageKey(key); objects.delete(key); },
  };
}

export async function privateMp3Response(store, key) {
  const audio = await assertPrivateAudioStore(store).get({key: assertPrivateStorageKey(key)});
  const id3 = Buffer.isBuffer(audio?.bytes) && audio.bytes.length >= 4 && audio.bytes.subarray(0, 3).toString('ascii') === 'ID3';
  const mpegFrame = Buffer.isBuffer(audio?.bytes) && audio.bytes.length >= 2 && audio.bytes[0] === 0xff && (audio.bytes[1] & 0xe0) === 0xe0;
  if (!id3 && !mpegFrame)
    throw new PodcastStorageError('invalid_stored_audio');
  return new Response(audio.bytes, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Vary': 'Cookie',
    },
  });
}
