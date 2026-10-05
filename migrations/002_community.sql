-- Additive community workflow storage. Apply once through the review project's migration tracker.
-- VARCHAR/TEXT/DATETIME-style values are intentionally portable to MySQL 8+ and local SQLite test adapters.

CREATE TABLE IF NOT EXISTS community_events (
  id VARCHAR(64) NOT NULL,
  created_by VARCHAR(191) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  head INTEGER NOT NULL,
  published INTEGER NULL,
  cancelled_at VARCHAR(40) NULL,
  cancelled_by VARCHAR(191) NULL,
  CONSTRAINT community_events_pk PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS community_event_revisions (
  event_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  state VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(16) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT community_event_revisions_pk PRIMARY KEY (event_id, version),
  CONSTRAINT community_event_revisions_event_fk FOREIGN KEY (event_id) REFERENCES community_events(id)
);

CREATE INDEX community_events_public_idx ON community_events (published, cancelled_at);
CREATE INDEX community_event_revisions_created_idx ON community_event_revisions (event_id, created_at);

-- Private visitor intake. Contact and free-text fields are nulled on owner deletion; no request payload is retained in audits.
CREATE TABLE IF NOT EXISTS community_submissions (
  id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  purpose VARCHAR(64) NOT NULL,
  contact_preference VARCHAR(16) NOT NULL,
  contact_value TEXT NULL,
  details TEXT NULL,
  consented_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  deleted_at VARCHAR(40) NULL,
  deleted_by VARCHAR(191) NULL,
  CONSTRAINT community_submissions_pk PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS community_submission_audits (
  id VARCHAR(64) NOT NULL,
  submission_id VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL,
  actor_id VARCHAR(191) NULL,
  actor_role VARCHAR(32) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT community_submission_audits_pk PRIMARY KEY (id),
  CONSTRAINT community_submission_audit_once UNIQUE (submission_id, action),
  CONSTRAINT community_submission_audits_submission_fk FOREIGN KEY (submission_id) REFERENCES community_submissions(id)
);

CREATE INDEX community_submissions_created_idx ON community_submissions (created_at);
CREATE INDEX community_submissions_deleted_idx ON community_submissions (deleted_at);
