BEGIN;

-- session_user is the authenticated login and cannot be changed by SET ROLE or
-- a writable session variable. Keep the migration role as table owner and do
-- not FORCE RLS: the trusted migration owner retains normal access.
ALTER TABLE public.scent_bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_bot_sessions NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scent_bot_provider_isolation ON public.scent_bot_sessions;
CREATE POLICY scent_bot_provider_isolation ON public.scent_bot_sessions
  USING (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  )
  WITH CHECK (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  );

ALTER TABLE public.scent_bot_poll_offsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_bot_poll_offsets NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scent_bot_provider_isolation ON public.scent_bot_poll_offsets;
CREATE POLICY scent_bot_provider_isolation ON public.scent_bot_poll_offsets
  USING (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  )
  WITH CHECK (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  );

ALTER TABLE public.scent_bot_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_bot_outbox NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scent_bot_provider_isolation ON public.scent_bot_outbox;
CREATE POLICY scent_bot_provider_isolation ON public.scent_bot_outbox
  USING (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  )
  WITH CHECK (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  );

-- Fairness and omission counters are provider-scoped runtime state too.
ALTER TABLE public.scent_bot_delivery_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_bot_delivery_metrics NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scent_bot_provider_isolation ON public.scent_bot_delivery_metrics;
CREATE POLICY scent_bot_provider_isolation ON public.scent_bot_delivery_metrics
  USING (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  )
  WITH CHECK (
    (session_user = 'aroman_bot_telegram' AND platform = 'telegram') OR
    (session_user = 'aroman_bot_bale' AND platform = 'bale')
  );

COMMIT;
