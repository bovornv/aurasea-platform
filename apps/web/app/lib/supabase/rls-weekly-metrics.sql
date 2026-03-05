-- PART 6: Row Level Security (RLS) Policy for weekly_metrics table
-- Ensures read access is allowed for all authenticated users
-- Run this in Supabase SQL Editor if RLS is blocking queries

-- Enable RLS on weekly_metrics table
ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access for all authenticated users
-- This prevents 406 errors when querying weekly_metrics
CREATE POLICY IF NOT EXISTS "allow_read_weekly_metrics"
ON weekly_metrics
FOR SELECT
USING (true);

-- Optional: Allow insert/update for authenticated users (if needed)
CREATE POLICY IF NOT EXISTS "allow_insert_weekly_metrics"
ON weekly_metrics
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "allow_update_weekly_metrics"
ON weekly_metrics
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Note: These policies allow all authenticated users to read/write weekly_metrics
-- Adjust USING clauses if you need organization-based access control
-- Example: USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = branch_id))
