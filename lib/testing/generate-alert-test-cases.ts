/**
 * Alert Validation Test Cases
 * Deterministic test data to validate all 16 alerts for Accommodation and F&B.
 * Used by run-alert-validation.ts — does NOT affect production.
 */

/** Override metrics to inject into alert engine (partial; neutral defaults for non-overridden fields). */
export interface AlertTestOverrideMetrics {
  /** Revenue (30-day total or daily depending on rule context) — THB */
  revenue?: number;
  /** Cost (30-day total or daily) — THB */
  cost?: number;
  /** Cash balance — THB */
  cashBalance?: number;
  /** Revenue last 7 days — THB (for trend rules) */
  revenue7Days?: number;
  /** Cost last 7 days — THB */
  cost7Days?: number;
  /** Net cash flow (revenue - cost) per day — THB (negative = burn) */
  netCashFlow?: number;
  /** Occupancy rate 0–100% (accommodation) */
  occupancyRatePct?: number;
  /** Total rooms (accommodation) */
  totalRooms?: number;
  /** ADR — THB (accommodation) */
  averageDailyRate?: number;
  /** Top 3 menu revenue share % (F&B) */
  top3MenuSharePct?: number;
  /** Weekday vs weekend revenue ratio / gap (F&B) */
  avgWeekdayRevenue14d?: number;
  avgWeekendRevenue14d?: number;
  /** Data confidence 0–1 (for data-confidence-risk) */
  dataConfidence?: number;
  /** Break-even ratio (revenue/costs); <1 = loss */
  breakEvenRatio?: number;
  /** Revenue volatility / coefficient of variation */
  revenueVolatility?: number;
  /** Customer volume (F&B) last 7 days */
  customersLast7Days?: number;
}

export type AlertTestCase = {
  name: string;
  branchType: 'accommodation' | 'fnb';
  overrideMetrics: AlertTestOverrideMetrics;
  /** Expected alert type IDs (hyphenated, e.g. "liquidity-runway-risk") */
  expectedAlerts: string[];
};

/** All 16 alert types (hyphenated, match getAlertType() output). */
export const ALERT_TYPES = [
  'liquidity-runway-risk',
  'cash-runway',
  'break-even-risk',
  'margin-compression',
  'cost-pressure',
  'demand-drop',
  'revenue-concentration',
  'cash-flow-volatility',
  'low-weekday-utilization',
  'capacity-utilization',
  'weekend-weekday-imbalance',
  'weekend-weekday-fnb-gap',
  'menu-revenue-concentration',
  'seasonal-mismatch',
  'seasonality-risk',
  'data-confidence-risk',
] as const;

const ACCOMMODATION_NEUTRAL: AlertTestOverrideMetrics = {
  revenue: 500000,
  cost: 300000,
  cashBalance: 800000,
  revenue7Days: 120000,
  cost7Days: 72000,
  netCashFlow: 6667,
  occupancyRatePct: 65,
  totalRooms: 50,
  averageDailyRate: 2500,
};

const FNB_NEUTRAL: AlertTestOverrideMetrics = {
  revenue: 300000,
  cost: 180000,
  cashBalance: 400000,
  revenue7Days: 70000,
  cost7Days: 42000,
  netCashFlow: 4000,
  top3MenuSharePct: 35,
  avgWeekdayRevenue14d: 35000,
  avgWeekendRevenue14d: 45000,
  customersLast7Days: 500,
};

/**
 * 16 deterministic test cases — each forces exactly one alert at a clear threshold boundary.
 */
