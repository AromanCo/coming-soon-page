BEGIN;

ALTER TABLE scent_bot_outbox
  ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'ordinary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scent_bot_outbox'::regclass
      AND conname = 'scent_bot_outbox_message_kind_check'
  ) THEN
    ALTER TABLE public.scent_bot_outbox
      ADD CONSTRAINT scent_bot_outbox_message_kind_check
      CHECK (message_kind IN ('ordinary', 'forget_confirmation', 'busy'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS scent_bot_outbox_lane_idx
  ON scent_bot_outbox (platform, message_kind, available_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS scent_bot_outbox_control_chat_uidx
  ON scent_bot_outbox (platform, chat_id)
  WHERE message_kind IN ('forget_confirmation', 'busy');

CREATE TABLE IF NOT EXISTS scent_bot_delivery_metrics (
  platform TEXT PRIMARY KEY CHECK (platform IN ('telegram', 'bale')),
  ordinary_omitted BIGINT NOT NULL DEFAULT 0 CHECK (ordinary_omitted >= 0),
  busy_omitted BIGINT NOT NULL DEFAULT 0 CHECK (busy_omitted >= 0),
  forget_confirmation_omitted BIGINT NOT NULL DEFAULT 0 CHECK (forget_confirmation_omitted >= 0),
  responses_expired BIGINT NOT NULL DEFAULT 0 CHECK (responses_expired >= 0),
  responses_exhausted BIGINT NOT NULL DEFAULT 0 CHECK (responses_exhausted >= 0),
  responses_cleared_by_forget BIGINT NOT NULL DEFAULT 0 CHECK (responses_cleared_by_forget >= 0),
  next_delivery_lane TEXT NOT NULL DEFAULT 'control'
    CHECK (next_delivery_lane IN ('ordinary', 'control')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO scent_bot_delivery_metrics (platform)
VALUES ('telegram'), ('bale')
ON CONFLICT (platform) DO NOTHING;

COMMIT;
