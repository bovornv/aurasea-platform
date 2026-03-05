/**
 * Seed Real Test Data for Production Validation
 * 
 * Creates deterministic test data in Supabase for validating real database flows.
 * 
 * Usage:
 *   npm run seed:real-test
 * 
 * Environment Variables Required:
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (bypasses RLS)
 */

// Load environment variables from .env files FIRST (before any imports)
const { config } = require('dotenv');
const { resolve } = require('path');

// Try loading from root .env, then apps/web/.env.local
const envResult1 = config({ path: resolve(process.cwd(), '.env') });
const envResult2 = config({ path: resolve(process.cwd(), 'apps/web/.env.local') });

// Now import after env vars are loaded
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug: log what we found
console.log('[DEBUG] Environment check:');
console.log(`  NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✓ Found' : '✗ Missing'}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✓ Found' : '✗ Missing'}`);
console.log(`  All NEXT_PUBLIC_ vars:`, Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_')).join(', ') || 'none');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  console.error('\n💡 Add SUPABASE_SERVICE_ROLE_KEY to apps/web/.env.local');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Generate deterministic UUID v5 from a string
 * Uses a simple hash-based approach for consistency
 */
function generateDeterministicUUID(seed: string): string {
  // Simple deterministic UUID v4-like generation from seed
  // This creates consistent UUIDs for the same seed string
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

/**
 * Get week start date (Monday) for a given date
 */
function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  return new Date(d.setDate(diff));
}

/**
 * Generate deterministic metrics for healthy hotel
 */
function generateHealthyMetrics(dayOffset: number): {
  revenue_30d: number;
  costs_30d: number;
  revenue_7d: number;
  costs_7d: number;
  cash_balance: number;
  occupancy_rate_30d: number;
  avg_daily_room_rate_30d: number;
  total_rooms: number;
  accommodation_staff: number;
} {
  // Base values (stable)
  const baseRevenue30d = 9_600_000; // 320k/day avg
  const costRatio = 0.70; // 70% of revenue
  const baseCash = 12_000_000; // 6+ months runway
  
  // Stable revenue (no decline)
  const revenue30d = baseRevenue30d;
  const costs30d = revenue30d * costRatio;
  
  // Weekly values (7/30 of monthly)
  const revenue7d = (revenue30d / 30) * 7;
  const costs7d = (costs30d / 30) * 7;
  
  // Cash declines slightly over time (normal operations)
  const cashBalance = baseCash - (dayOffset * 50000); // 50k burn per day
  
  return {
    revenue_30d: Math.round(revenue30d),
    costs_30d: Math.round(costs30d),
    revenue_7d: Math.round(revenue7d),
    costs_7d: Math.round(costs7d),
    cash_balance: Math.max(0, Math.round(cashBalance)),
    occupancy_rate_30d: 75.0,
    avg_daily_room_rate_30d: 3500,
    total_rooms: 120,
    accommodation_staff: 45,
  };
}

/**
 * Generate deterministic metrics for stressed hotel
 */
function generateStressedMetrics(dayOffset: number): {
  revenue_30d: number;
  costs_30d: number;
  revenue_7d: number;
  costs_7d: number;
  cash_balance: number;
  occupancy_rate_30d: number;
  avg_daily_room_rate_30d: number;
  total_rooms: number;
  accommodation_staff: number;
} {
  // Base values
  const baseRevenue30d = 9_600_000;
  const costRatio = 0.75; // 75% of revenue (rising)
  
  // Revenue declining 10-20% over 30 days
  const declineRate = 0.15; // 15% decline
  const declineFactor = 1 - (declineRate * (dayOffset / 30));
  const revenue30d = baseRevenue30d * Math.max(0.8, declineFactor); // Min 80% of base
  
  // Costs rising 5-15% over 30 days
  const costIncreaseRate = 0.10; // 10% increase
  const costIncreaseFactor = 1 + (costIncreaseRate * (dayOffset / 30));
  const costs30d = revenue30d * costRatio * Math.min(1.15, costIncreaseFactor); // Max 115%
  
  // Weekly values
  const revenue7d = (revenue30d / 30) * 7;
  const costs7d = (costs30d / 30) * 7;
  
  // Cash runway 2-3 months (declining)
  const baseCash = 6_000_000; // ~2.5 months
  const dailyBurn = (costs30d - revenue30d) / 30;
  const cashBalance = baseCash - (dayOffset * dailyBurn);
  
  return {
    revenue_30d: Math.round(revenue30d),
    costs_30d: Math.round(costs30d),
    revenue_7d: Math.round(revenue7d),
    costs_7d: Math.round(costs7d),
    cash_balance: Math.max(0, Math.round(cashBalance)),
    occupancy_rate_30d: 60.0 - (dayOffset * 0.2), // Declining from 60%
    avg_daily_room_rate_30d: 3200 - (dayOffset * 5), // Declining ADR
    total_rooms: 120,
    accommodation_staff: 45,
  };
}

/**
 * Generate deterministic metrics for crisis hotel
 */
function generateCrisisMetrics(dayOffset: number): {
  revenue_30d: number;
  costs_30d: number;
  revenue_7d: number;
  costs_7d: number;
  cash_balance: number;
  occupancy_rate_30d: number;
  avg_daily_room_rate_30d: number;
  total_rooms: number;
  accommodation_staff: number;
} {
  // Base values
  const baseRevenue30d = 9_600_000;
  
  // Revenue down 40% (stable at low level)
  const revenue30d = baseRevenue30d * 0.60; // 60% of base = 40% drop
  
  // Costs high (80% of original revenue, not current revenue)
  const costs30d = baseRevenue30d * 0.80; // High cost ratio
  
  // Weekly values
  const revenue7d = (revenue30d / 30) * 7;
  const costs7d = (costs30d / 30) * 7;
  
  // Cash runway < 1 month (critical)
  const baseCash = 1_500_000; // ~3 weeks
  const dailyBurn = (costs30d - revenue30d) / 30;
  const cashBalance = baseCash - (dayOffset * dailyBurn);
  
  return {
    revenue_30d: Math.round(revenue30d),
    costs_30d: Math.round(costs30d),
    revenue_7d: Math.round(revenue7d),
    costs_7d: Math.round(costs7d),
    cash_balance: Math.max(0, Math.round(cashBalance)),
    occupancy_rate_30d: 45.0, // Low occupancy
    avg_daily_room_rate_30d: 2800, // Discounted rates
    total_rooms: 120,
    accommodation_staff: 45,
  };
}

/**
 * Seed organization, branch, and metrics for a scenario
 */
async function seedScenario(
  orgIdSeed: string,
  orgName: string,
  branchId: string,
  branchName: string,
  generateMetrics: (dayOffset: number) => {
    revenue_30d: number;
    costs_30d: number;
    revenue_7d: number;
    costs_7d: number;
    cash_balance: number;
    occupancy_rate_30d: number;
    avg_daily_room_rate_30d: number;
    total_rooms: number;
    accommodation_staff: number;
  }
): Promise<void> {
  console.log(`\n📦 Seeding ${orgName}...`);
  
  // Generate deterministic UUID for organization
  const orgId = generateDeterministicUUID(`org-${orgIdSeed}`);
  
  // 1. Check if organization exists by name, if not create it
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', orgName)
    .single();
  
  let finalOrgId = orgId;
  
  if (existingOrg) {
    // Organization exists, use its ID
    finalOrgId = existingOrg.id;
    console.log(`  ✅ Organization exists: ${orgName} (${finalOrgId})`);
  } else {
    // Create new organization with deterministic UUID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: orgId,
        name: orgName,
      })
      .select()
      .single();
    
    if (orgError) {
      throw new Error(`Failed to create organization ${orgName}: ${orgError.message}`);
    }
    
    finalOrgId = org.id;
    console.log(`  ✅ Organization created: ${orgName} (${finalOrgId})`);
  }
  
  // 2. Delete existing branch and metrics (idempotency)
  const { error: deleteBranchError } = await supabase
    .from('branches')
    .delete()
    .eq('id', branchId);
  
  if (deleteBranchError) {
    throw new Error(`Failed to delete existing branch: ${deleteBranchError.message}`);
  }
  
  // 3. Create branch
  const { error: branchError } = await supabase
    .from('branches')
    .insert({
      id: branchId,
      organization_id: finalOrgId,
      name: branchName,
      has_accommodation: true,
      has_fnb: false,
    });
  
  if (branchError) {
    throw new Error(`Failed to create branch ${branchName}: ${branchError.message}`);
  }
  
  console.log(`  ✅ Branch: ${branchName} (${branchId})`);
  
  // 4. Generate 30 weeks of weekly metrics (one entry per week for 30 weeks = 210 days)
  const today = new Date();
  const metrics: Array<{
    branch_id: string;
    week_start_date: string;
    revenue_30d: number;
    costs_30d: number;
    revenue_7d: number;
    costs_7d: number;
    cash_balance: number;
    occupancy_rate_30d: number;
    avg_daily_room_rate_30d: number;
    total_rooms: number;
    accommodation_staff: number;
  }> = [];
  
  // Generate one metric per week for 30 weeks
  // Start from 29 weeks ago and go forward to today
  for (let weekOffset = 29; weekOffset >= 0; weekOffset--) {
    // Calculate the Monday of this week
    const date = new Date(today);
    date.setDate(date.getDate() - (weekOffset * 7));
    const weekStart = getWeekStartDate(date);
    
    // Use dayOffset for metric generation (convert weeks to days, use middle of week)
    const dayOffset = weekOffset * 7 + 3; // Use Wednesday of each week (day 3 of week)
    const metricData = generateMetrics(dayOffset);
    
    metrics.push({
      branch_id: branchId,
      week_start_date: weekStart.toISOString().split('T')[0], // YYYY-MM-DD
      ...metricData,
    });
  }
  
  // No need to deduplicate - we're already generating one per week
  const uniqueMetrics = metrics;
  
  // 5. Delete existing metrics for this branch (idempotency)
  const { error: deleteMetricsError } = await supabase
    .from('weekly_metrics')
    .delete()
    .eq('branch_id', branchId);
  
  if (deleteMetricsError) {
    throw new Error(`Failed to delete existing metrics: ${deleteMetricsError.message}`);
  }
  
  // 6. Insert new metrics (batch insert)
  const { error: insertMetricsError } = await supabase
    .from('weekly_metrics')
    .insert(uniqueMetrics);
  
  if (insertMetricsError) {
    throw new Error(`Failed to insert metrics: ${insertMetricsError.message}`);
  }
  
  console.log(`  ✅ Metrics: ${uniqueMetrics.length} weekly entries (30 weeks of data)`);
}

