BEGIN;

ALTER TABLE scent_bot_outbox
  ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS delivery_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_lease_token TEXT;

CREATE INDEX IF NOT EXISTS scent_bot_outbox_ready_idx
  ON scent_bot_outbox (platform, available_at, id);
CREATE INDEX IF NOT EXISTS scent_bot_outbox_chat_order_idx
  ON scent_bot_outbox (platform, chat_id, id);

COMMIT;
