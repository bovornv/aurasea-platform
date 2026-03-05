/**
 * Alert Validation Adapter — builds BranchMetrics from test override and runs evaluation.
 * Dev-only; does NOT affect production.
 */

import type { BranchMetrics } from '../models/branch-metrics';
import type { AlertTestOverrideMetrics } from '../../../../lib/testing/generate-alert-test-cases';

const TEST_BRANCH_ID = '__alert_validation_test__';
const TEST_GROUP_ID = '__alert_validation_org__';

/**
 * Build BranchMetrics from test override (30-day synthetic data for rules that need history).
 */
export function buildBranchMetricsFromOverride(
  branchType: 'accommodation' | 'fnb',
  override: AlertTestOverrideMetrics
): BranchMetrics {
  const revenue30 = override.revenue ?? 300000;
  const cost30 = override.cost ?? 180000;
  const cash = override.cashBalance ?? 400000;
  const rev7 = override.revenue7Days ?? revenue30 / 4;
  const cost7 = override.cost7Days ?? cost30 / 4;

  const modules: BranchMetrics['modules'] = {};
  if (branchType === 'accommodation') {
    modules.accommodation = {
      occupancyRateLast30DaysPct: override.occupancyRatePct ?? 65,
      averageDailyRoomRateTHB: override.averageDailyRate ?? 2500,
      totalRoomsAvailable: override.totalRooms ?? 50,
      totalStaffAccommodation: 10,
    };
  } else {
    modules.fnb = {
      totalCustomersLast7Days: override.customersLast7Days ?? 500,
      averageTicketPerCustomerTHB: (revenue30 / 30) / ((override.customersLast7Days ?? 500) / 7 || 1) || 200,
      totalStaffFnb: 8,
      top3MenuRevenueShareLast30DaysPct: override.top3MenuSharePct ?? 35,
    };
  }

  const dataConfidence = override.dataConfidence ?? 0.85;
  if (override.dataConfidence !== undefined) {
    (modules as any).metadata = { dataConfidence };
  }

  return {
    branchId: TEST_BRANCH_ID,
    groupId: TEST_GROUP_ID,
    updatedAt: new Date().toISOString(),
    financials: {
      cashBalanceTHB: cash,
      revenueLast30DaysTHB: revenue30,
      costsLast30DaysTHB: cost30,
      revenueLast7DaysTHB: rev7,
      costsLast7DaysTHB: cost7,
    },
    modules,
    metadata: {
      dataConfidence: override.dataConfidence ?? 0.85,
    },
  };
}

export { TEST_BRANCH_ID, TEST_GROUP_ID };
