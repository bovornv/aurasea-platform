-- Migration: Add F&B Daily Metrics Table
-- PART 2: New database model for ultra-simple daily F&B input

-- F&B Daily Metrics table
CREATE TABLE IF NOT EXISTS fnb_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Required daily inputs (ultra-simple)
  total_customers INTEGER NOT NULL,
  total_sales NUMERIC NOT NULL,
  total_operating_cost NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  
  -- Optional fields
  staff_on_duty INTEGER,
  promo_spend NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one entry per branch per day
  CONSTRAINT unique_fnb_branch_date UNIQUE (branch_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_branch_id ON fnb_daily_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_date ON fnb_daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_branch_date ON fnb_daily_metrics(branch_id, date);

-- Row Level Security (RLS) policies
ALTER TABLE fnb_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their organization's fnb daily metrics"
  ON fnb_daily_metrics FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can insert their organization's fnb daily metrics"
  ON fnb_daily_metrics FOR INSERT
  WITH CHECK (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can update their organization's fnb daily metrics"
  ON fnb_daily_metrics FOR UPDATE
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can delete their organization's fnb daily metrics"
  ON fnb_daily_metrics FOR DELETE
  USING (true); -- TODO: Replace with actual auth check
