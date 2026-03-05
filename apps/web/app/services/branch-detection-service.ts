/**
 * Branch Detection Service
 * 
 * Automatically detects whether a business operates multiple branches
 * by analyzing operational signals for distinct patterns.
 * 
 * Detection signals:
 * - Multiple distinct revenue patterns
 * - Different operating schedules (weekday/weekend behavior)
 * - Different peak revenue ceilings
 * - Revenue pattern clustering
 * 
 * Never auto-creates branches - only suggests them for user confirmation.
 */
'use client';

import { operationalSignalsService, type OperationalSignal } from './operational-signals-service';
import { businessGroupService } from './business-group-service';
import type { Branch } from '../models/business-group';

export interface DetectedBranch {
  temporaryId: string; // Temporary ID for UI purposes
  inferredName: string; // e.g., "สุขุมวิท", "สาทร", "Branch A"
  confidence: number; // 0-1, confidence score
  signalCount: number; // Number of signals in this cluster
  averageRevenue: number; // Average daily revenue
  peakRevenue: number; // Peak revenue ceiling
  weekdayPattern?: {
    average: number;
    variance: number;
  };
  weekendPattern?: {
    average: number;
    variance: number;
  };
  signals: OperationalSignal[]; // Signals belonging to this branch
}

export interface BranchDetectionResult {
  detectedBranches: DetectedBranch[];
  totalSignals: number;
  detectionConfidence: number; // Overall confidence in detection
  shouldSuggest: boolean; // Whether to show suggestion to user
}

export interface PatternChangeSuggestion {
  type: 'split' | 'merge';
  branchId: string;
  branchName: string;
  suggestedBranches?: DetectedBranch[]; // For split suggestions
  suggestedMergeWith?: Array<{ branchId: string; branchName: string }>; // For merge suggestions
  confidence: number;
  reason: string;
}

export interface PatternChangeResult {
  suggestions: PatternChangeSuggestion[];
  hasChanges: boolean;
}

class BranchDetectionService {
  private lastDetectionKey = 'hospitality_branch_detection_last_run';
  private lastPatternCheckKey = 'hospitality_branch_pattern_check_last_run';
  private detectionIntervalDays = 30; // Re-run detection monthly
  private patternCheckIntervalDays = 30; // Re-check patterns monthly
  private confidenceThreshold = 0.65; // Only suggest changes if confidence > 65%

  /**
   * Detect potential branches from operational signals
   * Only analyzes signals without branchId (to avoid double-counting)
   */
  detectBranches(): BranchDetectionResult {
    // Get all signals without branchId (unassigned signals)
    const allSignals = operationalSignalsService.getAllSignals(null);
    const unassignedSignals = allSignals.filter(s => !s.branchId);

    if (unassignedSignals.length < 10) {
      // Not enough data for reliable detection
      return {
        detectedBranches: [],
        totalSignals: unassignedSignals.length,
        detectionConfidence: 0,
        shouldSuggest: false,
      };
    }

    // Cluster signals by revenue patterns
    const clusters = this.clusterSignalsByPattern(unassignedSignals);

    if (clusters.length <= 1) {
      // Single consistent pattern - treat as single branch
      return {
        detectedBranches: [],
        totalSignals: unassignedSignals.length,
        detectionConfidence: 0.8, // High confidence it's a single branch
        shouldSuggest: false,
      };
    }

    // Multiple distinct clusters detected
    const detectedBranches = clusters.map((cluster, index) => {
      const avgDailyRevenue = this.calculateAverageDailyRevenue(cluster);
      const peakRevenue = Math.max(...cluster.map(s => s.revenue7Days / 7));
      
      const weekdayPattern = this.analyzeWeekdayPattern(cluster);
      const weekendPattern = this.analyzeWeekendPattern(cluster);

      // Calculate confidence based on cluster size and pattern distinctness
      const clusterSizeConfidence = Math.min(1, cluster.length / 20); // More signals = higher confidence
      const patternDistinctness = this.calculatePatternDistinctness(cluster, clusters);
      const confidence = (clusterSizeConfidence * 0.6 + patternDistinctness * 0.4);

      // Generate inferred name
      const inferredName = this.generateBranchName(index, avgDailyRevenue, weekdayPattern, weekendPattern);

      return {
        temporaryId: `detected_${index}_${Date.now()}`,
        inferredName,
        confidence: Math.round(confidence * 100) / 100,
        signalCount: cluster.length,
        averageRevenue: avgDailyRevenue,
        peakRevenue,
        weekdayPattern,
        weekendPattern,
        signals: cluster,
      };
    });

    // Calculate overall detection confidence
    const overallConfidence = this.calculateOverallConfidence(detectedBranches, unassignedSignals.length);

    return {
      detectedBranches,
      totalSignals: unassignedSignals.length,
      detectionConfidence: overallConfidence,
      shouldSuggest: overallConfidence >= 0.5 && detectedBranches.length >= 2, // Only suggest if confidence >= 50% and at least 2 branches
    };
  }

