-- Migration: Add daily_metrics table for simplified accommodation monitoring
-- Run this in your Supabase SQL Editor
-- 
-- PART 1: Minimal Daily Input Model
-- Replaces complex weekly metrics with simple daily input
-- Only 4 required fields: rooms_sold, avg_room_rate, total_operating_cost, cash_balance

-- Create daily_metrics table
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Required fields (only 4)
  rooms_sold INTEGER NOT NULL,
  avg_room_rate NUMERIC NOT NULL,
  total_operating_cost NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one entry per branch per day
  CONSTRAINT unique_branch_date UNIQUE (branch_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_id ON daily_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_date ON daily_metrics(branch_id, date);

-- Enable RLS
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as weekly_metrics)
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
