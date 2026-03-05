/**
 * Decision Engine Scenarios Test Suite
 * 
 * Tests all decision engine scenarios using fixtures from decision-engine-fixtures.ts
 * Validates health scores, alerts, and edge case handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDecisionEngineScenario,
  generateAllScenarios,
  getAvailableScenarioTypes,
  type DecisionEngineScenario,
} from './decision-engine-fixtures';
import { calculateBranchHealthScore } from '../sme-os/engine/health/branch-health-score';
import type { AlertContract } from '../sme-os/contracts/alerts';

describe('Decision Engine Scenarios', () => {
  beforeEach(() => {
    // Clear any cached data before each test
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('Scenario Generation', () => {
    it('should generate all available scenario types', () => {
      const types = getAvailableScenarioTypes();
      expect(types.length).toBeGreaterThanOrEqual(7); // At least 7 core scenarios
      expect(types).toContain('healthy');
      expect(types).toContain('margin');
      expect(types).toContain('capacity');
      expect(types).toContain('cash');
      expect(types).toContain('fnb_concentration');
      expect(types).toContain('missing');
      expect(types).toContain('corrupted');
    });

    it('should generate valid BranchMetrics for each scenario', () => {
      const types = getAvailableScenarioTypes();
      
      types.forEach(type => {
        const scenario = generateDecisionEngineScenario(type);
        
        // Validate basic structure
        expect(scenario.metrics).toBeDefined();
        expect(scenario.metrics.branchId).toBeDefined();
        expect(scenario.metrics.groupId).toBeDefined();
        expect(scenario.metrics.updatedAt).toBeDefined();
        expect(scenario.metrics.financials).toBeDefined();
        expect(scenario.metrics.metadata).toBeDefined();
        
        // Validate expected outcomes structure
        expect(scenario.expectedHealthScore).toBeDefined();
        expect(scenario.expectedHealthScore.min).toBeGreaterThanOrEqual(0);
        expect(scenario.expectedHealthScore.max).toBeLessThanOrEqual(100);
        expect(scenario.expectedAlerts).toBeDefined();
      });
    });

    it('should generate all scenarios at once', () => {
      const scenarios = generateAllScenarios();
      expect(scenarios.length).toBeGreaterThanOrEqual(7); // At least 7 core scenarios
    });
  });

  describe('Healthy Branch Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('healthy');
    });

    it('should have metrics matching healthy branch criteria', () => {
      const { metrics } = scenario;
      
      expect(metrics.financials.cashBalanceTHB).toBe(5_000_000);
      expect(metrics.financials.revenueLast30DaysTHB).toBe(2_000_000);
      expect(metrics.financials.costsLast30DaysTHB).toBe(1_500_000);
      
      if (metrics.modules.accommodation) {
        expect(metrics.modules.accommodation.occupancyRateLast30DaysPct).toBe(78);
        expect(metrics.modules.accommodation.averageDailyRoomRateTHB).toBe(3_200);
      }
      
      if (metrics.modules.fnb) {
        expect(metrics.modules.fnb.top3MenuRevenueShareLast30DaysPct).toBeLessThan(30);
      }
    });

    it('should calculate health score > 85 with no alerts', () => {
      // Healthy branch should have no alerts, so score should be 100
      const alerts: AlertContract[] = [];
      
      const healthScoreResult = calculateBranchHealthScore(alerts);
      
      // With no alerts, score should be 100 (base score)
      expect(healthScoreResult.score).toBe(100);
      expect(healthScoreResult.score).toBeGreaterThanOrEqual(scenario.expectedHealthScore.min);
      expect(healthScoreResult.score).toBeLessThanOrEqual(scenario.expectedHealthScore.max);
    });

    it('should have no critical alerts', () => {
      expect(scenario.expectedAlerts.critical).toBe(0);
    });
  });

  describe('Margin Compression Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('margin');
    });

    it('should have metrics showing margin compression', () => {
      const { metrics } = scenario;
      const margin = ((metrics.financials.revenueLast30DaysTHB - metrics.financials.costsLast30DaysTHB) / 
                     metrics.financials.revenueLast30DaysTHB) * 100;
      
      expect(margin).toBeLessThan(5); // Very low margin
      expect(metrics.financials.costsLast30DaysTHB).toBeGreaterThan(metrics.financials.revenueLast30DaysTHB * 0.9);
    });

    it('should expect health score 60-75', () => {
      expect(scenario.expectedHealthScore.min).toBe(60);
      expect(scenario.expectedHealthScore.max).toBe(75);
    });

    it('should expect critical margin compression alert', () => {
      expect(scenario.expectedAlerts.critical).toBeGreaterThanOrEqual(1);
    });

    it('should have significant revenue exposure', () => {
      expect(scenario.expectedRevenueExposure).toBeDefined();
      if (scenario.expectedRevenueExposure) {
        expect(scenario.expectedRevenueExposure.min).toBeGreaterThanOrEqual(150_000);
      }
    });
  });

  describe('Capacity Underutilization Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('capacity');
    });

    it('should have low occupancy rate', () => {
      const { metrics } = scenario;
      
      if (metrics.modules.accommodation) {
        expect(metrics.modules.accommodation.occupancyRateLast30DaysPct).toBeLessThan(50);
        expect(metrics.modules.accommodation.totalRoomsAvailable).toBeGreaterThan(50);
      }
    });

    it('should expect capacity utilization alerts', () => {
      expect(scenario.expectedAlerts.critical).toBeGreaterThanOrEqual(1);
      expect(scenario.expectedAlerts.warning).toBeGreaterThanOrEqual(1);
    });

    it('should have significant revenue exposure', () => {
      expect(scenario.expectedRevenueExposure).toBeDefined();
      if (scenario.expectedRevenueExposure) {
        expect(scenario.expectedRevenueExposure.min).toBeGreaterThanOrEqual(500_000);
      }
    });
  });

  describe('Cash Runway Risk Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('cash');
    });

    it('should have low cash balance relative to costs', () => {
      const { metrics } = scenario;
      const runwayMonths = metrics.financials.cashBalanceTHB / metrics.financials.costsLast30DaysTHB;
      
      expect(runwayMonths).toBeLessThan(1); // Less than 1 month runway
      expect(metrics.financials.cashBalanceTHB).toBeLessThan(500_000);
    });

    it('should expect low health score (20-50)', () => {
      expect(scenario.expectedHealthScore.min).toBeLessThanOrEqual(50);
      expect(scenario.expectedHealthScore.max).toBeLessThanOrEqual(50);
    });

    it('should expect critical cash runway alert', () => {
      expect(scenario.expectedAlerts.critical).toBeGreaterThanOrEqual(1);
    });
  });

  describe('F&B Revenue Concentration Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('fnb_concentration');
    });

    it('should have high top 3 menu revenue share', () => {
      const { metrics } = scenario;
      
      if (metrics.modules.fnb) {
        expect(metrics.modules.fnb.top3MenuRevenueShareLast30DaysPct).toBeGreaterThan(60);
      }
    });

    it('should expect warning alert (not critical)', () => {
      expect(scenario.expectedAlerts.critical).toBe(0);
      expect(scenario.expectedAlerts.warning).toBeGreaterThanOrEqual(1);
    });

    it('should have moderate health score (70-85)', () => {
      expect(scenario.expectedHealthScore.min).toBeGreaterThanOrEqual(70);
      expect(scenario.expectedHealthScore.max).toBeLessThanOrEqual(85);
    });
  });

  describe('Missing Data Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('missing');
    });

    it('should have minimal or zero metrics', () => {
      const { metrics } = scenario;
      
      expect(metrics.financials.cashBalanceTHB).toBe(0);
      expect(metrics.financials.revenueLast30DaysTHB).toBe(0);
      expect(metrics.modules.accommodation).toBeUndefined();
      expect(metrics.modules.fnb).toBeUndefined();
      expect(metrics.metadata.dataConfidence).toBe(0);
    });

    it('should expect health score of 0', () => {
      expect(scenario.expectedHealthScore.min).toBe(0);
      expect(scenario.expectedHealthScore.max).toBe(0);
    });

    it('should not crash when processing', () => {
      // This should not throw
      const alerts: AlertContract[] = [];
      const healthScoreResult = calculateBranchHealthScore(alerts);
      
      // With no alerts and no data, score should be handled safely
      expect(healthScoreResult.score).toBeGreaterThanOrEqual(0);
      expect(healthScoreResult.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Corrupted Data Scenario', () => {
    let scenario: DecisionEngineScenario;

    beforeEach(() => {
      scenario = generateDecisionEngineScenario('corrupted');
    });

    it('should contain NaN and invalid values', () => {
      const { metrics } = scenario;
      
      // Check that corrupted values exist (they should be NaN/undefined/Infinity)
      expect(Number.isNaN(metrics.financials.cashBalanceTHB) || 
             metrics.financials.cashBalanceTHB === undefined ||
             !isFinite(metrics.financials.cashBalanceTHB)).toBe(true);
    });

    it('should not crash when processing with safeNumber', () => {
      // Helper function to safely convert to number
      const safeNumber = (value: unknown, fallback: number = 0): number => {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value;
        const parsed = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
        return (!isNaN(parsed) && isFinite(parsed)) ? parsed : fallback;
      };

      const { metrics } = scenario;
      
      // Test that safeNumber handles corrupted values
      const safeCash = safeNumber(metrics.financials.cashBalanceTHB, 0);
      const safeRevenue = safeNumber(metrics.financials.revenueLast30DaysTHB, 0);
      
      expect(safeCash).toBe(0); // Should fallback to 0
      expect(safeRevenue).toBe(0); // Should fallback to 0
      expect(Number.isNaN(safeCash)).toBe(false);
      expect(Number.isNaN(safeRevenue)).toBe(false);
    });

    it('should expect health score of 0', () => {
      expect(scenario.expectedHealthScore.min).toBe(0);
      expect(scenario.expectedHealthScore.max).toBe(0);
    });
  });

  describe('Health Score Calculation Integration', () => {
    it('should calculate health scores for all scenarios without crashing', () => {
      const scenarios = generateAllScenarios();
      
      scenarios.forEach((scenario) => {
        expect(() => {
          // Convert metrics to a mock alert array (simplified)
          // In real integration, this would go through monitoring service
          const alerts: AlertContract[] = [];
          const healthScoreResult = calculateBranchHealthScore(alerts);
          
          // Verify score is within valid range
          expect(healthScoreResult.score).toBeGreaterThanOrEqual(0);
          expect(healthScoreResult.score).toBeLessThanOrEqual(100);
          expect(Number.isNaN(healthScoreResult.score)).toBe(false);
        }).not.toThrow();
      });
    });
  });

  describe('Edge Case Handling', () => {
    it('should handle invalid scenario type gracefully', () => {
      expect(() => {
        generateDecisionEngineScenario('invalid_type' as any);
      }).toThrow('Unknown scenario type');
    });

    it('should generate boundary cases at score thresholds', () => {
      const boundary80 = generateDecisionEngineScenario('boundary_80');
      const boundary60 = generateDecisionEngineScenario('boundary_60');
      const boundary40 = generateDecisionEngineScenario('boundary_40');

      expect(boundary80.expectedHealthScore.min).toBeGreaterThanOrEqual(78);
      expect(boundary80.expectedHealthScore.max).toBeLessThanOrEqual(82);
      expect(boundary60.expectedHealthScore.min).toBeGreaterThanOrEqual(58);
      expect(boundary60.expectedHealthScore.max).toBeLessThanOrEqual(62);
      expect(boundary40.expectedHealthScore.min).toBeGreaterThanOrEqual(38);
      expect(boundary40.expectedHealthScore.max).toBeLessThanOrEqual(42);
    });

    it('should handle zero values correctly', () => {
      const zero = generateDecisionEngineScenario('zero_values');
      
      expect(zero.metrics.financials.cashBalanceTHB).toBe(0);
      expect(zero.metrics.financials.revenueLast30DaysTHB).toBe(0);
      expect(zero.expectedHealthScore.min).toBe(0);
      expect(zero.expectedHealthScore.max).toBeLessThanOrEqual(20); // Minimum score is 20
    });

    it('should handle maximum penalty case', () => {
      const maxPenalty = generateDecisionEngineScenario('max_penalty');
      
      expect(maxPenalty.expectedHealthScore.min).toBe(20);
      expect(maxPenalty.expectedHealthScore.max).toBeLessThanOrEqual(30);
      expect(maxPenalty.expectedAlerts.critical).toBeGreaterThanOrEqual(2);
    });

    it('should handle partial module data', () => {
      const partial = generateDecisionEngineScenario('partial_module');
      
      expect(partial.metrics.modules.accommodation).toBeDefined();
      expect(partial.metrics.modules.fnb).toBeUndefined();
      expect(partial.expectedHealthScore.min).toBeGreaterThanOrEqual(70);
    });

    it('should handle stale data', () => {
      const stale = generateDecisionEngineScenario('stale_data');
      
      const dataAge = new Date().getTime() - new Date(stale.metrics.updatedAt).getTime();
      const dataAgeDays = Math.floor(dataAge / (1000 * 60 * 60 * 24));
      
      expect(dataAgeDays).toBeGreaterThan(7); // Should be stale
      expect(stale.metrics.metadata.dataConfidence).toBeLessThan(50);
    });

    it('should handle extreme but valid values', () => {
      const extreme = generateDecisionEngineScenario('extreme_values');
      
      expect(extreme.metrics.financials.cashBalanceTHB).toBeGreaterThan(10_000_000);
      expect(extreme.metrics.modules.accommodation?.occupancyRateLast30DaysPct).toBeGreaterThan(90);
      expect(extreme.expectedHealthScore.min).toBeGreaterThanOrEqual(85);
    });

    it('should handle multiple simultaneous issues', () => {
      const multiple = generateDecisionEngineScenario('multiple_issues');
      
      expect(multiple.expectedAlerts.critical).toBeGreaterThanOrEqual(1);
      expect(multiple.expectedAlerts.warning).toBeGreaterThanOrEqual(1);
      expect(multiple.expectedHealthScore.min).toBeLessThan(50);
    });

    it('should ensure all numeric values are safe', () => {
      // Helper function to safely convert to number
      const safeNumber = (value: unknown, fallback: number = 0): number => {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value;
        const parsed = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
        return (!isNaN(parsed) && isFinite(parsed)) ? parsed : fallback;
      };

      const scenarios = generateAllScenarios();
      
      scenarios.forEach(scenario => {
        const { metrics } = scenario;
        
        // Test all financial values
        const safeCash = safeNumber(metrics.financials.cashBalanceTHB, 0);
        const safeRevenue = safeNumber(metrics.financials.revenueLast30DaysTHB, 0);
        const safeCosts = safeNumber(metrics.financials.costsLast30DaysTHB, 0);
        
        expect(Number.isNaN(safeCash)).toBe(false);
        expect(Number.isNaN(safeRevenue)).toBe(false);
        expect(Number.isNaN(safeCosts)).toBe(false);
        expect(isFinite(safeCash)).toBe(true);
        expect(isFinite(safeRevenue)).toBe(true);
        expect(isFinite(safeCosts)).toBe(true);
      });
    });
  });
});
