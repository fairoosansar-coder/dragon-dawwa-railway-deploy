-- Additive invited-member storage. Apply only through the existing migration tracker.
-- Private contact fields are deliberately absent from administrative list queries.
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id VARCHAR(200) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  avatar_preset VARCHAR(16) NOT NULL DEFAULT 'none',
  preferred_language VARCHAR(2) NOT NULL DEFAULT 'en',
  city VARCHAR(120) NULL,
  mosque VARCHAR(160) NULL,
  contact_value VARCHAR(320) NULL,
  contact_preference VARCHAR(16) NOT NULL DEFAULT 'none',
  contact_opt_in TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT member_profiles_pk PRIMARY KEY (user_id)
);

CREATE INDEX member_profiles_created_idx ON member_profiles (created_at);
CREATE INDEX member_profiles_name_idx ON member_profiles (display_name);

CREATE TABLE IF NOT EXISTS member_saves (
  user_id VARCHAR(200) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  item_id VARCHAR(120) NOT NULL,
  saved_at VARCHAR(40) NOT NULL,
  CONSTRAINT member_saves_pk PRIMARY KEY (user_id, kind, item_id)
);

CREATE INDEX member_saves_user_created_idx ON member_saves (user_id, saved_at);

CREATE TABLE IF NOT EXISTS member_progress (
  user_id VARCHAR(200) NOT NULL,
  chapter INTEGER NOT NULL,
  page INTEGER NOT NULL,
  ayah_key VARCHAR(16) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT member_progress_pk PRIMARY KEY (user_id)
);

-- This table intentionally contains a keyed pseudonym instead of a Manus/open ID.
-- Existing review_roles records retain only their necessary staff/role audit IDs.
CREATE TABLE IF NOT EXISTS member_deletion_audit (
  id VARCHAR(64) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  role_before VARCHAR(20) NOT NULL,
  deleted_at VARCHAR(40) NOT NULL,
  CONSTRAINT member_deletion_audit_pk PRIMARY KEY (id),
  CONSTRAINT member_deletion_audit_subject_once UNIQUE (subject_hash)
);

CREATE INDEX member_deletion_audit_deleted_idx ON member_deletion_audit (deleted_at);
