/**
 * Decision Engine v2 Test Suite
 * 
 * Tests the new Financial Decision Engine (Health Score v2, Revenue Exposure, Money-Weighted Scoring)
 */

import { describe, it, expect } from 'vitest';
import {
  generateDecisionEngineScenario,
  type DecisionEngineScenario,
} from './decision-engine-fixtures';
import { calculateRevenueExposure } from '../sme-os/engine/services/revenue-exposure-engine';
import { calculateMoneyWeightedHealthScore } from '../sme-os/engine/health/money-weighted-health-score';
import { calculateHealthImprovement } from '../sme-os/engine/services/health-improvement-calculator';
import type { AlertContract } from '../sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../apps/web/app/services/monitoring-service';

describe('Financial Decision Engine v2', () => {
  describe('Revenue Exposure Engine', () => {
    it('should calculate revenue exposure for healthy branch', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      const mockAlerts: AlertContract[] = []; // No alerts
      
      const result = calculateRevenueExposure(scenario.metrics, mockAlerts);
      
      expect(result.totalMonthlyLeakage).toBe(0);
      expect(result.exposurePercent).toBe(0);
      expect(Object.values(result.leakageByCategory).every(v => v === 0)).toBe(true);
    });

    it('should calculate revenue exposure for margin compression', () => {
      const scenario = generateDecisionEngineScenario('margin');
      
      // Create mock alerts with revenue impact
      const mockAlerts: ExtendedAlertContract[] = [
        {
          id: 'margin-compression-1',
          timestamp: new Date(),
          type: 'risk',
          severity: 'critical',
          domain: 'risk',
          timeHorizon: 'immediate',
          relevanceWindow: { start: new Date(), end: new Date() },
          message: 'Margin compression detected',
          confidence: 0.9,
          contributingFactors: [],
          conditions: [],
          revenueImpact: 150000, // 150k THB/month
        },
      ];
      
      const result = calculateRevenueExposure(scenario.metrics, mockAlerts);
      
      expect(result.totalMonthlyLeakage).toBeGreaterThan(0);
      expect(result.leakageByCategory.margin).toBeGreaterThan(0);
      expect(result.exposurePercent).toBeGreaterThan(0);
      expect(result.exposurePercent).toBeLessThanOrEqual(100);
    });

    it('should handle missing metrics gracefully', () => {
      const result = calculateRevenueExposure(null as any, []);
      
      expect(result.totalMonthlyLeakage).toBe(0);
      expect(result.exposurePercent).toBe(0);
    });

    it('should categorize alerts correctly', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      
      const mockAlerts: ExtendedAlertContract[] = [
        {
          id: 'cash-runway-1',
          timestamp: new Date(),
          type: 'risk',
          severity: 'critical',
          domain: 'cash',
          timeHorizon: 'immediate',
          relevanceWindow: { start: new Date(), end: new Date() },
          message: 'Cash runway risk',
          confidence: 0.9,
          contributingFactors: [],
          conditions: [],
          revenueImpact: 100000,
        },
        {
          id: 'capacity-utilization-1',
          timestamp: new Date(),
          type: 'risk',
          severity: 'warning',
          domain: 'risk',
          timeHorizon: 'near-term',
          relevanceWindow: { start: new Date(), end: new Date() },
          message: 'Low capacity utilization',
          confidence: 0.8,
          contributingFactors: [],
          conditions: [],
          revenueImpact: 50000,
        },
      ];
      
      const result = calculateRevenueExposure(scenario.metrics, mockAlerts);
      
      expect(result.leakageByCategory.cash).toBeGreaterThan(0);
      expect(result.leakageByCategory.demand).toBeGreaterThan(0);
      expect(result.totalMonthlyLeakage).toBe(150000);
    });
  });

  describe('Money-Weighted Health Score v2', () => {
    it('should calculate health score for healthy branch', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      const mockAlerts: AlertContract[] = [];
      
      const result = calculateMoneyWeightedHealthScore(scenario.metrics, mockAlerts);
      
      expect(result.score).toBeGreaterThanOrEqual(85);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.monthlyRevenue).toBeGreaterThan(0);
      expect(result.totalExposure).toBe(0);
      expect(result.exposurePercent).toBe(0);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('should calculate health score for margin compression (150k on 2M revenue = 7.5% penalty)', () => {
      const scenario = generateDecisionEngineScenario('margin');
      
      const mockAlerts: ExtendedAlertContract[] = [
        {
          id: 'margin-compression-1',
          timestamp: new Date(),
          type: 'risk',
          severity: 'critical',
          domain: 'risk',
          timeHorizon: 'immediate',
          relevanceWindow: { start: new Date(), end: new Date() },
          message: 'Margin compression',
          confidence: 0.9,
          contributingFactors: [],
          conditions: [],
          revenueImpact: 150000, // 150k THB/month
        },
      ];
      
      const result = calculateMoneyWeightedHealthScore(scenario.metrics, mockAlerts);
      
      // 150k / 2M = 7.5% exposure → score should be ~92.5
      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.score).toBeLessThanOrEqual(95);
      expect(result.exposurePercent).toBeGreaterThan(7);
      expect(result.exposurePercent).toBeLessThan(8);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('should calculate health score for small issue (10k on 2M revenue = 0.5% penalty)', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      
      const mockAlerts: ExtendedAlertContract[] = [
        {
          id: 'small-issue-1',
          timestamp: new Date(),
          type: 'risk',
          severity: 'informational',
          domain: 'risk',
          timeHorizon: 'medium-term',
          relevanceWindow: { start: new Date(), end: new Date() },
          message: 'Small issue',
          confidence: 0.7,
          contributingFactors: [],
          conditions: [],
          revenueImpact: 10000, // 10k THB/month
        },
      ];
      
      const result = calculateMoneyWeightedHealthScore(scenario.metrics, mockAlerts);
      
      // 10k / 2M = 0.5% exposure → score should be ~99.5
      expect(result.score).toBeGreaterThanOrEqual(99);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.exposurePercent).toBeLessThan(1);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('should handle zero revenue gracefully', () => {
      const scenario = generateDecisionEngineScenario('missing');
      
      const result = calculateMoneyWeightedHealthScore(scenario.metrics, []);
      
      expect(result.score).toBe(0);
      expect(result.monthlyRevenue).toBe(0);
      expect(result.totalExposure).toBe(0);
      expect(Number.isNaN(result.score)).toBe(false);
    });

    it('should handle corrupted data safely', () => {
      const scenario = generateDecisionEngineScenario('corrupted');
      
      const result = calculateMoneyWeightedHealthScore(scenario.metrics, []);
      
      expect(Number.isNaN(result.score)).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Health Improvement Calculator', () => {
    it('should calculate health improvement from revenue recovery', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      
      const result = calculateHealthImprovement(scenario.metrics, 150000); // 150k recovery
      
      expect(result.revenueRecovered).toBe(150000);
      expect(result.healthScoreIncrease).toBeGreaterThan(0);
      expect(result.healthScoreIncrease).toBeLessThanOrEqual(100);
      expect(Number.isNaN(result.healthScoreIncrease)).toBe(false);
    });

    it('should calculate correct health score increase (150k recovery on 2M revenue = 7.5% increase)', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      const monthlyRevenue = scenario.metrics.financials.revenueLast30DaysTHB; // 2M
      
      const result = calculateHealthImprovement(scenario.metrics, 150000);
      
      // 150k / 2M * 100 = 7.5%
      const expectedIncrease = (150000 / monthlyRevenue) * 100;
      expect(result.healthScoreIncrease).toBeGreaterThanOrEqual(expectedIncrease - 0.5);
      expect(result.healthScoreIncrease).toBeLessThanOrEqual(expectedIncrease + 0.5);
    });

    it('should handle zero recovery', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      
      const result = calculateHealthImprovement(scenario.metrics, 0);
      
      expect(result.revenueRecovered).toBe(0);
      expect(result.healthScoreIncrease).toBe(0);
    });

    it('should handle missing metrics', () => {
      const result = calculateHealthImprovement(null as any, 100000);
      
      expect(result.revenueRecovered).toBe(0);
      expect(result.healthScoreIncrease).toBe(0);
    });
  });

  describe('Integration: Complete Decision Flow', () => {
    it('should process healthy branch scenario correctly', () => {
      const scenario = generateDecisionEngineScenario('healthy');
      const mockAlerts: AlertContract[] = [];
      
      const exposure = calculateRevenueExposure(scenario.metrics, mockAlerts);
      const healthScore = calculateMoneyWeightedHealthScore(scenario.metrics, mockAlerts);
      
      expect(exposure.totalMonthlyLeakage).toBe(0);
      expect(healthScore.score).toBeGreaterThanOrEqual(85);
      expect(healthScore.score).toBeLessThanOrEqual(100);
      expect(Number.isNaN(healthScore.score)).toBe(false);
    });

    it('should process margin compression scenario correctly', () => {
      const scenario = generateDecisionEngineScenario('margin');
      
      const mockAlerts: ExtendedAlertContract[] = [
        {
          id: 'margin-compression-1',
          timestamp: new Date(),
          type: 'risk',
          severity: 'critical',
          domain: 'risk',
          timeHorizon: 'immediate',
          relevanceWindow: { start: new Date(), end: new Date() },
          message: 'Margin compression',
          confidence: 0.9,
          contributingFactors: [],
          conditions: [],
          revenueImpact: 150000,
        },
      ];
      
      const exposure = calculateRevenueExposure(scenario.metrics, mockAlerts);
      const healthScore = calculateMoneyWeightedHealthScore(scenario.metrics, mockAlerts);
      const improvement = calculateHealthImprovement(scenario.metrics, 150000);
      
      expect(exposure.totalMonthlyLeakage).toBe(150000);
      expect(exposure.exposurePercent).toBeGreaterThan(7);
      expect(healthScore.score).toBeLessThan(100);
      expect(healthScore.exposurePercent).toBeGreaterThan(7);
      expect(improvement.healthScoreIncrease).toBeGreaterThan(7);
      expect(Number.isNaN(healthScore.score)).toBe(false);
    });

    it('should handle missing data scenario safely', () => {
      const scenario = generateDecisionEngineScenario('missing');
      
      const exposure = calculateRevenueExposure(scenario.metrics, []);
      const healthScore = calculateMoneyWeightedHealthScore(scenario.metrics, []);
      
      expect(exposure.totalMonthlyLeakage).toBe(0);
      expect(healthScore.score).toBe(0);
      expect(Number.isNaN(healthScore.score)).toBe(false);
    });

    it('should handle corrupted data scenario safely', () => {
      const scenario = generateDecisionEngineScenario('corrupted');
      
      const exposure = calculateRevenueExposure(scenario.metrics, []);
      const healthScore = calculateMoneyWeightedHealthScore(scenario.metrics, []);
      
      expect(Number.isNaN(exposure.totalMonthlyLeakage)).toBe(false);
      expect(Number.isNaN(healthScore.score)).toBe(false);
      expect(healthScore.score).toBeGreaterThanOrEqual(0);
      expect(healthScore.score).toBeLessThanOrEqual(100);
    });
  });
});
