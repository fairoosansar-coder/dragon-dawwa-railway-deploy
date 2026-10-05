-- Review-only additive integrity migration. Apply explicitly after encrypted preflight
-- snapshot, confirmed no orphan rows, and a maintenance pause. Never run on old Site/D1.
-- Parent keys and child keys are VARCHAR(200) under the same database collation.
ALTER TABLE member_saves ADD CONSTRAINT member_saves_profile_fk
  FOREIGN KEY (user_id) REFERENCES member_profiles (user_id) ON DELETE CASCADE;

ALTER TABLE member_progress ADD CONSTRAINT member_progress_profile_fk
  FOREIGN KEY (user_id) REFERENCES member_profiles (user_id) ON DELETE CASCADE;

-- Audit keeps a keyed pseudonym per subject but now allows a separate deletion event
-- after an owner explicitly re-invites the same verified identity.
ALTER TABLE member_deletion_audit DROP INDEX member_deletion_audit_subject_once;
CREATE INDEX member_deletion_audit_subject_idx ON member_deletion_audit (subject_hash);
