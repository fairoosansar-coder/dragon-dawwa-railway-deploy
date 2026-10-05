-- Review-only management schema. Apply explicitly through the existing migration ledger
-- after an approved backup; never run against the old Site/D1. This migration is additive
-- and deliberately contains no seed DML, automatic retention work, or destructive DDL.

CREATE TABLE IF NOT EXISTS managed_resources (
  id VARCHAR(64) NOT NULL,
  seed_key VARCHAR(120) NULL,
  title VARCHAR(240) NOT NULL,
  publisher VARCHAR(240) NOT NULL,
  publisher_url VARCHAR(2000) NOT NULL,
  resource_url VARCHAR(2000) NOT NULL,
  summary TEXT NOT NULL,
  category VARCHAR(160) NOT NULL,
  languages_json TEXT NOT NULL,
  resource_format VARCHAR(80) NOT NULL,
  rights_note TEXT NOT NULL,
  last_checked_on VARCHAR(10) NOT NULL,
  link_status VARCHAR(16) NOT NULL,
  review_state VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_by VARCHAR(191) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  archived_by VARCHAR(191) NULL,
  archived_at VARCHAR(40) NULL,
  CONSTRAINT managed_resources_pk PRIMARY KEY (id),
  CONSTRAINT managed_resources_seed_key_unique UNIQUE (seed_key)
);

CREATE INDEX managed_resources_visibility_idx ON managed_resources (status, review_state, link_status, updated_at);
CREATE INDEX managed_resources_seed_idx ON managed_resources (seed_key);

CREATE TABLE IF NOT EXISTS managed_resource_revisions (
  resource_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  action VARCHAR(24) NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT managed_resource_revisions_pk PRIMARY KEY (resource_id, version),
  CONSTRAINT managed_resource_revisions_resource_fk FOREIGN KEY (resource_id) REFERENCES managed_resources(id)
);

CREATE INDEX managed_resource_revisions_created_idx ON managed_resource_revisions (resource_id, created_at);

-- Corrections are overlays. original_json is a snapshot of the bundled government directory
-- entry selected by the server; it is never a client-supplied replacement directory row.
CREATE TABLE IF NOT EXISTS mosque_corrections (
  id VARCHAR(64) NOT NULL,
  directory_entry INTEGER NOT NULL,
  original_json LONGTEXT NOT NULL,
  proposal_json LONGTEXT NOT NULL,
  evidence_url VARCHAR(2000) NOT NULL,
  evidence_note VARCHAR(1000) NOT NULL,
  state VARCHAR(16) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  reviewed_by VARCHAR(191) NULL,
  reviewed_at VARCHAR(40) NULL,
  applied_by VARCHAR(191) NULL,
  applied_at VARCHAR(40) NULL,
  CONSTRAINT mosque_corrections_pk PRIMARY KEY (id)
);

CREATE INDEX mosque_corrections_queue_idx ON mosque_corrections (state, created_at);
CREATE INDEX mosque_corrections_directory_idx ON mosque_corrections (directory_entry, state);

CREATE TABLE IF NOT EXISTS mosque_correction_revisions (
  correction_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  state VARCHAR(16) NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(24) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT mosque_correction_revisions_pk PRIMARY KEY (correction_id, version),
  CONSTRAINT mosque_correction_revisions_correction_fk FOREIGN KEY (correction_id) REFERENCES mosque_corrections(id)
);

CREATE TABLE IF NOT EXISTS mosque_directory_overlays (
  directory_entry INTEGER NOT NULL,
  correction_id VARCHAR(64) NOT NULL,
  overlay_json LONGTEXT NOT NULL,
  applied_by VARCHAR(191) NOT NULL,
  applied_at VARCHAR(40) NOT NULL,
  CONSTRAINT mosque_directory_overlays_pk PRIMARY KEY (directory_entry),
  CONSTRAINT mosque_directory_overlays_correction_unique UNIQUE (correction_id),
  CONSTRAINT mosque_directory_overlays_correction_fk FOREIGN KEY (correction_id) REFERENCES mosque_corrections(id)
);

-- Workflow state separates restricted owner handling from submitted payload fields.
CREATE TABLE IF NOT EXISTS management_intake_state (
  submission_id VARCHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL,
  assigned_to VARCHAR(191) NULL,
  resolved_code VARCHAR(40) NULL,
  updated_by VARCHAR(191) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT management_intake_state_pk PRIMARY KEY (submission_id),
  CONSTRAINT management_intake_state_submission_fk FOREIGN KEY (submission_id) REFERENCES community_submissions(id)
);

CREATE INDEX management_intake_state_queue_idx ON management_intake_state (state, updated_at);

CREATE TABLE IF NOT EXISTS management_intake_actions (
  id VARCHAR(64) NOT NULL,
  submission_id VARCHAR(64) NOT NULL,
  action VARCHAR(24) NOT NULL,
  assigned_to VARCHAR(191) NULL,
  resolved_code VARCHAR(40) NULL,
  actor_id VARCHAR(191) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT management_intake_actions_pk PRIMARY KEY (id),
  CONSTRAINT management_intake_actions_submission_fk FOREIGN KEY (submission_id) REFERENCES community_submissions(id)
);

CREATE INDEX management_intake_actions_submission_idx ON management_intake_actions (submission_id, created_at);

-- Only a small allowlisted settings surface is stored here. No credential values belong here.
CREATE TABLE IF NOT EXISTS management_settings (
  setting_key VARCHAR(64) NOT NULL,
  value_json TEXT NOT NULL,
  updated_by VARCHAR(191) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT management_settings_pk PRIMARY KEY (setting_key)
);

CREATE TABLE IF NOT EXISTS management_audit_events (
  id VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(191) NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  summary_json TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT management_audit_events_pk PRIMARY KEY (id)
);

CREATE INDEX management_audit_recent_idx ON management_audit_events (created_at, id);
CREATE INDEX management_audit_target_idx ON management_audit_events (target_type, target_id, created_at);

-- Shared append-only admin audit contract. Access control owns role/session writes and
-- may append here without coupling to the management UI's category-specific audit table.
CREATE TABLE IF NOT EXISTS review_admin_audit (
  id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  action VARCHAR(32) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(191) NOT NULL,
  summary TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT review_admin_audit_pk PRIMARY KEY (id)
);

CREATE INDEX review_admin_audit_recent_idx ON review_admin_audit (created_at, id);
