-- ============================================================
-- Migration 004 — backup log (records when a backup was taken)
-- Run once in the Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS backup_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  type        TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'auto'
  created_by  UUID REFERENCES profiles(id),
  note        TEXT
);

ALTER TABLE backup_log ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read the last-backup time; inserts come from the app
-- (manual backups) or the daily GitHub Action (auto, via the postgres role).
DROP POLICY IF EXISTS backup_log_select ON backup_log;
CREATE POLICY backup_log_select ON backup_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS backup_log_insert ON backup_log;
CREATE POLICY backup_log_insert ON backup_log FOR INSERT TO authenticated WITH CHECK (true);
