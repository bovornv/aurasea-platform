
-- Add health_score to branch_kpi_metrics if the table exists and column is missing.
-- Run in Supabase SQL editor. Health score is 0–100, computed by the app and stored here.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branch_kpi_metrics'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'branch_kpi_metrics'
        AND column_name = 'health_score'
    ) THEN
      ALTER TABLE branch_kpi_metrics
        ADD COLUMN health_score NUMERIC CHECK (health_score >= 0 AND health_score <= 100);
    END IF;
  END IF;
END $$;
