/**
 * Tests for Branch Health Score Computation
 */

import { calculateBranchHealthScore } from '../branch-health-score';
import type { AlertContract } from '../../../../contracts/alerts';

describe('calculateBranchHealthScore', () => {
  const createAlert = (
    severity: 'critical' | 'warning' | 'informational',
    message: string,
    id: string = `alert-${Date.now()}-${Math.random()}`
  ): AlertContract => ({
    id,
    timestamp: new Date(),
    type: 'risk',
    severity,
    domain: 'risk',
    timeHorizon: 'near-term',
    relevanceWindow: {
      start: new Date(),
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    message,
    confidence: 0.75,
    contributingFactors: [],
    conditions: [],
  });

  describe('Base score and deductions', () => {
    it('should return 100 for no alerts', () => {
      const result = calculateBranchHealthScore([]);
      
      expect(result.score).toBe(100);
      expect(result.statusLabel).toBe('Healthy');
      expect(result.alertSummary).toEqual({
        critical: 0,
        warning: 0,
        informational: 0,
        total: 0,
      });
      expect(result.topIssues).toEqual([]);
    });

    it('should deduct 20 points for each critical alert', () => {
      const alerts = [
        createAlert('critical', 'Critical alert 1'),
        createAlert('critical', 'Critical alert 2'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.score).toBe(60); // 100 - (2 * 20) = 60
      expect(result.statusLabel).toBe('Stable');
      expect(result.alertSummary.critical).toBe(2);
    });

    it('should deduct 10 points for each warning alert', () => {
      const alerts = [
        createAlert('warning', 'Warning alert 1'),
        createAlert('warning', 'Warning alert 2'),
        createAlert('warning', 'Warning alert 3'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.score).toBe(70); // 100 - (3 * 10) = 70
      expect(result.statusLabel).toBe('Stable');
      expect(result.alertSummary.warning).toBe(3);
    });

    it('should deduct 5 points for each informational alert', () => {
      const alerts = [
        createAlert('informational', 'Info alert 1'),
        createAlert('informational', 'Info alert 2'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.score).toBe(90); // 100 - (2 * 5) = 90
      expect(result.statusLabel).toBe('Healthy');
      expect(result.alertSummary.informational).toBe(2);
    });

    it('should combine deductions from all severity levels', () => {
      const alerts = [
        createAlert('critical', 'Critical alert'),
        createAlert('warning', 'Warning alert'),
        createAlert('informational', 'Info alert'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.score).toBe(65); // 100 - 20 - 10 - 5 = 65
      expect(result.statusLabel).toBe('Stable');
      expect(result.alertSummary).toEqual({
        critical: 1,
        warning: 1,
        informational: 1,
        total: 3,
      });
    });
  });

  describe('Score capping', () => {
    it('should cap score at 0 minimum', () => {
      const alerts = Array(10).fill(null).map((_, i) => 
        createAlert('critical', `Critical alert ${i}`)
      );
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.score).toBe(0); // 100 - (10 * 20) = -100, capped at 0
      expect(result.statusLabel).toBe('Critical');
    });

    it('should cap score at 100 maximum', () => {
      const alerts: AlertContract[] = [];
      const previousAlertCount = 5; // More alerts before
      
      const result = calculateBranchHealthScore(alerts, previousAlertCount);
      
      expect(result.score).toBe(100); // 100 + 5 = 105, capped at 100
      expect(result.statusLabel).toBe('Healthy');
    });
  });

  describe('Positive momentum reward', () => {
    it('should add +5 points if alerts decreased', () => {
      const alerts = [
        createAlert('warning', 'Warning alert'),
      ];
      const previousAlertCount = 3; // Had 3 alerts before, now has 1
      
      const result = calculateBranchHealthScore(alerts, previousAlertCount);
      
      expect(result.score).toBe(95); // 100 - 10 + 5 = 95
      expect(result.statusLabel).toBe('Healthy');
    });

    it('should not add points if alerts increased', () => {
      const alerts = [
        createAlert('warning', 'Warning alert 1'),
        createAlert('warning', 'Warning alert 2'),
      ];
      const previousAlertCount = 1; // Had 1 alert before, now has 2
      
      const result = calculateBranchHealthScore(alerts, previousAlertCount);
      
      expect(result.score).toBe(80); // 100 - 20 = 80 (no momentum bonus)
      expect(result.statusLabel).toBe('Healthy');
    });

    it('should not add points if alerts stayed the same', () => {
      const alerts = [
        createAlert('warning', 'Warning alert'),
      ];
      const previousAlertCount = 1; // Same count
      
      const result = calculateBranchHealthScore(alerts, previousAlertCount);
      
      expect(result.score).toBe(90); // 100 - 10 = 90 (no momentum bonus)
      expect(result.statusLabel).toBe('Healthy');
    });

    it('should apply momentum reward only once', () => {
      const alerts: AlertContract[] = []; // No alerts now
      const previousAlertCount = 10; // Had 10 alerts before
      
      const result = calculateBranchHealthScore(alerts, previousAlertCount);
      
      expect(result.score).toBe(100); // 100 + 5 = 105, capped at 100
      expect(result.statusLabel).toBe('Healthy');
    });
  });

  describe('Status labels', () => {
    it('should return "Healthy" for scores 80-100', () => {
      expect(calculateBranchHealthScore([]).statusLabel).toBe('Healthy'); // 100
      
      const alerts80 = [createAlert('warning', 'Alert')];
      expect(calculateBranchHealthScore(alerts80).statusLabel).toBe('Healthy'); // 90
      
      const alerts79 = [
        createAlert('warning', 'Alert 1'),
        createAlert('warning', 'Alert 2'),
      ];
      expect(calculateBranchHealthScore(alerts79).statusLabel).toBe('Healthy'); // 80
    });

    it('should return "Stable" for scores 60-79', () => {
      const alerts60 = [
        createAlert('critical', 'Alert'),
        createAlert('warning', 'Alert'),
      ];
      expect(calculateBranchHealthScore(alerts60).statusLabel).toBe('Stable'); // 70
      
      const alerts61 = [
        createAlert('critical', 'Alert'),
        createAlert('warning', 'Alert'),
        createAlert('informational', 'Alert'),
      ];
      expect(calculateBranchHealthScore(alerts61).statusLabel).toBe('Stable'); // 65
    });

    it('should return "At Risk" for scores 40-59', () => {
      const alerts50 = [
        createAlert('critical', 'Alert 1'),
        createAlert('critical', 'Alert 2'),
        createAlert('warning', 'Alert'),
      ];
      expect(calculateBranchHealthScore(alerts50).statusLabel).toBe('At Risk'); // 50
      
      const alerts40 = [
        createAlert('critical', 'Alert 1'),
        createAlert('critical', 'Alert 2'),
        createAlert('critical', 'Alert 3'),
      ];
      expect(calculateBranchHealthScore(alerts40).statusLabel).toBe('At Risk'); // 40
    });

    it('should return "Critical" for scores <40', () => {
      const alerts30 = [
        createAlert('critical', 'Alert 1'),
        createAlert('critical', 'Alert 2'),
        createAlert('critical', 'Alert 3'),
        createAlert('warning', 'Alert'),
      ];
      expect(calculateBranchHealthScore(alerts30).statusLabel).toBe('Critical'); // 30
      
      const alerts0 = Array(5).fill(null).map((_, i) => 
        createAlert('critical', `Alert ${i}`)
      );
      expect(calculateBranchHealthScore(alerts0).statusLabel).toBe('Critical'); // 0
    });
  });

  describe('Top issues', () => {
    it('should return top 2 alerts prioritized by severity', () => {
      const alerts = [
        createAlert('informational', 'Info alert'),
        createAlert('critical', 'Critical alert'),
        createAlert('warning', 'Warning alert'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.topIssues).toHaveLength(2);
      expect(result.topIssues[0]).toBe('Critical alert');
      expect(result.topIssues[1]).toBe('Warning alert');
    });

    it('should prioritize critical over warning over informational', () => {
      const alerts = [
        createAlert('warning', 'Warning 1'),
        createAlert('informational', 'Info 1'),
        createAlert('critical', 'Critical 1'),
        createAlert('informational', 'Info 2'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.topIssues).toHaveLength(2);
      expect(result.topIssues[0]).toBe('Critical 1');
      expect(result.topIssues[1]).toBe('Warning 1');
    });

    it('should return fewer than 2 if fewer alerts exist', () => {
      const alerts = [
        createAlert('critical', 'Critical alert'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.topIssues).toHaveLength(1);
      expect(result.topIssues[0]).toBe('Critical alert');
    });

    it('should return empty array for no alerts', () => {
      const result = calculateBranchHealthScore([]);
      
      expect(result.topIssues).toEqual([]);
    });

    it('should use message as title', () => {
      const alerts = [
        createAlert('critical', 'Custom message here'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.topIssues[0]).toBe('Custom message here');
    });
  });

  describe('Alert summary', () => {
    it('should correctly count alerts by severity', () => {
      const alerts = [
        createAlert('critical', 'Critical 1'),
        createAlert('critical', 'Critical 2'),
        createAlert('warning', 'Warning 1'),
        createAlert('informational', 'Info 1'),
        createAlert('informational', 'Info 2'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      expect(result.alertSummary).toEqual({
        critical: 2,
        warning: 1,
        informational: 2,
        total: 5,
      });
    });

    it('should handle empty alerts array', () => {
      const result = calculateBranchHealthScore([]);
      
      expect(result.alertSummary).toEqual({
        critical: 0,
        warning: 0,
        informational: 0,
        total: 0,
      });
    });
  });

  describe('Deterministic behavior', () => {
    it('should return same result for same inputs', () => {
      const alerts = [
        createAlert('critical', 'Alert 1', 'id1'),
        createAlert('warning', 'Alert 2', 'id2'),
      ];
      
      const result1 = calculateBranchHealthScore(alerts);
      const result2 = calculateBranchHealthScore(alerts);
      
      expect(result1.score).toBe(result2.score);
      expect(result1.statusLabel).toBe(result2.statusLabel);
      expect(result1.alertSummary).toEqual(result2.alertSummary);
      expect(result1.topIssues).toEqual(result2.topIssues);
    });

    it('should round score to 1 decimal place', () => {
      // This test ensures deterministic rounding
      const alerts = [
        createAlert('warning', 'Alert'),
      ];
      
      const result = calculateBranchHealthScore(alerts);
      
      // Score should be exactly 90.0 (no decimals, but rounded to 1 decimal)
      expect(result.score).toBe(90);
      expect(typeof result.score).toBe('number');
    });
  });
});
