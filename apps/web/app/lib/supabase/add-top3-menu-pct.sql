-- Add top3_menu_pct column to daily_metrics table
-- This field stores % revenue from top 3 menu items (F&B businesses)

ALTER TABLE daily_metrics 
ADD COLUMN IF NOT EXISTS top3_menu_pct NUMERIC CHECK (top3_menu_pct IS NULL OR (top3_menu_pct >= 0 AND top3_menu_pct <= 100));
