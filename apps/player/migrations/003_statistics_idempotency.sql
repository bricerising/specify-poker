CREATE TABLE IF NOT EXISTS statistics_idempotency (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  statistic_type VARCHAR(50) NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_statistics_idempotency_user_id ON statistics_idempotency(user_id);
