-- 003_add_actor_id_to_audit_logs.sql
-- Add missing actor_id column to audit_logs and index it

ALTER TABLE IF EXISTS audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON audit_logs(actor_id);