/**
 * Main seed function
 */
async function seedRealTestData(): Promise<void> {
  console.log('🌱 Starting production test data seed...\n');
  
  try {
    // Seed healthy hotel
    await seedScenario(
      'healthy_hotel',
      'Healthy Hotel Group',
      'br-healthy-hotel-001',
      'Grand Healthy Hotel',
      generateHealthyMetrics
    );
    console.log('Seed complete: healthy');
    
    // Seed stressed hotel
    await seedScenario(
      'stressed_hotel',
      'Stressed Hotel Group',
      'br-stressed-hotel-001',
      'Struggling Hotel',
      generateStressedMetrics
    );
    console.log('Seed complete: stressed');
    
    // Seed crisis hotel
    await seedScenario(
      'crisis_hotel',
      'Crisis Hotel Group',
      'br-crisis-hotel-001',
      'Crisis Hotel',
      generateCrisisMetrics
    );
    console.log('Seed complete: crisis');
    
    console.log('\n✅ All seeds completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Organizations: 3');
    console.log('   - Branches: 3');
    console.log('   - Weekly metrics: 90 entries (30 per branch)');
    console.log('\n💡 Data is ready for production validation testing');
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  }
}

// Run seed when script is executed
seedRealTestData()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });

module.exports = { seedRealTestData };
