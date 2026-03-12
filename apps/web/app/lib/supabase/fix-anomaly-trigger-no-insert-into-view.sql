-- Fix: stop inserting into accommodation_anomaly_signals (it is a view).
-- Run this if update_branch_kpi_metrics() or any trigger inserts into accommodation_anomaly_signals.

-- Remove function that writes to the view (if it exists)
DROP FUNCTION IF EXISTS update_branch_kpi_metrics() CASCADE;

-- Ensure no trigger on accommodation_daily_metrics or fnb_daily_metrics calls a function
-- that INSERTs into accommodation_anomaly_signals. Use anomaly-signals-split-tables-and-view.sql
-- for the correct setup: fnb_daily_metrics → fnb_anomaly_signals (table); accommodation = view only.
