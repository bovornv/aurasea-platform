-- Phase 2: Drop legacy views AFTER frontend is deployed and uses only:
--   today_summary_clean, alerts_final, branch_learning_phase
-- Do NOT drop tables. Run this only after verifying no 404/400 and UI works.

DROP VIEW IF EXISTS branch_recommendations;
DROP VIEW IF EXISTS branch_anomaly_signals;
DROP VIEW IF EXISTS accommodation_health_today;
DROP VIEW IF EXISTS branch_health_today;
DROP VIEW IF EXISTS branch_dashboard;
DROP VIEW IF EXISTS branch_intelligence_engine;
DROP VIEW IF EXISTS branch_intelligence_engine_v2;
DROP VIEW IF EXISTS branch_alerts;
DROP VIEW IF EXISTS branch_alerts_today;
DROP VIEW IF EXISTS branch_alerts_display;
DROP VIEW IF EXISTS today_summary;
