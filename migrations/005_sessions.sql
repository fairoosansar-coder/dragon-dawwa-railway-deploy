-- Review-only additive migration. Apply explicitly after a verified encrypted backup.
-- Do not run against the original Site, its D1 database, or any unapproved host.

-- Hashes make a copied token unusable after logout without retaining the token itself.
-- Rows are retained only through the signed eight-hour token expiry and are indexed for purge.
CREATE TABLE IF NOT EXISTS review_session_revocations (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(200) NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  revoked_at VARCHAR(40) NOT NULL,
  CONSTRAINT review_session_revocations_pk PRIMARY KEY (token_hash)
);
CREATE INDEX review_session_revocations_expiry_idx ON review_session_revocations (expires_at);
CREATE INDEX review_session_revocations_user_expiry_idx ON review_session_revocations (user_id, expires_at);

-- An epoch invalidates every older token for only one account (logout all),
-- including a legacy Preview-injected signed cookie without an application SID.
CREATE TABLE IF NOT EXISTS review_session_epochs (
  user_id VARCHAR(200) NOT NULL,
  revoked_after BIGINT UNSIGNED NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT review_session_epochs_pk PRIMARY KEY (user_id)
);

-- Provider resource IDs are optional and are validated against the live Quran
-- catalogue at write time by server/member.mjs; no provider URL is client input.
ALTER TABLE member_profiles ADD COLUMN preferred_translation_id INTEGER NULL;
ALTER TABLE member_profiles ADD COLUMN preferred_reciter_id INTEGER NULL;
