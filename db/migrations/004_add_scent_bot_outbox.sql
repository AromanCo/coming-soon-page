BEGIN;

CREATE TABLE IF NOT EXISTS scent_bot_outbox (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'bale')),
  chat_id TEXT NOT NULL,
  view JSONB NOT NULL CHECK (jsonb_typeof(view) = 'object'),
  media_origin TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

ALTER TABLE scent_bot_outbox ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days');

CREATE INDEX IF NOT EXISTS scent_bot_outbox_delivery_idx ON scent_bot_outbox (platform, expires_at, id);

COMMIT;
