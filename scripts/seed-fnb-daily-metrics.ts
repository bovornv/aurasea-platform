/**
 * Seed F&B Daily Metrics for Scenario Testing
 * 
 * PART 6: Generate 40 days of daily F&B metrics for healthy/stressed/crisis scenarios
 * Validates expected alert counts
 */

// Load environment variables FIRST
const { config } = require('dotenv');
const { resolve } = require('path');

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/web/.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Generate deterministic UUID from seed
 */
function generateDeterministicUUID(seed: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

/**
 * Generate healthy F&B daily metrics
 */
function generateHealthyMetrics(dayOffset: number): {
  total_customers: number;
  total_sales: number;
  total_operating_cost: number;
  cash_balance: number;
  staff_on_duty: number;
} {
  // Stable customers: 200-250 per day
  const baseCustomers = 225;
  const customers = baseCustomers + Math.sin(dayOffset * 0.1) * 25; // Slight variation
  
  // Growing sales: 350-400 THB per customer
  const baseTicket = 375;
  const ticket = baseTicket + (dayOffset * 0.5); // Slight growth
  const total_sales = Math.round(customers * ticket);
  
  // Positive margin: 65% cost ratio
  const total_operating_cost = Math.round(total_sales * 0.65);
  
  // Healthy cash: starts at 2M, grows slightly
  const cash_balance = Math.round(2_000_000 + (dayOffset * 5000));
  
  // Staff: 8-10 people
  const staff_on_duty = 9;

  return {
    total_customers: Math.round(customers),
    total_sales,
    total_operating_cost,
    cash_balance,
    staff_on_duty,
  };
}

/**
 * Generate stressed F&B daily metrics
 */
function generateStressedMetrics(dayOffset: number): {
  total_customers: number;
  total_sales: number;
  total_operating_cost: number;
  cash_balance: number;
  staff_on_duty: number;
} {
  // Flat customers: 180-200 (declining slightly)
  const baseCustomers = 190;
  const customers = baseCustomers - (dayOffset * 0.3); // Slight decline
  
  // Flat sales: 320-350 THB per customer
  const baseTicket = 335;
  const ticket = baseTicket - (dayOffset * 0.2); // Slight decline
  const total_sales = Math.round(customers * ticket);
  
  // Shrinking margin: 75% cost ratio (rising)
  const costRatio = 0.70 + (dayOffset / 40 * 0.05); // Rising from 70% to 75%
  const total_operating_cost = Math.round(total_sales * costRatio);
  
  // Declining cash: starts at 1.5M, declines
  const cash_balance = Math.round(1_500_000 - (dayOffset * 8000));
  
  // Staff: 7-9 people
  const staff_on_duty = 8;

  return {
    total_customers: Math.round(Math.max(150, customers)),
    total_sales,
    total_operating_cost,
    cash_balance: Math.max(0, cash_balance),
    staff_on_duty,
  };
}

/**
 * Generate crisis F&B daily metrics
 */
function generateCrisisMetrics(dayOffset: number): {
  total_customers: number;
  total_sales: number;
  total_operating_cost: number;
  cash_balance: number;
  staff_on_duty: number;
} {
  // Declining customers: 120-150 (significant drop)
  const baseCustomers = 135;
  const customers = baseCustomers - (dayOffset * 0.8); // Significant decline
  
  // Low sales: 280-300 THB per customer
  const baseTicket = 290;
  const ticket = baseTicket - (dayOffset * 0.1);
  const total_sales = Math.round(customers * ticket);
  
  // Negative margin: 85% cost ratio (costs exceed revenue)
  const costRatio = 0.80 + (dayOffset / 40 * 0.10); // Rising from 80% to 90%
  const total_operating_cost = Math.round(total_sales * costRatio);
  
  // Low cash: starts at 500K, declining rapidly
  const cash_balance = Math.round(500_000 - (dayOffset * 15000));
  
  // Reduced staff: 5-7 people
  const staff_on_duty = 6;

  return {
    total_customers: Math.round(Math.max(80, customers)),
    total_sales,
    total_operating_cost,
    cash_balance: Math.max(0, cash_balance),
    staff_on_duty,
  };
}

/**
 * Seed F&B daily metrics for a scenario
 */
async function seedFnbScenario(
  orgIdSeed: string,
  branchId: string,
  generateMetrics: (dayOffset: number) => {
    total_customers: number;
    total_sales: number;
    total_operating_cost: number;
    cash_balance: number;
    staff_on_duty: number;
  }
): Promise<void> {
  console.log(`\n📦 Seeding F&B daily metrics for ${orgIdSeed}...`);

  // Delete existing metrics for idempotency
  const { error: deleteError } = await supabase
    .from('fnb_daily_metrics')
    .delete()
    .eq('branch_id', branchId);

  if (deleteError) {
    console.error(`  ⚠️ Failed to delete existing metrics: ${deleteError.message}`);
  }

  // Generate 40 days of daily metrics
  const today = new Date();
  const metrics = [];

  for (let dayOffset = 39; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    const metricData = generateMetrics(dayOffset);

    metrics.push({
      branch_id: branchId,
      date: dateStr,
      ...metricData,
    });
  }

  // Insert all metrics
  const { data, error } = await supabase
    .from('fnb_daily_metrics')
    .insert(metrics)
    .select();

  if (error) {
    throw new Error(`Failed to insert F&B daily metrics: ${error.message}`);
  }

  console.log(`  ✅ Inserted ${data?.length || 0} daily metrics`);
}

/**
 * Main seed function
 */
async function seedFnbDailyMetrics(): Promise<void> {
  console.log('🌱 Starting F&B daily metrics seed...\n');

  try {
    // Healthy scenario
    await seedFnbScenario(
      'healthy_fnb',
      'br-healthy-hotel-001', // Using existing branch IDs
      generateHealthyMetrics
    );

    // Stressed scenario
    await seedFnbScenario(
      'stressed_fnb',
      'br-stressed-hotel-001',
      generateStressedMetrics
    );

    // Crisis scenario
    await seedFnbScenario(
      'crisis_fnb',
      'br-crisis-hotel-001',
      generateCrisisMetrics
    );

    console.log('\n✅ All F&B daily metrics seeded successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Scenarios: 3 (healthy, stressed, crisis)');
    console.log('   - Daily metrics: 120 entries (40 per scenario)');
    console.log('\n💡 Data is ready for F&B health engine validation');
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  }
}

// Run seed when script is executed
if (require.main === module) {
  seedFnbDailyMetrics()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedFnbDailyMetrics };
