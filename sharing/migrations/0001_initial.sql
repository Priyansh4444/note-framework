CREATE TABLE publishers (
  id TEXT PRIMARY KEY CHECK(length(id)=32 AND id NOT GLOB '*[^0-9a-f]*'),
  label TEXT NOT NULL CHECK(length(CAST(label AS BLOB)) BETWEEN 1 AND 256),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  quota_bytes INTEGER NOT NULL CHECK(quota_bytes BETWEEN 0 AND 9007199254740991),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes BETWEEN 0 AND quota_bytes),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY CHECK(length(id)=32 AND id NOT GLOB '*[^0-9a-f]*'),
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;
CREATE INDEX api_keys_publisher ON api_keys(publisher_id,id);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY CHECK(length(id)=32 AND id NOT GLOB '*[^0-9a-f]*'),
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  head_version INTEGER NOT NULL CHECK(head_version BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  updated_at INTEGER NOT NULL CHECK(updated_at>=created_at)
) STRICT;
CREATE INDEX drafts_owner_list ON drafts(publisher_id,updated_at DESC,id DESC);

CREATE TABLE versions (
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
  title TEXT NOT NULL CHECK(length(CAST(title AS BLOB))<=256),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
  chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 1 AND 21),
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  PRIMARY KEY(draft_id,version)
) STRICT;

CREATE TABLE body_chunks (
  draft_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 20),
  body TEXT NOT NULL,
  utf16_units INTEGER NOT NULL CHECK(utf16_units BETWEEN 1 AND 262144),
  byte_count INTEGER NOT NULL CHECK(byte_count BETWEEN 1 AND 786432),
  CHECK(length(CAST(body AS BLOB))=byte_count),
  PRIMARY KEY(draft_id,version,ordinal),
  FOREIGN KEY(draft_id,version) REFERENCES versions(draft_id,version)
) STRICT;

CREATE TABLE operations (
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  operation_key TEXT NOT NULL CHECK(length(operation_key) BETWEEN 16 AND 128 AND operation_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  draft_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  receipt_json TEXT NOT NULL CHECK(length(receipt_json) BETWEEN 2 AND 4096 AND json_valid(receipt_json)),
  created_at INTEGER NOT NULL CHECK(created_at>=0),
  PRIMARY KEY(publisher_id,operation_key),
  FOREIGN KEY(draft_id,version) REFERENCES versions(draft_id,version)
) STRICT;
CREATE INDEX operations_result ON operations(draft_id,version);

-- Always INSERT one guard, including when the condition is false. A zero-row
-- conditional UPDATE/INSERT would silently allow a partial publication.
CREATE TABLE transaction_guards (
  nonce TEXT PRIMARY KEY CHECK(length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*'),
  ok INTEGER NOT NULL CHECK(ok=1)
) STRICT;
