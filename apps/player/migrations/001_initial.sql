CREATE TABLE IF NOT EXISTS profiles (
  user_id VARCHAR(255) PRIMARY KEY,
  nickname VARCHAR(30) NOT NULL,
  avatar_url TEXT,
  preferences JSONB NOT NULL DEFAULT '{}',
  last_login_at TIMESTAMPTZ,
  referred_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS statistics (
  user_id VARCHAR(255) PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  hands_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  vpip DECIMAL(5,2) NOT NULL DEFAULT 0,
  pfr DECIMAL(5,2) NOT NULL DEFAULT 0,
  all_in_count INTEGER NOT NULL DEFAULT 0,
  biggest_pot INTEGER NOT NULL DEFAULT 0,
  referral_count INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friends (
  user_id VARCHAR(255) NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  friend_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
