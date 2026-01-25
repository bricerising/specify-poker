ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username VARCHAR(255) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