  /**
   * Cluster signals by revenue patterns using k-means-like clustering
   */
  private clusterSignalsByPattern(signals: OperationalSignal[]): OperationalSignal[][] {
    if (signals.length === 0) return [];

    // Calculate daily revenue for each signal
    const signalsWithDailyRevenue = signals.map(s => ({
      signal: s,
      dailyRevenue: s.revenue7Days / 7,
      revenue30: s.revenue30Days / 30,
    }));

    // Try to detect 2-4 clusters
    const maxClusters = Math.min(4, Math.floor(signals.length / 10));
    if (maxClusters < 2) {
      // Not enough data for multiple clusters
      return [signals];
    }

    // Use revenue-based clustering
    // Sort by daily revenue to identify natural breaks
    signalsWithDailyRevenue.sort((a, b) => a.dailyRevenue - b.dailyRevenue);

    // Find natural breaks in revenue distribution
    const clusters: OperationalSignal[][] = [];
    const clusterThreshold = this.findClusterThresholds(signalsWithDailyRevenue.map(s => s.dailyRevenue));

    let currentCluster: OperationalSignal[] = [];
    let currentClusterIndex = 0;

    for (const item of signalsWithDailyRevenue) {
      const revenue = item.dailyRevenue;
      const threshold = clusterThreshold[currentClusterIndex];

      if (currentCluster.length === 0 || revenue <= threshold) {
        // Add to current cluster
        currentCluster.push(item.signal);
      } else {
        // Start new cluster
        if (currentCluster.length > 0) {
          clusters.push(currentCluster);
        }
        currentCluster = [item.signal];
        currentClusterIndex = Math.min(currentClusterIndex + 1, clusterThreshold.length - 1);
      }
    }

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Filter out clusters that are too small (< 5% of total signals)
    const minClusterSize = Math.max(3, Math.floor(signals.length * 0.05));
    const filteredClusters = clusters.filter(c => c.length >= minClusterSize);

    // If filtering removed too many clusters, return original clusters
    if (filteredClusters.length < 2) {
      return clusters.length >= 2 ? clusters : [signals];
    }

    return filteredClusters;
  }

  /**
   * Find natural thresholds for clustering using statistical analysis
   */
  private findClusterThresholds(revenues: number[]): number[] {
    if (revenues.length < 10) return [];

    // Calculate percentiles to find natural breaks
    const sorted = [...revenues].sort((a, b) => a - b);
    const percentiles = [0.33, 0.66]; // Try 2 thresholds for 3 clusters

    return percentiles.map(p => {
      const index = Math.floor(sorted.length * p);
      return sorted[index];
    });
  }

  /**
   * Calculate average daily revenue for a cluster
   */
  private calculateAverageDailyRevenue(signals: OperationalSignal[]): number {
    if (signals.length === 0) return 0;
    const total = signals.reduce((sum, s) => sum + (s.revenue7Days / 7), 0);
    return total / signals.length;
  }

  /**
   * Analyze weekday pattern (Monday-Friday)
   */
  private analyzeWeekdayPattern(signals: OperationalSignal[]): { average: number; variance: number } | undefined {
    const weekdaySignals = signals.filter(s => {
      const day = new Date(s.timestamp).getDay();
      return day >= 1 && day <= 5; // Monday-Friday
    });

    if (weekdaySignals.length < 3) return undefined;

    const dailyRevenues = weekdaySignals.map(s => s.revenue7Days / 7);
    const average = dailyRevenues.reduce((sum, r) => sum + r, 0) / dailyRevenues.length;
    const variance = this.calculateVariance(dailyRevenues, average);

    return { average, variance };
  }

  /**
   * Analyze weekend pattern (Saturday-Sunday)
   */
  private analyzeWeekendPattern(signals: OperationalSignal[]): { average: number; variance: number } | undefined {
    const weekendSignals = signals.filter(s => {
      const day = new Date(s.timestamp).getDay();
      return day === 0 || day === 6; // Saturday-Sunday
    });

    if (weekendSignals.length < 2) return undefined;

    const dailyRevenues = weekendSignals.map(s => s.revenue7Days / 7);
    const average = dailyRevenues.reduce((sum, r) => sum + r, 0) / dailyRevenues.length;
    const variance = this.calculateVariance(dailyRevenues, average);

    return { average, variance };
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  }

