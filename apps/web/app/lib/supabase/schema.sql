-- Supabase Postgres Schema for AuraSea Platform
-- Stores ONLY user-entered metrics (no computed values)

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY, -- Using TEXT to match application's string IDs (e.g., "br-hotel-fnb-bad-002")
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  has_accommodation BOOLEAN DEFAULT FALSE,
  has_fnb BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weekly metrics table (stores ONLY user-entered raw metrics)
CREATE TABLE IF NOT EXISTS weekly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE, -- TEXT to match application's string IDs
  week_start_date DATE NOT NULL,
  
  -- Shared Financial Metrics (user-entered)
  cash_balance NUMERIC,
  revenue_30d NUMERIC,
  costs_30d NUMERIC,
  revenue_7d NUMERIC,
  costs_7d NUMERIC,
  
  -- Accommodation Metrics (user-entered, nullable)
  occupancy_rate_30d NUMERIC,
  avg_daily_room_rate_30d NUMERIC,
  total_rooms INTEGER,
  staff_count INTEGER,
  
  -- F&B Metrics (user-entered, nullable)
  customers_7d INTEGER,
  avg_ticket_size NUMERIC,
  fnb_staff INTEGER,
  top3_menu_share_30d NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one entry per branch per week
  CONSTRAINT unique_branch_week UNIQUE (branch_id, week_start_date)
);

-- Unified Daily Metrics table
-- Standardized architecture: All business types use this single table
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  
  -- Shared Financial Fields (canonical, required)
  revenue NUMERIC NOT NULL,
  cost NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  
  -- Accommodation Fields (nullable)
  rooms_sold INTEGER,
  rooms_available INTEGER,
  adr NUMERIC, -- Average Daily Rate
  staff_count INTEGER,
  
  -- F&B Fields (nullable)
  customers INTEGER,
  avg_ticket NUMERIC,
  fnb_staff INTEGER,
  promo_spend NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one entry per branch per day
  CONSTRAINT unique_branch_metric_date UNIQUE (branch_id, metric_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_branch_id ON weekly_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_week_start_date ON weekly_metrics(week_start_date);
CREATE INDEX IF NOT EXISTS idx_branches_organization_id ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_id ON daily_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_metric_date ON daily_metrics(branch_id, metric_date);

-- F&B Daily Metrics table - DEPRECATED
-- All F&B data now stored in unified daily_metrics table
-- This table definition kept for reference only (will be dropped by migration)

-- Row Level Security (RLS) policies
-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read/write their own organization's data
-- (Adjust these policies based on your auth implementation)
CREATE POLICY "Users can read their organization's data"
  ON organizations FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's branches"
  ON branches FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's metrics"
  ON weekly_metrics FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can insert their organization's metrics"
  ON weekly_metrics FOR INSERT
  WITH CHECK (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can update their organization's metrics"
  ON weekly_metrics FOR UPDATE
  USING (true); -- TODO: Replace with actual auth check

-- RLS Policies for daily_metrics
CREATE POLICY "Users can read their organization's daily metrics"
  ON daily_metrics FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can insert their organization's daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can update their organization's daily metrics"
  ON daily_metrics FOR UPDATE
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can delete their organization's daily metrics"
  ON daily_metrics FOR DELETE
  USING (true); -- TODO: Replace with actual auth check

-- RLS Policies for fnb_daily_metrics - REMOVED (table deprecated, using unified daily_metrics)
