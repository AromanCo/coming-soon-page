-- Run once per provider role after migrations 003, 004, 006, 007 and 008.
-- Inputs: psql variables database_name and bot_user.
BEGIN;
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'bot_user')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'bot_user')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'bot_user')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'bot_user')
\gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE scent_bot_sessions, scent_bot_poll_offsets, scent_bot_outbox TO %I', :'bot_user')
\gexec
SELECT format('GRANT SELECT, UPDATE ON TABLE scent_bot_delivery_metrics TO %I', :'bot_user')
\gexec
SELECT format('REVOKE ALL ON SEQUENCE scent_bot_outbox_id_seq FROM %I', :'bot_user')
\gexec
SELECT format('GRANT USAGE ON SEQUENCE scent_bot_outbox_id_seq TO %I', :'bot_user')
\gexec
COMMIT;
