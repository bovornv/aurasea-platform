// Hospitality data service - provides mock/seeded data for MVP
// Uses business setup data when available, falls back to defaults
// Supports TEST_MODE for loading fixture data in development

import type { HospitalityInput } from '../adapters/hospitality-adapter';
import type { BusinessSetup } from '../contexts/business-setup-context';
import { loadTestHospitalityInput, isTestModeEnabled } from './test-fixture-loader';

/**
 * Generate hospitality financial data using business setup
 * Falls back to mock data if setup is incomplete
 */
export function generateHospitalityDataFromSetup(setup: BusinessSetup | null): HospitalityInput {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const ninetyDaysFromNow = new Date(today);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  // Use setup data if available, otherwise use defaults
  const currentBalance = setup?.currentCashBalance || 80000;
  const monthlyFixedCosts = setup?.monthlyFixedCosts || 55000;
  const revenueSources = setup?.revenueSources || {
    rooms: true,
    food: true,
    beverages: true,
    other: false,
  };

  // Generate historical cash flows (last 30 days)
  const historicalFlows: Array<{ date: Date; amount: number; direction: 'inflow' | 'outflow'; category: string }> = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(thirtyDaysAgo);
    date.setDate(date.getDate() + i);
    
    // Daily revenue (inflow) - scale based on setup
    const baseRevenue = currentBalance > 100000 ? 20000 : currentBalance > 50000 ? 15000 : 10000;
    const dailyRevenue = baseRevenue + Math.random() * (baseRevenue * 0.3);
    historicalFlows.push({
      date,
      amount: dailyRevenue,
      direction: 'inflow',
      category: 'revenue'
    });
    
    // Daily expenses (outflow) - every 3 days, scale based on monthly costs
    if (i % 3 === 0) {
      const avgDailyExpense = monthlyFixedCosts / 30;
      const dailyExpense = avgDailyExpense * 0.3 + Math.random() * (avgDailyExpense * 0.2);
      historicalFlows.push({
        date,
        amount: dailyExpense,
        direction: 'outflow',
        category: 'operational'
      });
    }
  }

  // Generate future cash flows (next 90 days for better runway analysis)
  const futureFlows: Array<{ date: Date; amount: number; direction: 'inflow' | 'outflow'; category: string }> = [];
  for (let i = 1; i <= 90; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    // Projected daily revenue (slightly lower than historical average to create risk scenario)
    const baseRevenue = currentBalance > 100000 ? 18000 : currentBalance > 50000 ? 14000 : 9000;
    const dailyRevenue = baseRevenue + Math.random() * (baseRevenue * 0.25);
    futureFlows.push({
      date,
      amount: dailyRevenue,
      direction: 'inflow',
      category: 'revenue'
    });
    
    // Projected expenses - larger outflows on specific days
    if (i === 15 || i === 45) {
      // Monthly fixed costs (rent, payroll) - use setup data
      futureFlows.push({
        date,
        amount: monthlyFixedCosts,
        direction: 'outflow',
        category: 'fixed_cost'
      });
    } else if (i % 3 === 0) {
      // Regular operational expenses - scale based on monthly costs
      const avgDailyExpense = monthlyFixedCosts / 30;
      const dailyExpense = avgDailyExpense * 0.35 + Math.random() * (avgDailyExpense * 0.2);
      futureFlows.push({
        date,
        amount: dailyExpense,
        direction: 'outflow',
        category: 'operational'
      });
    }
  }

  // Combine all flows and extract unique dates for revenue
  const allFlows = [...historicalFlows, ...futureFlows];
  const revenueDates = Array.from(new Set(
    allFlows
      .filter(f => f.direction === 'inflow')
      .map(f => f.date.getTime())
  )).map(timestamp => new Date(timestamp));

  // Calculate average daily revenue from historical data
  const historicalInflows = historicalFlows.filter(f => f.direction === 'inflow');
  const avgDailyRevenue = historicalInflows.length > 0
    ? historicalInflows.reduce((sum, f) => sum + f.amount, 0) / historicalInflows.length
    : 15000;

  // Split average revenue into hospitality categories based on setup
  // If no revenue sources selected, default to all
  const hasAnySource = Object.values(revenueSources).some(v => v);
  const totalSelected = Object.values(revenueSources).filter(v => v).length || 4;
  const revenuePerSource = hasAnySource ? avgDailyRevenue / totalSelected : avgDailyRevenue / 4;
  
  const roomRevenue = revenueSources.rooms ? Math.round(revenuePerSource) : 0;
  const foodRevenue = revenueSources.food ? Math.round(revenuePerSource) : 0;
  const beverageRevenue = revenueSources.beverages ? Math.round(revenuePerSource) : 0;
  const otherRevenue = revenueSources.other ? Math.round(revenuePerSource) : 0;

  return {
    financial: {
      currentBalance,
      expenses: allFlows
        .filter(f => f.direction === 'outflow')
        .map(f => ({
          date: f.date,
          amount: f.amount,
          category: f.category
        }))
    },
    revenue: {
      roomRevenue,
      foodRevenue,
      beverageRevenue,
      otherRevenue,
      dates: revenueDates
    },
    operations: {
      occupancyRate: 0.75,
      averageDailyRate: 150,
      staffShifts: []
    },
    timePeriod: {
      start: thirtyDaysAgo,
      end: ninetyDaysFromNow
    }
  };
}

/**
 * Generate mock hospitality financial data for MVP (fallback)
 * This simulates a typical hospitality business (hotel/resort/restaurant)
 */
export function generateMockHospitalityData(): HospitalityInput {
  return generateHospitalityDataFromSetup(null);
}

/**
 * Get hospitality data for SME OS evaluation
 * Uses business setup data if available, otherwise falls back to mock data
 * In TEST_MODE (dev only), loads data from fixtures based on ?scenario= query param
 */
export async function getHospitalityData(setup: BusinessSetup | null = null): Promise<HospitalityInput> {
  // Check for TEST_MODE (dev only)
  if (isTestModeEnabled()) {
    // Check if businessType is set (TEST_MODE active)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const businessType = params.get('businessType');
      
      // TEST_MODE is disabled if businessType is empty/null (None/Production selected)
      if (businessType && businessType !== '') {
        const testData = loadTestHospitalityInput();
        if (testData) {
          console.log('[TEST_MODE] Loading hospitality data from fixture');
          return testData;
        }
      }
    }
  }

  // Normal flow: simulate async data fetch
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateHospitalityDataFromSetup(setup));
    }, 100);
  });
}
