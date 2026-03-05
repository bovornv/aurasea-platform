-- ============================================================
-- FINAL PRODUCTION SCHEMA - Hospitality AI Vertical
-- ============================================================
-- Four tables only: organizations, branches, daily_metrics, health_snapshots
-- Clean separation: setup data vs daily operational data
-- No weekly tables, no simulation, no legacy logic
-- ============================================================

-- ============================================================
-- TABLE 1: organizations
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vertical_type TEXT NOT NULL CHECK (vertical_type IN ('accommodation', 'fnb', 'hybrid')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: branches (SETUP DATA)
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  -- Core
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  
  -- Accommodation Setup
  rooms_available INTEGER,
  baseline_adr NUMERIC,
  accommodation_staff_count INTEGER,
  
  -- F&B Setup
  seating_capacity INTEGER,
  baseline_avg_ticket NUMERIC,
  fnb_staff_count INTEGER,
  
  -- Financial Setup
  monthly_fixed_cost NUMERIC,
  variable_cost_ratio NUMERIC, -- percentage (0-100)
  debt_payment_monthly NUMERIC,
  credit_line_limit NUMERIC,
  
  -- Meta
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABLE 3: daily_metrics (CORE ENGINE TABLE)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  
  -- Shared (required)
  revenue NUMERIC NOT NULL,
  
  -- Accommodation (nullable)
  rooms_sold INTEGER,
  adr NUMERIC,
  
  -- F&B (nullable)
  customers INTEGER,
  avg_ticket NUMERIC,
  
  -- Optional Finance (nullable)
  cash_balance NUMERIC,
  cost NUMERIC, -- Optional (can be estimated if not provided)
  
  -- Meta
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one entry per branch per day
  CONSTRAINT unique_branch_metric_date UNIQUE (branch_id, metric_date)
);

-- ============================================================
-- TABLE 4: health_snapshots (optional cache)
-- ============================================================
CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  health_score NUMERIC NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  alerts_json JSONB,
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One snapshot per branch per day
  CONSTRAINT unique_branch_snapshot_date UNIQUE (branch_id, metric_date)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_branches_organization_id ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_id ON daily_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_date ON daily_metrics(branch_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_branch_id ON health_snapshots(branch_id);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_metric_date ON health_snapshots(metric_date);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_branch_date ON health_snapshots(branch_id, metric_date);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth implementation)
CREATE POLICY "Users can read their organization's data"
  ON organizations FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's branches"
  ON branches FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's daily metrics"
  ON daily_metrics FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can insert their organization's daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can update their organization's daily metrics"
  ON daily_metrics FOR UPDATE
  USING (true); -- TODO: Replace with actual auth check

CREATE POLICY "Users can read their organization's health snapshots"
  ON health_snapshots FOR SELECT
  USING (true); -- TODO: Replace with actual auth check

-- ============================================================
-- MIGRATION NOTES
-- ============================================================
-- 1. Drop legacy tables AFTER migrating data:
--    DROP TABLE IF EXISTS weekly_metrics;
--    DROP TABLE IF EXISTS fnb_daily_metrics;
--
-- 2. Migrate existing data from weekly_metrics to daily_metrics
--    (distribute weekly totals across days)
--
-- 3. Update branches table to include new setup fields
--    (migrate from business setup context if needed)
--
-- 4. health_snapshots is optional - engine works without it