  /**
   * Calculate how distinct this cluster's pattern is from others
   */
  private calculatePatternDistinctness(
    cluster: OperationalSignal[],
    allClusters: OperationalSignal[][]
  ): number {
    if (allClusters.length <= 1) return 0;

    const clusterAvg = this.calculateAverageDailyRevenue(cluster);
    const otherClusters = allClusters.filter(c => c !== cluster);

    if (otherClusters.length === 0) return 0;

    // Calculate average revenue of other clusters
    const otherAvgs = otherClusters.map(c => this.calculateAverageDailyRevenue(c));
    const avgOtherAvg = otherAvgs.reduce((sum, a) => sum + a, 0) / otherAvgs.length;

    // Distinctness = how different this cluster is from others
    const difference = Math.abs(clusterAvg - avgOtherAvg);
    const maxRevenue = Math.max(clusterAvg, ...otherAvgs);
    
    if (maxRevenue === 0) return 0;
    
    // Normalize to 0-1 scale
    return Math.min(1, difference / maxRevenue);
  }

  /**
   * Calculate overall confidence in detection
   */
  private calculateOverallConfidence(
    detectedBranches: DetectedBranch[],
    totalSignals: number
  ): number {
    if (detectedBranches.length < 2) return 0;

    // Average confidence of detected branches
    const avgBranchConfidence = detectedBranches.reduce((sum, b) => sum + b.confidence, 0) / detectedBranches.length;

    // Data sufficiency (more signals = higher confidence)
    const dataSufficiency = Math.min(1, totalSignals / 30);

    // Pattern clarity (how distinct branches are from each other)
    const patternClarity = this.calculatePatternClarity(detectedBranches);

    // Weighted average
    return (avgBranchConfidence * 0.4 + dataSufficiency * 0.3 + patternClarity * 0.3);
  }

  /**
   * Calculate pattern clarity across all detected branches
   */
  private calculatePatternClarity(branches: DetectedBranch[]): number {
    if (branches.length < 2) return 0;

    // Calculate average distinctness between all pairs
    let totalDistinctness = 0;
    let pairCount = 0;

    for (let i = 0; i < branches.length; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const diff = Math.abs(branches[i].averageRevenue - branches[j].averageRevenue);
        const maxRev = Math.max(branches[i].averageRevenue, branches[j].averageRevenue);
        if (maxRev > 0) {
          totalDistinctness += diff / maxRev;
          pairCount++;
        }
      }
    }

