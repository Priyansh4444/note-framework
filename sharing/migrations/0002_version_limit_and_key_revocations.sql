-- Exact original-byte accounting remains separate from the metadata allowance.
-- Existing publishers may already exceed the allowance: retain every version
-- and block further publication rather than discarding history on migration.
ALTER TABLE publishers ADD COLUMN version_count INTEGER NOT NULL DEFAULT 0 CHECK(version_count>=0);
UPDATE publishers SET version_count=(
  SELECT COUNT(*) FROM versions v JOIN drafts d ON d.id=v.draft_id
  WHERE d.publisher_id=publishers.id
);

-- A saved invitation can be revoked before either its publisher or key exists.
-- Deliberately no foreign key: the tombstone must outlive failed registration.
CREATE TABLE key_revocations (
  id TEXT PRIMARY KEY CHECK(length(id)=32 AND id NOT GLOB '*[^0-9a-f]*'),
  publisher_id TEXT NOT NULL CHECK(length(publisher_id)=32 AND publisher_id NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;
INSERT INTO key_revocations(id,publisher_id,created_at)
  SELECT id,publisher_id,created_at FROM api_keys WHERE revoked=1;
