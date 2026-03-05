/**
 * Tests for Group Health Score Aggregation
 */

import { calculateGroupHealthScore } from '../group-health-score';
import type { BranchHealthScoreInput } from '../group-health-score';
import type { BranchHealthScoreResult } from '../branch-health-score';

describe('calculateGroupHealthScore', () => {
  const createBranchScore = (
    score: number,
    statusLabel: 'Healthy' | 'Stable' | 'At Risk' | 'Critical' = 'Healthy'
  ): BranchHealthScoreResult => ({
    score,
    statusLabel,
    alertSummary: {
      critical: 0,
      warning: 0,
      informational: 0,
      total: 0,
    },
    topIssues: [],
  });

  const createBranchInput = (
    branchId: string,
    branchName: string,
    score: number,
    statusLabel: 'Healthy' | 'Stable' | 'At Risk' | 'Critical' = 'Healthy'
  ): BranchHealthScoreInput => ({
    branchId,
    branchName,
    healthScore: createBranchScore(score, statusLabel),
  });

  describe('Empty input', () => {
    it('should return Critical status with 0 score for empty array', () => {
      const result = calculateGroupHealthScore([]);

      expect(result.overallScore).toBe(0);
      expect(result.overallStatus).toBe('Critical');
      expect(result.branchDistribution).toEqual({
        Healthy: 0,
        Stable: 0,
        'At Risk': 0,
        Critical: 0,
      });
      expect(result.weakestBranch).toBeNull();
      expect(result.strongestBranch).toBeNull();
    });
  });

  describe('Single branch', () => {
    it('should return the branch score directly', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 85, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.overallScore).toBe(85);
      expect(result.overallStatus).toBe('Healthy');
      expect(result.branchDistribution).toEqual({
        Healthy: 1,
        Stable: 0,
        'At Risk': 0,
        Critical: 0,
      });
      expect(result.weakestBranch).toEqual({
        branchId: 'branch-1',
        branchName: 'Branch 1',
        score: 85,
      });
      expect(result.strongestBranch).toEqual({
        branchId: 'branch-1',
        branchName: 'Branch 1',
        score: 85,
      });
    });

    it('should handle single branch with different statuses', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 35, 'Critical'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.overallScore).toBe(35);
      expect(result.overallStatus).toBe('Critical');
      expect(result.branchDistribution).toEqual({
        Healthy: 0,
        Stable: 0,
        'At Risk': 0,
        Critical: 1,
      });
    });
  });

  describe('Equal weights (no revenue metadata)', () => {
    it('should calculate simple average for multiple branches', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 70, 'Stable'),
        createBranchInput('branch-3', 'Branch 3', 60, 'Stable'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.overallScore).toBe(70); // (80 + 70 + 60) / 3 = 70
      expect(result.overallStatus).toBe('Stable');
      expect(result.branchDistribution).toEqual({
        Healthy: 1,
        Stable: 2,
        'At Risk': 0,
        Critical: 0,
      });
    });

    it('should round to integer', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 85.7, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 72.3, 'Stable'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.overallScore).toBe(79); // (85.7 + 72.3) / 2 = 79
      expect(Number.isInteger(result.overallScore)).toBe(true);
    });
  });

  describe('Revenue-weighted calculation', () => {
    it('should weight by revenue share when revenue metadata provided', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 60, 'Stable'),
      ];

      const revenueMetadata = new Map<string, number>([
        ['branch-1', 100000], // 75% of revenue
        ['branch-2', 33333],  // 25% of revenue
      ]);

      const result = calculateGroupHealthScore(branchScores, revenueMetadata);

      // Weighted: 80 * 0.75 + 60 * 0.25 = 60 + 15 = 75
      expect(result.overallScore).toBe(75);
      expect(result.overallStatus).toBe('Stable');
    });

    it('should handle unequal revenue distribution', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 90, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 50, 'At Risk'),
        createBranchInput('branch-3', 'Branch 3', 70, 'Stable'),
      ];

      const revenueMetadata = new Map<string, number>([
        ['branch-1', 50000],  // 50% of revenue
        ['branch-2', 30000],  // 30% of revenue
        ['branch-3', 20000],  // 20% of revenue
      ]);

      const result = calculateGroupHealthScore(branchScores, revenueMetadata);

      // Weighted: 90 * 0.5 + 50 * 0.3 + 70 * 0.2 = 45 + 15 + 14 = 74
      expect(result.overallScore).toBe(74);
      expect(result.overallStatus).toBe('Stable');
    });

    it('should fallback to equal weights if revenue is zero', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 60, 'Stable'),
      ];

      const revenueMetadata = new Map<string, number>([
        ['branch-1', 0],
        ['branch-2', 0],
      ]);

      const result = calculateGroupHealthScore(branchScores, revenueMetadata);

      // Should fallback to equal weights: (80 + 60) / 2 = 70
      expect(result.overallScore).toBe(70);
    });

    it('should fallback to equal weights if branch missing from revenue metadata', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 60, 'Stable'),
      ];

      const revenueMetadata = new Map<string, number>([
        ['branch-1', 100000],
        // branch-2 missing
      ]);

      const result = calculateGroupHealthScore(branchScores, revenueMetadata);

      // Should fallback to equal weights since branch-2 has no revenue
      expect(result.overallScore).toBe(70);
    });
  });

  describe('Extreme underperformer penalty', () => {
    it('should apply -5 penalty if any branch score <40', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 35, 'Critical'), // <40
        createBranchInput('branch-3', 'Branch 3', 70, 'Stable'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      // Average: (80 + 35 + 70) / 3 = 61.67
      // Penalty: -5
      // Final: 61.67 - 5 = 56.67, rounded to 57
      expect(result.overallScore).toBe(57);
      expect(result.overallStatus).toBe('At Risk');
    });

    it('should apply penalty only once even with multiple critical branches', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 30, 'Critical'), // <40
        createBranchInput('branch-2', 'Branch 2', 25, 'Critical'), // <40
        createBranchInput('branch-3', 'Branch 3', 80, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      // Average: (30 + 25 + 80) / 3 = 45
      // Penalty: -5 (only once)
      // Final: 45 - 5 = 40
      expect(result.overallScore).toBe(40);
      expect(result.overallStatus).toBe('At Risk');
    });

    it('should not apply penalty if all branches >=40', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 40, 'At Risk'), // Exactly 40
        createBranchInput('branch-3', 'Branch 3', 70, 'Stable'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      // Average: (80 + 40 + 70) / 3 = 63.33, rounded to 63
      // No penalty since 40 >= 40
      expect(result.overallScore).toBe(63);
      expect(result.overallStatus).toBe('Stable');
    });

    it('should cap penalty at 0 minimum', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 10, 'Critical'), // <40
        createBranchInput('branch-2', 'Branch 2', 5, 'Critical'), // <40
      ];

      const result = calculateGroupHealthScore(branchScores);

      // Average: (10 + 5) / 2 = 7.5
      // Penalty: -5
      // Final: 7.5 - 5 = 2.5, rounded to 3 (capped at 0 minimum, but 2.5 rounds to 3)
      expect(result.overallScore).toBe(3);
      expect(result.overallStatus).toBe('Critical');
    });
  });

  describe('Status thresholds', () => {
    it('should return "Healthy" for scores 80-100', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 85, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 90, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);
      expect(result.overallStatus).toBe('Healthy');
    });

    it('should return "Stable" for scores 60-79', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 70, 'Stable'),
        createBranchInput('branch-2', 'Branch 2', 65, 'Stable'),
      ];

      const result = calculateGroupHealthScore(branchScores);
      expect(result.overallStatus).toBe('Stable');
    });

    it('should return "At Risk" for scores 40-59', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 50, 'At Risk'),
        createBranchInput('branch-2', 'Branch 2', 45, 'At Risk'),
      ];

      const result = calculateGroupHealthScore(branchScores);
      expect(result.overallStatus).toBe('At Risk');
    });

    it('should return "Critical" for scores <40', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 30, 'Critical'),
        createBranchInput('branch-2', 'Branch 2', 25, 'Critical'),
      ];

      const result = calculateGroupHealthScore(branchScores);
      expect(result.overallStatus).toBe('Critical');
    });
  });

  describe('Branch distribution', () => {
    it('should correctly count branches by status', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 85, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 70, 'Stable'),
        createBranchInput('branch-3', 'Branch 3', 50, 'At Risk'),
        createBranchInput('branch-4', 'Branch 4', 30, 'Critical'),
        createBranchInput('branch-5', 'Branch 5', 90, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.branchDistribution).toEqual({
        Healthy: 2,
        Stable: 1,
        'At Risk': 1,
        Critical: 1,
      });
    });

    it('should handle all branches with same status', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 85, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 90, 'Healthy'),
        createBranchInput('branch-3', 'Branch 3', 80, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.branchDistribution).toEqual({
        Healthy: 3,
        Stable: 0,
        'At Risk': 0,
        Critical: 0,
      });
    });
  });

  describe('Weakest and strongest branches', () => {
    it('should identify weakest and strongest branches', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 85, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 50, 'At Risk'),
        createBranchInput('branch-3', 'Branch 3', 70, 'Stable'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.weakestBranch).toEqual({
        branchId: 'branch-2',
        branchName: 'Branch 2',
        score: 50,
      });
      expect(result.strongestBranch).toEqual({
        branchId: 'branch-1',
        branchName: 'Branch 1',
        score: 85,
      });
    });

    it('should handle ties correctly (first occurrence)', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 80, 'Healthy'),
        createBranchInput('branch-3', 'Branch 3', 80, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      // All same score, should pick first as strongest and first as weakest
      expect(result.strongestBranch?.branchId).toBe('branch-1');
      expect(result.weakestBranch?.branchId).toBe('branch-1');
    });

    it('should return null for extremes when no branches', () => {
      const result = calculateGroupHealthScore([]);

      expect(result.weakestBranch).toBeNull();
      expect(result.strongestBranch).toBeNull();
    });
  });

  describe('Deterministic behavior', () => {
    it('should return same result for same inputs', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 60, 'Stable'),
      ];

      const result1 = calculateGroupHealthScore(branchScores);
      const result2 = calculateGroupHealthScore(branchScores);

      expect(result1.overallScore).toBe(result2.overallScore);
      expect(result1.overallStatus).toBe(result2.overallStatus);
      expect(result1.branchDistribution).toEqual(result2.branchDistribution);
    });

    it('should be deterministic with revenue metadata', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 60, 'Stable'),
      ];

      const revenueMetadata = new Map<string, number>([
        ['branch-1', 100000],
        ['branch-2', 50000],
      ]);

      const result1 = calculateGroupHealthScore(branchScores, revenueMetadata);
      const result2 = calculateGroupHealthScore(branchScores, revenueMetadata);

      expect(result1.overallScore).toBe(result2.overallScore);
      expect(result1.overallStatus).toBe(result2.overallStatus);
    });
  });

  describe('Edge cases', () => {
    it('should handle very large number of branches', () => {
      const branchScores: BranchHealthScoreInput[] = Array.from({ length: 100 }, (_, i) =>
        createBranchInput(`branch-${i}`, `Branch ${i}`, 70 + (i % 10), 'Stable')
      );

      const result = calculateGroupHealthScore(branchScores);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.branchDistribution.Stable).toBe(100);
    });

    it('should handle branches with zero revenue in weighted calculation', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 80, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 60, 'Stable'),
      ];

      const revenueMetadata = new Map<string, number>([
        ['branch-1', 100000],
        ['branch-2', 0], // Zero revenue
      ]);

      const result = calculateGroupHealthScore(branchScores, revenueMetadata);

      // Should weight branch-1 at 100%, branch-2 at 0%
      expect(result.overallScore).toBe(80);
    });

    it('should cap score at 100 maximum', () => {
      const branchScores: BranchHealthScoreInput[] = [
        createBranchInput('branch-1', 'Branch 1', 100, 'Healthy'),
        createBranchInput('branch-2', 'Branch 2', 100, 'Healthy'),
      ];

      const result = calculateGroupHealthScore(branchScores);

      expect(result.overallScore).toBe(100);
      expect(result.overallStatus).toBe('Healthy');
    });
  });
});
