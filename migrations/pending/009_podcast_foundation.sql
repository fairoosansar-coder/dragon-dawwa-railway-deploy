-- PENDING phase-two podcast foundation. Do NOT move this into migrations/ until the Hadith
-- Research Agents feature supplies its required 008_hadith.sql migration and the owner permits
-- that implementation. It contains no provider secret, no BLOB audio, no public URL, no seed
-- generation, and no worker DDL.

CREATE TABLE IF NOT EXISTS podcast_voices (
  language VARCHAR(2) NOT NULL,
  speaker VARCHAR(32) NOT NULL,
  voice_id VARCHAR(64) NOT NULL,
  seat_pan DECIMAL(4,2) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  approved_by VARCHAR(200) NULL,
  approved_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_voices_pk PRIMARY KEY (language, speaker),
  CONSTRAINT podcast_voices_voice_unique UNIQUE (language, voice_id)
);

-- Object keys are opaque private-store identifiers. Audio bytes must never be inserted here.
CREATE TABLE IF NOT EXISTS podcast_assets (
  id VARCHAR(96) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  language VARCHAR(2) NULL,
  speaker VARCHAR(32) NULL,
  storage_key VARCHAR(420) NULL,
  sha256 CHAR(64) NULL,
  byte_length BIGINT NULL,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'pending_import',
  approved_by VARCHAR(200) NULL,
  approved_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_assets_pk PRIMARY KEY (id),
  CONSTRAINT podcast_assets_storage_unique UNIQUE (storage_key)
);

-- `report_revision_id` intentionally has no FK: the Hadith Research Agents report schema is not
-- present in this repository. The future report adapter must verify the exact immutable revision.
CREATE TABLE IF NOT EXISTS podcast_episodes (
  id VARCHAR(96) NOT NULL,
  report_revision_id VARCHAR(140) NOT NULL,
  language VARCHAR(2) NOT NULL,
  title VARCHAR(240) NOT NULL,
  script_json LONGTEXT NOT NULL,
  script_hash CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'script_drafted',
  script_reviewer_id VARCHAR(200) NULL,
  script_approved_at VARCHAR(40) NULL,
  language_reviewer_id VARCHAR(200) NULL,
  language_approved_at VARCHAR(40) NULL,
  recitation_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  recitation_asset_id VARCHAR(96) NULL,
  final_storage_key VARCHAR(420) NULL,
  final_sha256 CHAR(64) NULL,
  duration_seconds DECIMAL(12,3) NULL,
  integrated_lufs DECIMAL(6,2) NULL,
  true_peak_dbtp DECIMAL(6,2) NULL,
  listen_reviewer_id VARCHAR(200) NULL,
  listen_approved_at VARCHAR(40) NULL,
  error_code VARCHAR(96) NULL,
  created_by VARCHAR(200) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_episodes_pk PRIMARY KEY (id),
  CONSTRAINT podcast_episodes_report_language_unique UNIQUE (report_revision_id, language),
  CONSTRAINT podcast_episodes_recitation_asset_fk FOREIGN KEY (recitation_asset_id) REFERENCES podcast_assets(id) ON DELETE RESTRICT,
  CONSTRAINT podcast_episodes_final_storage_unique UNIQUE (final_storage_key)
);

-- Line clips are durable only in approved private object storage. The cache key prevents paying
-- twice for the same exact language/speaker/voice/model/text input.
CREATE TABLE IF NOT EXISTS podcast_line_cache (
  id VARCHAR(64) NOT NULL,
  cache_key CHAR(64) NOT NULL,
  language VARCHAR(2) NOT NULL,
  speaker VARCHAR(32) NOT NULL,
  voice_id VARCHAR(64) NOT NULL,
  model_id VARCHAR(96) NOT NULL,
  storage_key VARCHAR(420) NULL,
  sha256 CHAR(64) NULL,
  duration_seconds DECIMAL(12,3) NULL,
  qa_similarity DECIMAL(6,4) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  error_code VARCHAR(96) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_line_cache_pk PRIMARY KEY (id),
  CONSTRAINT podcast_line_cache_key_unique UNIQUE (cache_key),
  CONSTRAINT podcast_line_cache_storage_unique UNIQUE (storage_key)
);

-- Provider calls contain only operational metadata. Request text, transcript text, audio and keys
-- are intentionally absent; the script is already held in the access-controlled episode row.
CREATE TABLE IF NOT EXISTS podcast_jobs (
  id VARCHAR(64) NOT NULL,
  episode_id VARCHAR(96) NOT NULL,
  line_id VARCHAR(96) NULL,
  stage VARCHAR(32) NOT NULL,
  provider_operation VARCHAR(32) NOT NULL,
  model_id VARCHAR(96) NULL,
  voice_id VARCHAR(64) NULL,
  cache_key CHAR(64) NULL,
  character_count INTEGER NULL,
  provider_credits DECIMAL(16,4) NULL,
  provider_request_id VARCHAR(128) NULL,
  status VARCHAR(24) NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(96) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_jobs_pk PRIMARY KEY (id),
  CONSTRAINT podcast_jobs_episode_fk FOREIGN KEY (episode_id) REFERENCES podcast_episodes(id) ON DELETE CASCADE
);
CREATE INDEX podcast_jobs_episode_idx ON podcast_jobs (episode_id, stage, status, updated_at);
CREATE INDEX podcast_jobs_cache_idx ON podcast_jobs (cache_key, status);

-- A global daily ledger supports atomic cap reservation in the future one-at-a-time worker.
CREATE TABLE IF NOT EXISTS podcast_usage_daily (
  usage_date VARCHAR(10) NOT NULL,
  tts_requests INTEGER NOT NULL DEFAULT 0,
  tts_characters INTEGER NOT NULL DEFAULT 0,
  stt_requests INTEGER NOT NULL DEFAULT 0,
  music_requests INTEGER NOT NULL DEFAULT 0,
  sound_requests INTEGER NOT NULL DEFAULT 0,
  provider_credits DECIMAL(16,4) NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_usage_daily_pk PRIMARY KEY (usage_date)
);

CREATE TABLE IF NOT EXISTS podcast_runtime_locks (
  lock_key VARCHAR(64) NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT podcast_runtime_locks_pk PRIMARY KEY (lock_key)
);
