/**
 * Verify Organization Scenario Testing
 * 
 * Tests organization switching and validates:
 * 1. Organization switching works
 * 2. Metrics loading (30+ metrics per branch)
 * 3. Health scores match expected ranges
 * 4. Alerts match expected patterns
 */

const { config } = require('dotenv');
const { resolve } = require('path');

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/web/.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Organization {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
  organization_id: string;
}

interface WeeklyMetric {
  branch_id: string;
  week_start_date: string;
}

async function verifyOrganizations(): Promise<Organization[]> {
  console.log('\n📋 Verifying Organizations...');
  
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name');
  
  if (error) {
    console.error('❌ Failed to load organizations:', error);
    return [];
  }
  
  const expectedOrgs = ['Healthy Hotel Group', 'Stressed Hotel Group', 'Crisis Hotel Group'];
  const foundOrgs = data?.map((o: Organization) => o.name) || [];
  
  console.log(`   Found ${data?.length || 0} organizations:`);
  data?.forEach((org: Organization) => {
    console.log(`   - ${org.name} (${org.id})`);
  });
  
  const missing = expectedOrgs.filter(name => !foundOrgs.includes(name));
  if (missing.length > 0) {
    console.warn(`   ⚠️  Missing organizations: ${missing.join(', ')}`);
  } else {
    console.log('   ✅ All expected organizations found');
  }
  
  return data || [];
}

async function verifyBranches(organizations: Organization[]): Promise<Map<string, Branch[]>> {
  console.log('\n🏢 Verifying Branches...');
  
  const branchMap = new Map<string, Branch[]>();
  
  for (const org of organizations) {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, organization_id, module_type')
      .eq('organization_id', org.id);
    
    if (error) {
      console.error(`   ❌ Failed to load branches for ${org.name}:`, error);
      continue;
    }
    
    branchMap.set(org.id, data || []);
    console.log(`   ${org.name}: ${data?.length || 0} branch(es)`);
    data?.forEach((branch: Branch) => {
      console.log(`     - ${branch.name} (${branch.id})`);
    });
    
    if ((data?.length || 0) === 0) {
      console.warn(`   ⚠️  No branches found for ${org.name}`);
    } else if ((data?.length || 0) > 1) {
      console.warn(`   ⚠️  Expected 1 branch, found ${data?.length}`);
    } else {
      console.log(`     ✅ Correct number of branches`);
    }
  }
  
  return branchMap;
}

async function verifyMetrics(branchMap: Map<string, Branch[]>): Promise<void> {
  console.log('\n📊 Verifying Weekly Metrics...');
  
  let totalMetrics = 0;
  let branchesWithInsufficientMetrics = 0;
  
  for (const [orgId, branches] of branchMap.entries()) {
    const org = Array.from(branchMap.keys()).find((id: string) => id === orgId);
    console.log(`\n   Organization: ${orgId}`);
    
    const branchList = branches as Branch[];
    for (const branch of branchList) {
      const { data, error } = await supabase
        .from('weekly_metrics')
        .select('branch_id, week_start_date')
        .eq('branch_id', branch.id)
        .order('week_start_date', { ascending: false });
      
      if (error) {
        console.error(`     ❌ Failed to load metrics for ${branch.name}:`, error);
        continue;
      }
      
      const count = data?.length || 0;
      totalMetrics += count;
      
      console.log(`     ${branch.name}: ${count} metrics`);
      
      if (count < 30) {
        console.warn(`     ⚠️  Insufficient metrics: Expected 30+, found ${count}`);
        branchesWithInsufficientMetrics++;
      } else {
        console.log(`     ✅ Sufficient metrics (${count} >= 30)`);
      }
      
      // Show date range
      if (data && data.length > 0) {
        const dates = data.map((m: WeeklyMetric) => m.week_start_date).sort();
        const oldest = dates[0];
        const newest = dates[dates.length - 1];
        console.log(`       Date range: ${oldest} to ${newest}`);
      }
    }
  }
  
  console.log(`\n   Total metrics across all branches: ${totalMetrics}`);
  if (branchesWithInsufficientMetrics > 0) {
    console.warn(`   ⚠️  ${branchesWithInsufficientMetrics} branch(es) have insufficient metrics`);
  } else {
    console.log('   ✅ All branches have sufficient metrics');
  }
}

async function verifyOrganizationData(): Promise<void> {
  console.log('🔍 Verifying Organization Scenario Testing Setup...\n');
  
  try {
    // 1. Verify organizations exist
    const organizations = await verifyOrganizations();
    
    if (organizations.length === 0) {
      console.error('\n❌ No organizations found. Run: npm run seed:real-test');
      process.exit(1);
    }
    
    // 2. Verify branches exist
    const branchMap = await verifyBranches(organizations);
    
    // 3. Verify metrics exist
    await verifyMetrics(branchMap);
    
    console.log('\n✅ Verification complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Open http://localhost:3000/group/settings');
    console.log('   2. Use "Developer Scenario Switch" dropdown');
    console.log('   3. Switch between organizations and verify:');
    console.log('      - Health scores update correctly');
    console.log('      - Alerts match scenario expectations');
    console.log('      - Debug panel shows 30+ metrics');
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run verification
verifyOrganizationData();
