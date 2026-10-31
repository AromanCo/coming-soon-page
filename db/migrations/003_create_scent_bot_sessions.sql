BEGIN;

CREATE TABLE IF NOT EXISTS scent_bot_sessions (
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'bale')),
  chat_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('welcome', 'quick', 'quick_result', 'deep', 'deep_result')),
  position SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 14),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  PRIMARY KEY (platform, chat_id)
);

CREATE INDEX IF NOT EXISTS scent_bot_sessions_expires_idx ON scent_bot_sessions (expires_at);

CREATE TABLE IF NOT EXISTS scent_bot_poll_offsets (
  platform TEXT PRIMARY KEY CHECK (platform IN ('telegram', 'bale')),
  next_update_id BIGINT NOT NULL DEFAULT 0 CHECK (next_update_id >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