export const ALERT_TEST_CASES: AlertTestCase[] = [
  {
    name: 'Liquidity Runway Critical',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 5000,
      cost: 12000,
      cashBalance: 20000,
      netCashFlow: -233, // ~7k/month burn
    },
    expectedAlerts: ['liquidity-runway-risk'],
  },
  {
    name: 'Cash Runway Critical',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      cashBalance: 15000,
      cost: 80000, // high burn
    },
    expectedAlerts: ['cash-runway'],
  },
  {
    name: 'Break-Even Risk Warning',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 280000,
      cost: 300000,
    },
    expectedAlerts: ['break-even-risk'],
  },
  {
    name: 'Margin Compression',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 400000,
      cost: 360000, // margin squeeze
    },
    expectedAlerts: ['margin-compression'],
  },
  {
    name: 'Cost Pressure',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      cost: 350000,
      cost7Days: 95000,
    },
    expectedAlerts: ['cost-pressure'],
  },
  {
    name: 'Demand Drop',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 400000,
      revenue7Days: 45000,
    },
    expectedAlerts: ['demand-drop'],
  },
  {
    name: 'Revenue Concentration',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 200000,
    },
    expectedAlerts: ['revenue-concentration'],
  },
  {
    name: 'Cash Flow Volatility',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 350000,
      cost: 200000,
      revenue7Days: 80000,
      cost7Days: 60000,
      revenueVolatility: 0.5,
    },
    expectedAlerts: ['cash-flow-volatility'],
  },
  {
    name: 'Low Weekday Utilization',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      occupancyRatePct: 25,
      revenue: 150000,
    },
    expectedAlerts: ['low-weekday-utilization'],
  },
  {
    name: 'Capacity Utilization',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      occupancyRatePct: 28,
      totalRooms: 50,
      averageDailyRate: 2500,
    },
    expectedAlerts: ['capacity-utilization'],
  },
  {
    name: 'Weekend-Weekday Imbalance',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 400000,
      averageDailyRate: 2200,
    },
    expectedAlerts: ['weekend-weekday-imbalance'],
  },
  {
    name: 'Weekend-Weekday F&B Gap',
    branchType: 'fnb',
    overrideMetrics: {
      ...FNB_NEUTRAL,
      revenue: 250000,
      avgWeekdayRevenue14d: 8000,
      avgWeekendRevenue14d: 35000,
      customersLast7Days: 400,
    },
    expectedAlerts: ['weekend-weekday-fnb-gap'],
  },
  {
    name: 'Menu Revenue Concentration',
    branchType: 'fnb',
    overrideMetrics: {
      ...FNB_NEUTRAL,
      top3MenuSharePct: 72,
    },
    expectedAlerts: ['menu-revenue-concentration'],
  },
  {
    name: 'Seasonal Mismatch',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 450000,
      revenue7Days: 80000,
    },
    expectedAlerts: ['seasonal-mismatch'],
  },
  {
    name: 'Seasonality Risk',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 380000,
      revenue7Days: 90000,
    },
    expectedAlerts: ['seasonality-risk'],
  },
  {
    name: 'Data Confidence Risk',
    branchType: 'accommodation',
    overrideMetrics: {
      ...ACCOMMODATION_NEUTRAL,
      dataConfidence: 0.35,
    },
    expectedAlerts: ['data-confidence-risk'],
  },
];

/** Filter test cases by branch type. */
export function getTestCasesForBranchType(
  branchType: 'accommodation' | 'fnb'
): AlertTestCase[] {
  return ALERT_TEST_CASES.filter((tc) => tc.branchType === branchType);
}

/** Cross-scenario test: healthy (no critical), stressed (warnings), crisis (≥1 critical). */
export const SCENARIO_TEST_INPUTS: Record<
  'accommodation' | 'fnb',
  { healthy: AlertTestOverrideMetrics; stressed: AlertTestOverrideMetrics; crisis: AlertTestOverrideMetrics }
> = {
  accommodation: {
    healthy: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 500000,
      cost: 300000,
      cashBalance: 1_200_000,
      netCashFlow: 6667,
    },
    stressed: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 350000,
      cost: 320000,
      cashBalance: 400000,
      netCashFlow: 1000,
    },
    crisis: {
      ...ACCOMMODATION_NEUTRAL,
      revenue: 5000,
      cost: 12000,
      cashBalance: 20000,
      netCashFlow: -233,
    },
  },
  fnb: {
    healthy: { ...FNB_NEUTRAL, revenue: 300000, cost: 180000, cashBalance: 500000 },
    stressed: { ...FNB_NEUTRAL, revenue: 200000, cost: 190000, top3MenuSharePct: 55 },
    crisis: { ...FNB_NEUTRAL, revenue: 80000, cost: 100000, cashBalance: 30000 },
  },
};
