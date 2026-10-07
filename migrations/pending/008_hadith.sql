-- PENDING Phase 2a reviewer-authored Hadith reports. Do NOT move this into migrations/ until
-- the Phase 1 backup-alert/freshness gate is green and an operator has a verified encrypted
-- snapshot. This migration imports no dataset, has no AI/provider key, and creates no public route.
-- Report/claim text is human-entered, private staff data; no source text is copied from a corpus here.

CREATE TABLE IF NOT EXISTS hadith_reviewer_attestations (
  id VARCHAR(96) NOT NULL,
  reviewer_id VARCHAR(200) NOT NULL,
  stated_basis VARCHAR(1200) NOT NULL,
  granted_by VARCHAR(200) NOT NULL,
  granted_at VARCHAR(40) NOT NULL,
  revoked_by VARCHAR(200) NULL,
  revoked_at VARCHAR(40) NULL,
  CONSTRAINT hadith_reviewer_attestations_pk PRIMARY KEY (id)
);
CREATE INDEX hadith_reviewer_attestations_active_idx ON hadith_reviewer_attestations (reviewer_id, revoked_at, granted_at);

-- Each row is a content-immutable report revision. To correct a source, claim or wording, staff
-- must create a new revision; approval/withdrawal state and audit metadata are the only updates.
CREATE TABLE IF NOT EXISTS hadith_reports (
  id VARCHAR(96) NOT NULL,
  report_key VARCHAR(96) NOT NULL,
  revision_number INTEGER NOT NULL,
  supersedes_report_id VARCHAR(96) NULL,
  title VARCHAR(240) NOT NULL,
  hadith_reference VARCHAR(320) NOT NULL,
  language VARCHAR(2) NOT NULL,
  content_digest CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_by VARCHAR(200) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  qualified_reviewer_id VARCHAR(200) NULL,
  reviewer_attestation_id VARCHAR(96) NULL,
  reviewer_stated_basis VARCHAR(1200) NULL,
  approved_at VARCHAR(40) NULL,
  withdrawn_by VARCHAR(200) NULL,
  withdrawn_at VARCHAR(40) NULL,
  withdrawal_note VARCHAR(1000) NULL,
  CONSTRAINT hadith_reports_pk PRIMARY KEY (id),
  CONSTRAINT hadith_reports_revision_unique UNIQUE (report_key, revision_number),
  CONSTRAINT hadith_reports_attestation_fk FOREIGN KEY (reviewer_attestation_id) REFERENCES hadith_reviewer_attestations(id) ON DELETE RESTRICT
);
CREATE INDEX hadith_reports_status_idx ON hadith_reports (status, language, approved_at);
CREATE INDEX hadith_reports_key_idx ON hadith_reports (report_key, revision_number);

-- These claims are immutable once inserted. Every future spoken factual script line binds to one or
-- more IDs from an approved report revision; a generic grade and a source-less quote are forbidden.
CREATE TABLE IF NOT EXISTS hadith_claims (
  id VARCHAR(96) NOT NULL,
  report_revision_id VARCHAR(96) NOT NULL,
  claim_order INTEGER NOT NULL,
  claim_text TEXT NOT NULL,
  source_book VARCHAR(320) NOT NULL,
  source_reference VARCHAR(500) NOT NULL,
  edition VARCHAR(600) NOT NULL,
  checked_wording LONGTEXT NOT NULL,
  named_grader VARCHAR(320) NOT NULL,
  grading_reference VARCHAR(600) NOT NULL,
  entered_staff_id VARCHAR(200) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT hadith_claims_pk PRIMARY KEY (id),
  CONSTRAINT hadith_claims_revision_order_unique UNIQUE (report_revision_id, claim_order),
  CONSTRAINT hadith_claims_report_fk FOREIGN KEY (report_revision_id) REFERENCES hadith_reports(id) ON DELETE RESTRICT
);
CREATE INDEX hadith_claims_report_idx ON hadith_claims (report_revision_id, claim_order);
