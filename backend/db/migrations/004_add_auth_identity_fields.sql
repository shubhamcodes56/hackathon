-- 004_add_auth_identity_fields.sql
-- Adds identity metadata for passwordless Google/Apple-style login

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

UPDATE users
SET
  username = COALESCE(username, split_part(email, '@', 1)),
  auth_provider = COALESCE(auth_provider, 'email')
WHERE username IS NULL OR auth_provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);