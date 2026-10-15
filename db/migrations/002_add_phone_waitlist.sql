BEGIN;

ALTER TABLE waitlist_subscriptions
  ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(13);

ALTER TABLE waitlist_subscriptions
  ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'waitlist_subscriptions'::regclass
      AND conname = 'waitlist_phone_e164_format'
  ) THEN
    ALTER TABLE waitlist_subscriptions
      ADD CONSTRAINT waitlist_phone_e164_format
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+989[0-9]{9}$');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'waitlist_subscriptions'::regclass
      AND conname = 'waitlist_contact_method_required'
  ) THEN
    ALTER TABLE waitlist_subscriptions
      ADD CONSTRAINT waitlist_contact_method_required
      CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_subscriptions_phone_e164_uidx
  ON waitlist_subscriptions (phone_e164)
  WHERE phone_e164 IS NOT NULL;

COMMIT;
