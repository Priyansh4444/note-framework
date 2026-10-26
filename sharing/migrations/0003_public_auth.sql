ALTER TABLE api_keys ADD COLUMN expires_at INTEGER CHECK(expires_at IS NULL OR expires_at>=0);

CREATE TABLE public_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  max_bytes INTEGER NOT NULL CHECK(max_bytes>=0),
  max_versions INTEGER NOT NULL CHECK(max_versions>=0),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes>=0),
  version_count INTEGER NOT NULL DEFAULT 0 CHECK(version_count>=0)
) STRICT;
INSERT INTO public_settings(id,enabled,max_bytes,max_versions,used_bytes,version_count)
  SELECT 1,0,1073741824,10000,COALESCE(SUM(bytes),0),COUNT(*) FROM versions;
CREATE TRIGGER public_version_capacity BEFORE INSERT ON versions
WHEN (SELECT enabled FROM public_settings WHERE id=1)=1
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM public_settings WHERE id=1
    AND used_bytes<=max_bytes-NEW.bytes AND version_count<max_versions)
    THEN 1 ELSE RAISE(ABORT,'public_capacity') END;
END;
CREATE TRIGGER public_version_usage AFTER INSERT ON versions
BEGIN
  UPDATE public_settings SET used_bytes=used_bytes+NEW.bytes,version_count=version_count+1 WHERE id=1;
END;

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 1400 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  public_key TEXT NOT NULL CHECK(length(public_key) BETWEEN 1 AND 4096),
  counter INTEGER NOT NULL CHECK(counter>=0),
  label TEXT NOT NULL CHECK(length(CAST(label AS BLOB)) BETWEEN 1 AND 128),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;
CREATE INDEX passkeys_publisher ON passkeys(publisher_id);

CREATE TABLE browser_sessions (
  key_id TEXT PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;
CREATE INDEX sessions_publisher ON browser_sessions(publisher_id);

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY CHECK(length(id)=64),
  challenge TEXT NOT NULL CHECK(length(challenge) BETWEEN 1 AND 256),
  kind TEXT NOT NULL CHECK(kind IN ('register','login','backup')),
  publisher_id TEXT CHECK(publisher_id IS NULL OR length(publisher_id)=32),
  session_key_id TEXT,
  label TEXT NOT NULL CHECK(length(CAST(label AS BLOB))<=128),
  expires_at INTEGER NOT NULL CHECK(expires_at>=0)
) STRICT;
CREATE INDEX challenges_expiry ON auth_challenges(expires_at);

CREATE TABLE agent_grants (
  id TEXT PRIMARY KEY CHECK(length(id)=32 AND id NOT GLOB '*[^0-9a-f]*'),
  key_id TEXT NOT NULL CHECK(length(key_id)=32 AND key_id NOT GLOB '*[^0-9a-f]*'),
  token_hash TEXT NOT NULL CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  poll_hash TEXT NOT NULL CHECK(length(poll_hash)=64 AND poll_hash NOT GLOB '*[^0-9a-f]*'),
  label TEXT NOT NULL CHECK(length(CAST(label AS BLOB)) BETWEEN 1 AND 128),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','denied')),
  publisher_id TEXT REFERENCES publishers(id),
  expires_at INTEGER NOT NULL CHECK(expires_at>=0),
  CHECK((state='pending' AND publisher_id IS NULL) OR (state<>'pending' AND publisher_id IS NOT NULL))
) STRICT;
CREATE INDEX grants_expiry ON agent_grants(expires_at);
CREATE TABLE agent_keys (
  key_id TEXT PRIMARY KEY REFERENCES api_keys(id),
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  label TEXT NOT NULL CHECK(length(CAST(label AS BLOB)) BETWEEN 1 AND 128)
) STRICT;
CREATE INDEX agents_publisher ON agent_keys(publisher_id);

CREATE TABLE auth_rates (
  bucket TEXT PRIMARY KEY CHECK(length(bucket)<=80),
  count INTEGER NOT NULL CHECK(count>=0),
  expires_at INTEGER NOT NULL CHECK(expires_at>=0)
) STRICT;
CREATE INDEX rates_expiry ON auth_rates(expires_at);