    return pairCount > 0 ? totalDistinctness / pairCount : 0;
  }

  /**
   * Generate inferred branch name
   */
  private generateBranchName(
    index: number,
    averageRevenue: number,
    weekdayPattern?: { average: number; variance: number },
    weekendPattern?: { average: number; variance: number }
  ): string {
    // Thai location names based on revenue patterns
    const thaiLocations = ['สุขุมวิท', 'สาทร', 'สีลม', 'อโศก', 'รัชดาภิเษก', 'ลาดพร้าว', 'บางนา', 'เชียงใหม่'];
    
    // If we have enough data, use location names
    if (index < thaiLocations.length) {
      return thaiLocations[index];
    }

    // Otherwise use generic names
    const genericNames = ['Branch A', 'Branch B', 'Branch C', 'Branch D'];
    if (index < genericNames.length) {
      return genericNames[index];
    }

    return `Branch ${String.fromCharCode(65 + index)}`; // A, B, C, etc.
  }

  /**
   * Check if detection should run (monthly interval)
   */
  shouldRunDetection(): boolean {
    if (typeof window === 'undefined') return false;

    const lastRun = localStorage.getItem(this.lastDetectionKey);
    if (!lastRun) return true; // Never run before

    const lastRunDate = new Date(lastRun);
    const now = new Date();
    const daysSinceLastRun = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceLastRun >= this.detectionIntervalDays;
  }

  /**
   * Mark detection as run
   */
  markDetectionRun(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.lastDetectionKey, new Date().toISOString());
  }

  /**
   * Check if user has dismissed branch detection
   */
  hasUserDismissed(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('hospitality_branch_detection_dismissed') === 'true';
  }

  /**
   * Mark detection as dismissed by user
   */
  markDismissed(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('hospitality_branch_detection_dismissed', 'true');
  }

  /**
   * Clear dismissal (for testing or re-prompting)
   */
  clearDismissal(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('hospitality_branch_detection_dismissed');
  }

  /**
   * Check for pattern changes in existing branches
   * Suggests splits or merges but never auto-modifies confirmed branches
   */
  checkPatternChanges(): PatternChangeResult {
    const existingBranches = businessGroupService.getAllBranches();
    
    if (existingBranches.length === 0) {
      return { suggestions: [], hasChanges: false };
    }

    const suggestions: PatternChangeSuggestion[] = [];

    // Analyze each existing branch for pattern changes
    for (const branch of existingBranches) {
      // Get signals for this branch
      const branchSignals = operationalSignalsService.getAllSignals(branch.id);
      
      if (branchSignals.length < 15) {
        // Not enough data to detect pattern changes
        continue;
      }

      // Check if branch signals show multiple distinct patterns (suggest split)
      const splitSuggestion = this.detectSplitPattern(branch, branchSignals);
      if (splitSuggestion && splitSuggestion.confidence > this.confidenceThreshold) {
        suggestions.push(splitSuggestion);
      }

      // Check if branch should be merged with others (suggest merge)
      const mergeSuggestion = this.detectMergePattern(branch, existingBranches, branchSignals);
      if (mergeSuggestion && mergeSuggestion.confidence > this.confidenceThreshold) {
        suggestions.push(mergeSuggestion);
      }
    }

    return {
      suggestions,
      hasChanges: suggestions.length > 0,
    };
  }

  /**
   * Detect if a branch's signals suggest it should be split into multiple branches
   */
  private detectSplitPattern(branch: Branch, signals: OperationalSignal[]): PatternChangeSuggestion | null {
    // Cluster signals within this branch
    const clusters = this.clusterSignalsByPattern(signals);

    if (clusters.length < 2) {
      // Single pattern - no split needed
      return null;
    }

    // Check if clusters are distinct enough
    const distinctness = this.calculateClustersDistinctness(clusters);
    if (distinctness < 0.3) {
      // Clusters are too similar
      return null;
    }

    // Create detected branches from clusters
    const detectedBranches: DetectedBranch[] = clusters.map((cluster, index) => {
      const avgDailyRevenue = this.calculateAverageDailyRevenue(cluster);
      const peakRevenue = Math.max(...cluster.map(s => s.revenue7Days / 7));
      const weekdayPattern = this.analyzeWeekdayPattern(cluster);
      const weekendPattern = this.analyzeWeekendPattern(cluster);
      const clusterSizeConfidence = Math.min(1, cluster.length / 20);
      const patternDistinctness = this.calculatePatternDistinctness(cluster, clusters);
      const confidence = (clusterSizeConfidence * 0.6 + patternDistinctness * 0.4);

      return {
        temporaryId: `split_${branch.id}_${index}_${Date.now()}`,
        inferredName: `${branch.branchName} ${index + 1}`,
        confidence: Math.round(confidence * 100) / 100,
        signalCount: cluster.length,
        averageRevenue: avgDailyRevenue,
        peakRevenue,
        weekdayPattern,
        weekendPattern,
        signals: cluster,
      };
    });

    const overallConfidence = this.calculateOverallConfidence(detectedBranches, signals.length);

    if (overallConfidence <= this.confidenceThreshold) {
      return null;
    }

    return {
      type: 'split',
      branchId: branch.id,
      branchName: branch.branchName,
      suggestedBranches: detectedBranches,
      confidence: overallConfidence,
      reason: `This branch shows ${detectedBranches.length} distinct revenue patterns that may represent separate locations.`,
    };
  }

  /**
   * Detect if a branch should be merged with another branch
   */
  private detectMergePattern(
    branch: Branch,
    allBranches: Branch[],
    branchSignals: OperationalSignal[]
  ): PatternChangeSuggestion | null {
    if (branchSignals.length < 10) {
      return null;
    }

    const branchAvgRevenue = this.calculateAverageDailyRevenue(branchSignals);
    const branchWeekdayPattern = this.analyzeWeekdayPattern(branchSignals);
    const branchWeekendPattern = this.analyzeWeekendPattern(branchSignals);

    const mergeCandidates: Array<{ branch: Branch; confidence: number }> = [];

    // Compare with other branches
    for (const otherBranch of allBranches) {
      if (otherBranch.id === branch.id) continue;

      const otherSignals = operationalSignalsService.getAllSignals(otherBranch.id);
      if (otherSignals.length < 10) continue;

      const otherAvgRevenue = this.calculateAverageDailyRevenue(otherSignals);
      const otherWeekdayPattern = this.analyzeWeekdayPattern(otherSignals);
      const otherWeekendPattern = this.analyzeWeekendPattern(otherSignals);

      // Calculate similarity
      const revenueSimilarity = this.calculateRevenueSimilarity(branchAvgRevenue, otherAvgRevenue);
      const patternSimilarity = this.calculatePatternSimilarity(
        branchWeekdayPattern,
        branchWeekendPattern,
        otherWeekdayPattern,
        otherWeekendPattern
      );

      // High similarity suggests merge
      const overallSimilarity = (revenueSimilarity * 0.6 + patternSimilarity * 0.4);
      
      if (overallSimilarity > 0.85) {
        mergeCandidates.push({
          branch: otherBranch,
          confidence: overallSimilarity,
        });
      }
    }

    if (mergeCandidates.length === 0) {
      return null;
    }

    // Sort by confidence and take top candidates
    mergeCandidates.sort((a, b) => b.confidence - a.confidence);
    const topCandidates = mergeCandidates.slice(0, 2);

    return {
      type: 'merge',
      branchId: branch.id,
      branchName: branch.branchName,
      suggestedMergeWith: topCandidates.map(c => ({
        branchId: c.branch.id,
        branchName: c.branch.branchName,
      })),
      confidence: topCandidates[0].confidence,
      reason: `This branch shows very similar patterns to ${topCandidates.map(c => c.branch.branchName).join(' and ')}. They may be the same location.`,
    };
  }

  /**
   * Calculate distinctness between clusters
   */
  private calculateClustersDistinctness(clusters: OperationalSignal[][]): number {
    if (clusters.length < 2) return 0;

    const clusterAvgs = clusters.map(c => this.calculateAverageDailyRevenue(c));
    const maxAvg = Math.max(...clusterAvgs);
    const minAvg = Math.min(...clusterAvgs);

    if (maxAvg === 0) return 0;
    return (maxAvg - minAvg) / maxAvg;
  }

  /**
   * Calculate revenue similarity between two branches
   */
  private calculateRevenueSimilarity(revenue1: number, revenue2: number): number {
    if (revenue1 === 0 && revenue2 === 0) return 1;
    const maxRev = Math.max(Math.abs(revenue1), Math.abs(revenue2));
    if (maxRev === 0) return 0;
    const diff = Math.abs(revenue1 - revenue2);
    return 1 - Math.min(1, diff / maxRev);
  }

  /**
   * Calculate pattern similarity between two branches
   */
  private calculatePatternSimilarity(
    weekday1?: { average: number; variance: number },
    weekend1?: { average: number; variance: number },
    weekday2?: { average: number; variance: number },
    weekend2?: { average: number; variance: number }
  ): number {
    let similaritySum = 0;
    let count = 0;

    if (weekday1 && weekday2) {
      similaritySum += this.calculateRevenueSimilarity(weekday1.average, weekday2.average);
      count++;
    }

    if (weekend1 && weekend2) {
      similaritySum += this.calculateRevenueSimilarity(weekend1.average, weekend2.average);
      count++;
    }

    return count > 0 ? similaritySum / count : 0.5; // Default to neutral if no patterns
  }

  /**
   * Check if pattern check should run (monthly interval)
   */
  shouldRunPatternCheck(): boolean {
    if (typeof window === 'undefined') return false;

    const lastCheck = localStorage.getItem(this.lastPatternCheckKey);
    if (!lastCheck) return true; // Never checked before

    const lastCheckDate = new Date(lastCheck);
    const now = new Date();
    const daysSinceLastCheck = (now.getTime() - lastCheckDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceLastCheck >= this.patternCheckIntervalDays;
  }

  /**
   * Mark pattern check as run
   */
  markPatternCheckRun(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.lastPatternCheckKey, new Date().toISOString());
  }

  /**
   * Check if user has dismissed pattern change notifications
   */
  hasDismissedPatternChanges(branchId: string): boolean {
    if (typeof window === 'undefined') return false;
    const dismissed = localStorage.getItem(`hospitality_pattern_change_dismissed_${branchId}`);
    return dismissed === 'true';
  }

  /**
   * Mark pattern change as dismissed for a branch
   */
  dismissPatternChange(branchId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`hospitality_pattern_change_dismissed_${branchId}`, 'true');
  }
}

export const branchDetectionService = new BranchDetectionService();
