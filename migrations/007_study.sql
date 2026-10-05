-- Private source-grounded study data. Apply only through the operator-directed review
-- migration ledger after a verified backup; never run on the original Site/D1. This is
-- additive and contains no seed DML, public object URLs, retention deletes, or DDL at startup.

CREATE TABLE IF NOT EXISTS study_responses (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(200) NOT NULL,
  language VARCHAR(2) NOT NULL,
  verse_range VARCHAR(24) NULL,
  paragraphs_json LONGTEXT NOT NULL,
  sources_json LONGTEXT NOT NULL,
  source_digest CHAR(64) NOT NULL,
  disclosure TEXT NOT NULL,
  model_id VARCHAR(96) NOT NULL,
  prompt_version VARCHAR(32) NOT NULL,
  history_saved TINYINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  retrieved_at VARCHAR(40) NOT NULL,
  generated_at VARCHAR(40) NOT NULL,
  CONSTRAINT study_responses_pk PRIMARY KEY (id),
  CONSTRAINT study_responses_profile_fk FOREIGN KEY (user_id) REFERENCES member_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX study_responses_history_idx ON study_responses (user_id, history_saved, generated_at);
CREATE INDEX study_responses_active_idx ON study_responses (user_id, status, generated_at);

-- The job ledger is distinct from the BLOB. It gives a durable, idempotent view of synchronous
-- Preview work now and a safe handoff point to an approved future worker. Attempts never exceed
-- two user-triggered tries; no automatic/unbounded retry worker is registered by this migration.
CREATE TABLE IF NOT EXISTS study_audio_jobs (
  id VARCHAR(64) NOT NULL,
  response_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(200) NOT NULL,
  idempotency_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT study_audio_jobs_pk PRIMARY KEY (id),
  CONSTRAINT study_audio_jobs_idempotency_unique UNIQUE (response_id, idempotency_hash),
  CONSTRAINT study_audio_jobs_response_fk FOREIGN KEY (response_id) REFERENCES study_responses(id) ON DELETE CASCADE,
  CONSTRAINT study_audio_jobs_profile_fk FOREIGN KEY (user_id) REFERENCES member_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX study_audio_jobs_owner_idx ON study_audio_jobs (user_id, status, updated_at);

-- A member can flag their own generated answer without publishing it. This stores only a bounded
-- category/detail attached to the private response, never the original question or contact data.
CREATE TABLE IF NOT EXISTS study_response_reports (
  id VARCHAR(64) NOT NULL,
  response_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(200) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  details VARCHAR(600) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT study_response_reports_pk PRIMARY KEY (id),
  CONSTRAINT study_response_reports_response_fk FOREIGN KEY (response_id) REFERENCES study_responses(id) ON DELETE CASCADE,
  CONSTRAINT study_response_reports_profile_fk FOREIGN KEY (user_id) REFERENCES member_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX study_response_reports_queue_idx ON study_response_reports (status, created_at);

-- Audio is never an object-storage/public URL. Ready rows contain a bounded WAV BLOB; a
-- transient failed/generating row has NULL bytes and cannot be served by the private endpoint.
CREATE TABLE IF NOT EXISTS study_audio (
  id VARCHAR(64) NOT NULL,
  job_id VARCHAR(64) NOT NULL,
  response_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(200) NOT NULL,
  cache_key CHAR(64) NOT NULL,
  language VARCHAR(2) NOT NULL,
  voice VARCHAR(48) NOT NULL,
  model_id VARCHAR(96) NOT NULL,
  status VARCHAR(16) NOT NULL,
  audio_bytes MEDIUMBLOB NULL,
  byte_length INTEGER NULL,
  error_code VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT study_audio_pk PRIMARY KEY (id),
  CONSTRAINT study_audio_job_unique UNIQUE (job_id),
  CONSTRAINT study_audio_response_cache_unique UNIQUE (response_id, cache_key),
  CONSTRAINT study_audio_job_fk FOREIGN KEY (job_id) REFERENCES study_audio_jobs(id) ON DELETE CASCADE,
  CONSTRAINT study_audio_response_fk FOREIGN KEY (response_id) REFERENCES study_responses(id) ON DELETE CASCADE,
  CONSTRAINT study_audio_profile_fk FOREIGN KEY (user_id) REFERENCES member_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX study_audio_owner_idx ON study_audio (user_id, status, updated_at);

-- Scope keys are either 'global' or an HMAC pseudonym of the member ID. Each reservation is an
-- atomic conditional UPDATE after INSERT IGNORE; no raw question, contact data, or user ID is kept.
CREATE TABLE IF NOT EXISTS study_usage_daily (
  scope VARCHAR(16) NOT NULL,
  scope_key CHAR(64) NOT NULL,
  usage_date VARCHAR(10) NOT NULL,
  text_requests INTEGER NOT NULL DEFAULT 0,
  text_input_chars INTEGER NOT NULL DEFAULT 0,
  tts_requests INTEGER NOT NULL DEFAULT 0,
  tts_characters INTEGER NOT NULL DEFAULT 0,
  transcribe_requests INTEGER NOT NULL DEFAULT 0,
  transcribe_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT study_usage_daily_pk PRIMARY KEY (scope, scope_key, usage_date)
);

-- A fixed row admits a bounded number of simultaneous Gemini narration requests across every
-- process. It is incremented/decremented with an atomic conditional UPDATE, not an in-memory map.
CREATE TABLE IF NOT EXISTS study_runtime_locks (
  lock_key VARCHAR(64) NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT study_runtime_locks_pk PRIMARY KEY (lock_key)
);
