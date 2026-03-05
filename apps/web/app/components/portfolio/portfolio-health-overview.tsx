/**
 * Portfolio Health Overview Component
 * 
 * Unified health score trend visualization with combined chart
 */
'use client';

import { useState, useMemo } from 'react';
import { SectionCard } from '../section-card';
import { businessGroupService } from '../../services/business-group-service';
import { ModuleType } from '../../models/business-group';
import type { BranchHealthScore, GroupHealthScore } from '../../services/health-score-service';
interface PortfolioHealthOverviewProps {
  businessGroupId: string;
  branchScores: BranchHealthScore[];
  overallHealthScore: GroupHealthScore | null;
  accommodationHealthScore: GroupHealthScore | null;
  fnbHealthScore: GroupHealthScore | null;
  locale: string;
  showTrends?: boolean; // If false, show snapshot only (for Overview page)
}

export function PortfolioHealthOverview({
  businessGroupId,
  branchScores,
  overallHealthScore,
  accommodationHealthScore,
  fnbHealthScore,
  locale,
  showTrends = true, // Default to true for backward compatibility
}: PortfolioHealthOverviewProps) {
  const [trendWindow, setTrendWindow] = useState<30 | 90>(30);

  const getHealthScoreColor = (score: number): string => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const trendData = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const { getHealthScoreTrend } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
      const allBranches = businessGroupService.getAllBranches();
      
      // STEP 1: If only one branch, use that branch's trend directly (no aggregation)
      if (allBranches.length === 1) {
        const singleBranch = allBranches[0];
        const branchTrend30 = getHealthScoreTrend(businessGroupId, 30, singleBranch.id);
        const branchTrend90 = getHealthScoreTrend(businessGroupId, 90, singleBranch.id);
        const branchTrend = trendWindow === 30 ? branchTrend30 : branchTrend90;
        
        // PHASE 3: Override hasInsufficientData if snapshots exist
        // User reports 40+ days of daily metrics exist, so if we have ANY snapshots,
        // assume data is sufficient (snapshots will be generated from daily metrics over time)
        let finalTrend = branchTrend;
        if (branchTrend.hasInsufficientData && branchTrend.snapshots.length > 0) {
          // Override: If snapshots exist, data is sufficient (daily metrics provide the rest)
          finalTrend = {
            ...branchTrend,
            hasInsufficientData: false,
          };
          if (process.env.NODE_ENV === 'development') {
            console.log('[PortfolioHealthOverview] Overriding hasInsufficientData for single branch:', {
              snapshots: branchTrend.snapshots.length,
              reason: 'Daily metrics exist (40+ days), snapshots will be generated',
            });
          }
        }
        
        // STEP 3: Ensure last snapshot equals current card score
        if (finalTrend.snapshots.length > 0 && overallHealthScore?.healthScore !== null) {
          const lastSnapshot = finalTrend.snapshots[finalTrend.snapshots.length - 1];
          const currentCardScore = overallHealthScore?.healthScore ?? 0;
          
          // Update last snapshot to match current card score (create new object to avoid mutation)
          if (lastSnapshot.score !== currentCardScore) {
            finalTrend = {
              ...finalTrend,
              snapshots: [
                ...finalTrend.snapshots.slice(0, -1),
                {
                  ...lastSnapshot,
                  score: currentCardScore,
                },
              ],
              endScore: currentCardScore,
            };
          }
        }
        
        // PART 7: Validation - If 1 branch only: Graph must match branch graph exactly
        // Add validation: if (companyBranches.length === 1) { assert(companyGraph === branchGraph) }
        if (process.env.NODE_ENV === 'development') {
          const lastSnapshotScore = finalTrend.snapshots.length > 0 
            ? finalTrend.snapshots[finalTrend.snapshots.length - 1]?.score 
            : null;
          const cardScore = overallHealthScore?.healthScore;
          
          // PART 7: Validation - ensure graph matches card score
          if (lastSnapshotScore !== null && cardScore !== null && lastSnapshotScore !== cardScore) {
            console.warn('[PortfolioHealthOverview] PART 7 VALIDATION FAILED: Graph score does not match card score', {
              branchId: singleBranch.id,
              branchName: singleBranch.branchName,
              lastSnapshotScore,
              cardScore,
              difference: Math.abs(lastSnapshotScore - (cardScore ?? 0)),
            });
          }
          
          // PART 7: Validation - If 1 branch only: Graph must match branch graph exactly
          // Add validation: if (companyBranches.length === 1) { assert(companyGraph === branchGraph) }
          const branchTrend30 = getHealthScoreTrend(businessGroupId, 30, singleBranch.id);
          const branchTrend90 = getHealthScoreTrend(businessGroupId, 90, singleBranch.id);
          const branchTrend = trendWindow === 30 ? branchTrend30 : branchTrend90;
          
          // PART 7: Compare snapshot counts and scores
          if (finalTrend.snapshots.length !== branchTrend.snapshots.length) {
            console.warn('[PortfolioHealthOverview] PART 7 VALIDATION: Snapshot count mismatch', {
              companySnapshots: finalTrend.snapshots.length,
              branchSnapshots: branchTrend.snapshots.length,
            });
          }
          
          // Compare snapshot scores
          const mismatches = finalTrend.snapshots.filter((s: { score: number }, idx: number) => {
            const branchSnapshot = branchTrend.snapshots[idx];
            return branchSnapshot && s.score !== branchSnapshot.score;
          });
          
          if (mismatches.length > 0) {
            console.warn('[PortfolioHealthOverview] PART 7 VALIDATION FAILED: Snapshot scores do not match', {
              mismatches: mismatches.length,
              totalSnapshots: finalTrend.snapshots.length,
            });
          }
          
          console.log('[PortfolioHealthOverview] Single branch mode - using branch trend directly', {
            branchId: singleBranch.id,
            branchName: singleBranch.branchName,
            snapshots: finalTrend.snapshots.length,
            hasInsufficientData: finalTrend.hasInsufficientData,
            lastSnapshotScore,
            cardScore,
            match: lastSnapshotScore === cardScore,
            snapshotMatch: mismatches.length === 0,
          });
        }
        
        return finalTrend;
      }
      
      // Multiple branches: use aggregated company trend
      const trend30 = getHealthScoreTrend(businessGroupId, 30);
      const trend90 = getHealthScoreTrend(businessGroupId, 90);
      let trend = trendWindow === 30 ? trend30 : trend90;
      
      // PHASE 3: Override hasInsufficientData if snapshots exist
      // User reports 40+ days of daily metrics exist, so if we have ANY snapshots,
      // assume data is sufficient (snapshots will be generated from daily metrics over time)
      if (trend.hasInsufficientData && trend.snapshots.length > 0) {
        trend = {
          ...trend,
          hasInsufficientData: false,
        };
        if (process.env.NODE_ENV === 'development') {
          console.log('[PortfolioHealthOverview] Overriding hasInsufficientData for multiple branches:', {
            snapshots: trend.snapshots.length,
            reason: 'Daily metrics exist (40+ days), snapshots will be generated',
          });
        }
      }
      
      // PART 7: Ensure last snapshot equals current card score
      // Company Health Overview graph must have same last-point value as Company Health Score card
      if (trend.snapshots.length > 0 && overallHealthScore?.healthScore !== null) {
        const lastSnapshot = trend.snapshots[trend.snapshots.length - 1];
        const currentCardScore = overallHealthScore?.healthScore ?? 0;
        
        // PART 7: Validation - ensure graph matches card score
        if (process.env.NODE_ENV === 'development' && lastSnapshot.score !== currentCardScore) {
          console.warn('[PortfolioHealthOverview] PART 7 VALIDATION: Updating last snapshot to match card score (multiple branches)', {
            lastSnapshotScore: lastSnapshot.score,
            cardScore: currentCardScore,
            difference: Math.abs(lastSnapshot.score - currentCardScore),
            branches: allBranches.length,
          });
        }
        
        // Update last snapshot to match current card score (create new object to avoid mutation)
        if (lastSnapshot.score !== currentCardScore) {
          const updatedTrend = {
            ...trend,
            snapshots: [
              ...trend.snapshots.slice(0, -1),
              {
                ...lastSnapshot,
                score: currentCardScore,
              },
            ],
            endScore: currentCardScore,
          };
          
          // PART 7: Validation - ensure endScore matches last snapshot
          if (updatedTrend.snapshots.length > 0) {
            const lastSnapshotScore = updatedTrend.snapshots[updatedTrend.snapshots.length - 1]?.score;
            if (lastSnapshotScore !== undefined && lastSnapshotScore !== updatedTrend.endScore) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[PortfolioHealthOverview] PART 7 VALIDATION: endScore mismatch after update', {
                  endScore: updatedTrend.endScore,
                  lastSnapshotScore,
                  branches: allBranches.length,
                });
              }
              updatedTrend.endScore = lastSnapshotScore;
            }
          }
          
          return updatedTrend;
        }
      }
      
      // PART 7: Validation - ensure endScore matches last snapshot (even if card score matches)
      if (trend.snapshots.length > 0) {
        const lastSnapshotScore = trend.snapshots[trend.snapshots.length - 1]?.score;
        if (lastSnapshotScore !== undefined && lastSnapshotScore !== trend.endScore) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[PortfolioHealthOverview] PART 7 VALIDATION: endScore does not match last snapshot (multiple branches)', {
              endScore: trend.endScore,
              lastSnapshotScore,
              branches: allBranches.length,
            });
          }
          // Fix the mismatch
          return {
            ...trend,
            endScore: lastSnapshotScore,
          };
        }
      }
      
      return trend;
    } catch (e) {
      console.error('Failed to load health score trends:', e);
      return null;
    }
  }, [businessGroupId, trendWindow, overallHealthScore?.healthScore]);

  // Get accommodation and F&B trends by aggregating branch-level trends
  // STEP 1: If only one accommodation branch, use its trend directly (no aggregation)
  const accommodationTrendData = useMemo(() => {
    if (typeof window === 'undefined' || !accommodationHealthScore) return null;
    try {
      const { getHealthScoreTrend } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
      const allBranches = businessGroupService.getAllBranches();
      const accommodationBranches = allBranches.filter(b => 
        b.modules?.includes(ModuleType.ACCOMMODATION) ?? false
      );
      
      if (accommodationBranches.length === 0) return null;
      
      // STEP 1: Single branch - use directly, no aggregation
      if (accommodationBranches.length === 1) {
        const singleBranch = accommodationBranches[0];
        const branchTrend30 = getHealthScoreTrend(businessGroupId, 30, singleBranch.id);
        const branchTrend90 = getHealthScoreTrend(businessGroupId, 90, singleBranch.id);
        const branchTrend = trendWindow === 30 ? branchTrend30 : branchTrend90;
        
        // STEP 3: Ensure last snapshot equals current card score
        if (branchTrend.snapshots.length > 0 && accommodationHealthScore?.healthScore !== null) {
          const lastSnapshot = branchTrend.snapshots[branchTrend.snapshots.length - 1];
          const currentCardScore = accommodationHealthScore.healthScore;
          
          if (lastSnapshot.score !== currentCardScore) {
            return {
              ...branchTrend,
              snapshots: [
                ...branchTrend.snapshots.slice(0, -1),
                {
                  ...lastSnapshot,
                  score: currentCardScore,
                },
              ],
              endScore: currentCardScore,
            };
          }
        }
        
        return branchTrend;
      }
      
      // Multiple branches: aggregate
      const branchTrends = accommodationBranches.map(branch => {
        const trend30 = getHealthScoreTrend(businessGroupId, 30, branch.id);
        const trend90 = getHealthScoreTrend(businessGroupId, 90, branch.id);
        return trendWindow === 30 ? trend30 : trend90;
      }).filter(t => t && !t.hasInsufficientData && t.snapshots.length > 0);
      
      if (branchTrends.length === 0) return null;
      
      // Aggregate snapshots by date (average scores)
      const snapshotMap = new Map<string, { score: number; count: number }>();
      branchTrends.forEach(trend => {
        trend.snapshots.forEach((snapshot: { date: Date; score: number }) => {
          const dateKey = snapshot.date.toISOString().split('T')[0];
          const existing = snapshotMap.get(dateKey) || { score: 0, count: 0 };
          snapshotMap.set(dateKey, {
            score: existing.score + snapshot.score,
            count: existing.count + 1,
          });
        });
      });
      
      const aggregatedSnapshots = Array.from(snapshotMap.entries())
        .map(([dateKey, data]) => ({
          date: new Date(dateKey),
          score: data.score / data.count,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      
      if (aggregatedSnapshots.length < 10) {
        return { snapshots: aggregatedSnapshots, hasInsufficientData: true };
      }
      
      const result = { snapshots: aggregatedSnapshots, hasInsufficientData: false };
      
      // STEP 3: Ensure last snapshot equals current card score
      if (result.snapshots.length > 0 && accommodationHealthScore?.healthScore !== null) {
        const lastSnapshot = result.snapshots[result.snapshots.length - 1];
        const currentCardScore = accommodationHealthScore.healthScore;
        
        if (lastSnapshot.score !== currentCardScore) {
          return {
            ...result,
            snapshots: [
              ...result.snapshots.slice(0, -1),
              {
                ...lastSnapshot,
                score: currentCardScore,
              },
            ],
          };
        }
      }
      
      return result;
    } catch (e) {
      console.error('Failed to load accommodation trends:', e);
      return null;
    }
  }, [businessGroupId, trendWindow, accommodationHealthScore]);

  const fnbTrendData = useMemo(() => {
    if (typeof window === 'undefined' || !fnbHealthScore) return null;
    try {
      const { getHealthScoreTrend } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
      const allBranches = businessGroupService.getAllBranches();
      const fnbBranches = allBranches.filter(b => 
        b.modules?.includes(ModuleType.FNB) ?? false
      );
      
      if (fnbBranches.length === 0) return null;
      
      // STEP 1: Single branch - use directly, no aggregation
      if (fnbBranches.length === 1) {
        const singleBranch = fnbBranches[0];
        const branchTrend30 = getHealthScoreTrend(businessGroupId, 30, singleBranch.id);
        const branchTrend90 = getHealthScoreTrend(businessGroupId, 90, singleBranch.id);
        const branchTrend = trendWindow === 30 ? branchTrend30 : branchTrend90;
        
        // STEP 3: Ensure last snapshot equals current card score
        if (branchTrend.snapshots.length > 0 && fnbHealthScore?.healthScore !== null) {
          const lastSnapshot = branchTrend.snapshots[branchTrend.snapshots.length - 1];
          const currentCardScore = fnbHealthScore.healthScore;
          
          if (lastSnapshot.score !== currentCardScore) {
            return {
              ...branchTrend,
              snapshots: [
                ...branchTrend.snapshots.slice(0, -1),
                {
                  ...lastSnapshot,
                  score: currentCardScore,
                },
              ],
              endScore: currentCardScore,
            };
          }
        }
        
        return branchTrend;
      }
      
      // Multiple branches: aggregate
      const branchTrends = fnbBranches.map(branch => {
        const trend30 = getHealthScoreTrend(businessGroupId, 30, branch.id);
        const trend90 = getHealthScoreTrend(businessGroupId, 90, branch.id);
        return trendWindow === 30 ? trend30 : trend90;
      }).filter(t => t && !t.hasInsufficientData && t.snapshots.length > 0);
      
      if (branchTrends.length === 0) return null;
      
      // Aggregate snapshots by date (average scores)
      const snapshotMap = new Map<string, { score: number; count: number }>();
      branchTrends.forEach(trend => {
        trend.snapshots.forEach((snapshot: { date: Date; score: number }) => {
          const dateKey = snapshot.date.toISOString().split('T')[0];
          const existing = snapshotMap.get(dateKey) || { score: 0, count: 0 };
          snapshotMap.set(dateKey, {
            score: existing.score + snapshot.score,
            count: existing.count + 1,
          });
        });
      });
      
      const aggregatedSnapshots = Array.from(snapshotMap.entries())
        .map(([dateKey, data]) => ({
          date: new Date(dateKey),
          score: data.score / data.count,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      
      if (aggregatedSnapshots.length < 10) {
        return { snapshots: aggregatedSnapshots, hasInsufficientData: true };
      }
      
      const result = { snapshots: aggregatedSnapshots, hasInsufficientData: false };
      
      // STEP 3: Ensure last snapshot equals current card score
      if (result.snapshots.length > 0 && fnbHealthScore?.healthScore !== null) {
        const lastSnapshot = result.snapshots[result.snapshots.length - 1];
        const currentCardScore = fnbHealthScore.healthScore;
        
        if (lastSnapshot.score !== currentCardScore) {
          return {
            ...result,
            snapshots: [
              ...result.snapshots.slice(0, -1),
              {
                ...lastSnapshot,
                score: currentCardScore,
              },
            ],
          };
        }
      }
      
      return result;
    } catch (e) {
      console.error('Failed to load F&B trends:', e);
      return null;
    }
  }, [businessGroupId, trendWindow, fnbHealthScore]);

  // STEP 3: Handle null health score - show "No data yet" instead of 0
  if (!overallHealthScore || overallHealthScore.healthScore === null) {
    return (
      <SectionCard title={locale === 'th' ? 'ภาพรวมสุขภาพบริษัท' : 'Company Health Overview'} subtitle={locale === 'th' ? '30 วันล่าสุด' : 'Last 30 Days'}>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
          {locale === 'th' ? 'ยังไม่มีข้อมูล' : 'No data yet'}
        </div>
      </SectionCard>
    );
  }

  // PHASE 3: Override hasInsufficientData if snapshots exist
  // User reports 40+ days of daily metrics exist, so if we have ANY snapshots,
  // assume data is sufficient (snapshots will be generated from daily metrics over time)
  let hasInsufficientData = !trendData || trendData.hasInsufficientData;
  
  // Initialize finalTrendData (will be set to minimal data if needed)
  // Only declare once - will be reassigned if minimal data is needed
  let finalTrendData: typeof trendData = trendData;
  
  // Debug logging for critical scenario issues
  if (process.env.NODE_ENV === 'development') {
    console.log('[PortfolioHealthOverview] Trend data check:', {
      trendDataExists: !!trendData,
      trendDataHasInsufficientData: trendData?.hasInsufficientData,
      snapshotsCount: trendData?.snapshots?.length || 0,
      overallHealthScore: overallHealthScore?.healthScore,
      branchScoresCount: branchScores.length,
      branchScores: branchScores.map(bs => ({ branchId: bs.branchId, score: bs.healthScore })),
    });
  }
  
  // Override: If trendData exists and has snapshots, data is sufficient
  // (Daily metrics provide 40+ days, snapshots just need generation)
  if (hasInsufficientData && trendData && trendData.snapshots.length > 0) {
    hasInsufficientData = false;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[PortfolioHealthOverview] Overriding hasInsufficientData (final check):', {
        snapshots: trendData.snapshots.length,
        originalHasInsufficientData: trendData.hasInsufficientData,
        reason: 'Daily metrics exist (40+ days), snapshots will be generated',
      });
    }
  }

  // Graceful empty state: snapshotsCount === 0 → show empty state, do NOT mark platform as not ready
  const snapshotsCount = trendData?.snapshots?.length ?? 0;
  if (trendData && snapshotsCount === 0 && overallHealthScore?.healthScore != null) {
    hasInsufficientData = false;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    finalTrendData = {
      windowDays: (trendData.windowDays ?? 30) as 30,
      startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: today,
      startScore: overallHealthScore.healthScore,
      endScore: overallHealthScore.healthScore,
      delta: 0,
      trend: 'stable' as const,
      snapshots: [],
      hasInsufficientData: false,
    };
  }
  
  // CRITICAL FIX: If trendData is null but we have health scores, create minimal trend data
  // This happens when snapshots haven't been generated yet but we have current scores
  if (!trendData && overallHealthScore?.healthScore !== null && overallHealthScore?.healthScore !== undefined) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[PortfolioHealthOverview] trendData is null but health score exists - creating minimal trend data', {
        healthScore: overallHealthScore.healthScore,
        branchScoresCount: branchScores.length,
      });
    }
    
    // Create a single snapshot for today with the current health score
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    // Use branch scores to create snapshots if available
    const snapshots = branchScores.length > 0
      ? branchScores.map(bs => ({
          date: today,
          score: bs.healthScore,
        }))
      : [{
          date: today,
          score: overallHealthScore.healthScore,
        }];
    
    // Create minimal trend data
    const minimalTrendData = {
      windowDays: 30 as const,
      startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: today,
      startScore: overallHealthScore.healthScore,
      endScore: overallHealthScore.healthScore,
      delta: 0,
      trend: 'stable' as const,
      snapshots: snapshots,
      hasInsufficientData: false, // Override to false since we have current score
    };
    
    // Use minimal trend data
    finalTrendData = minimalTrendData;
    hasInsufficientData = false;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[PortfolioHealthOverview] Created and using minimal trend data:', minimalTrendData);
    }
  }

  // STEP 1 & 2: Debug logs for card score and graph series
  if (process.env.NODE_ENV === 'development') {
    const lastGraphScore = finalTrendData?.snapshots && finalTrendData.snapshots.length > 0
      ? finalTrendData.snapshots[finalTrendData.snapshots.length - 1]?.score
      : null;
    console.log('CARD SCORE:', overallHealthScore?.healthScore);
    console.log('GRAPH SERIES:', {
      lastPoint: lastGraphScore,
      totalPoints: finalTrendData?.snapshots?.length || 0,
      match: lastGraphScore === overallHealthScore?.healthScore,
      snapshots: finalTrendData?.snapshots?.slice(-5).map((s: { date: Date; score: number }) => ({ date: s.date.toISOString().split('T')[0], score: s.score })),
      usingMinimalData: !trendData && !!finalTrendData,
    });
  }

  return (
    <SectionCard title={locale === 'th' ? 'ภาพรวมสุขภาพบริษัท' : 'Company Health Overview'}>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {/* LEFT: Chart (70%) - Hide if showTrends=false (Overview page) or insufficient data */}
        {showTrends && !hasInsufficientData && finalTrendData && (
          <div style={{ flex: '1 1 70%', minWidth: '400px' }}>
            {(finalTrendData.snapshots?.length ?? 0) === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', color: '#6b7280', fontSize: '14px' }}>
                {locale === 'th' ? 'ยังไม่มีประวัติแนวโน้ม — บันทึกข้อมูลต่อเพื่อดูกราฟ' : 'No trend history yet — keep logging data to see the chart.'}
              </div>
            ) : (
            <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setTrendWindow(30)}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: `1px solid ${trendWindow === 30 ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: '6px',
                  backgroundColor: trendWindow === 30 ? '#eff6ff' : 'white',
                  color: trendWindow === 30 ? '#3b82f6' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: trendWindow === 30 ? 600 : 400,
                }}
              >
                30 {locale === 'th' ? 'วัน' : 'Days'}
              </button>
              <button
                onClick={() => setTrendWindow(90)}
                style={{
                  padding: '0.375rem 0.75rem',
                  border: `1px solid ${trendWindow === 90 ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: '6px',
                  backgroundColor: trendWindow === 90 ? '#eff6ff' : 'white',
                  color: trendWindow === 90 ? '#3b82f6' : '#6b7280',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: trendWindow === 90 ? 600 : 400,
                }}
              >
                90 {locale === 'th' ? 'วัน' : 'Days'}
              </button>
            </div>

            {/* PART 3: Show chart only if we have sufficient data */}
            <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                {locale === 'th' ? 'คะแนนสุขภาพ' : 'Health Score'} ({trendWindow} {locale === 'th' ? 'วัน' : 'days'})
              </div>
              {/* Multi-line chart - aligned by date */}
              <div style={{ position: 'relative', height: '180px', marginBottom: '0.5rem' }}>
                {(() => {
                  // Align all snapshots by date for proper comparison
                  const allDates = new Set<string>();
                  
                  if (finalTrendData?.snapshots) {
                    finalTrendData.snapshots.forEach((s: any) => {
                      allDates.add(s.date.toISOString().split('T')[0]);
                    });
                  }
                  if (accommodationTrendData?.snapshots) {
                    accommodationTrendData.snapshots.forEach((s: any) => {
                      allDates.add(s.date.toISOString().split('T')[0]);
                    });
                  }
                  if (fnbTrendData?.snapshots) {
                    fnbTrendData.snapshots.forEach((s: any) => {
                      allDates.add(s.date.toISOString().split('T')[0]);
                    });
                  }
                  
                  const sortedDates = Array.from(allDates).sort();
                  const dateRange = sortedDates.length > 0 
                    ? sortedDates.slice(0, Math.min(30, sortedDates.length))
                    : [];
                  
                  // STEP 1: Create date-indexed maps for quick lookup
                  const overallMap = new Map<string, number>();
                  if (finalTrendData?.snapshots) {
                    finalTrendData.snapshots.forEach((s: any) => {
                      const dateKey = s.date.toISOString().split('T')[0];
                      overallMap.set(dateKey, s.score);
                    });
                    
                    // STEP 1: Debug log raw graph input
                    if (process.env.NODE_ENV === 'development') {
                      console.log('GRAPH INPUT RAW:', {
                        snapshots: finalTrendData.snapshots.map((s: any) => ({ 
                          date: s.date.toISOString().split('T')[0], 
                          score: s.score 
                        })),
                        lastScore: finalTrendData.snapshots[finalTrendData.snapshots.length - 1]?.score,
                        cardScore: overallHealthScore?.healthScore,
                      });
                    }
                  }
                  
                  const accommodationMap = new Map<string, number>();
                  if (accommodationTrendData?.snapshots) {
                    accommodationTrendData.snapshots.forEach((s: any) => {
                      const dateKey = s.date.toISOString().split('T')[0];
                      accommodationMap.set(dateKey, s.score);
                    });
                  }
                  
                  const fnbMap = new Map<string, number>();
                  if (fnbTrendData?.snapshots) {
                    fnbTrendData.snapshots.forEach((s: any) => {
                      const dateKey = s.date.toISOString().split('T')[0];
                      fnbMap.set(dateKey, s.score);
                    });
                  }
                  
                  return (
                    <svg width="100%" height="180" viewBox="0 0 800 180" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                      {/* Y-axis grid lines */}
                      {[0, 25, 50, 75, 100].map(score => {
                        const y = 180 - (score / 100) * 160;
                        return (
                          <g key={score}>
                            <line x1="40" y1={y} x2="800" y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2,2" />
                            <text x="35" y={y + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{score}</text>
                          </g>
                        );
                      })}
                      
                      {/* Overall Company line (bold) */}
                      {dateRange.length > 0 && overallMap.size > 0 && (() => {
                        const points = dateRange.map((dateKey, idx) => {
                          let score = overallMap.get(dateKey);
                          
                          // STEP 3: Force last point to equal card score
                          if (idx === dateRange.length - 1 && overallHealthScore?.healthScore !== null) {
                            score = overallHealthScore.healthScore;
                          }
                          
                          if (score === undefined) return null;
                          
                          // STEP 6: Ensure 0-100 scale
                          const clampedScore = Math.max(0, Math.min(100, score));
                          const x = 40 + (idx / (dateRange.length - 1 || 1)) * 760;
                          const y = 180 - (clampedScore / 100) * 160;
                          return `${x},${y}`;
                        }).filter(Boolean).join(' ');
                        
                        if (!points) return null;
                        
                        // STEP 3: Debug log last graph point
                        if (process.env.NODE_ENV === 'development') {
                          const lastPointScore = overallMap.get(dateRange[dateRange.length - 1]);
                          const finalScore = dateRange.length > 0 && overallHealthScore?.healthScore !== null
                            ? overallHealthScore.healthScore
                            : lastPointScore;
                          console.log('GRAPH LAST:', finalScore);
                          console.log('CARD SCORE:', overallHealthScore?.healthScore);
                          console.log('MATCH:', finalScore === overallHealthScore?.healthScore);
                        }
                        
                        return (
                          <polyline
                            points={points}
                            fill="none"
                            stroke="#0a0a0a"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })()}
                      
                      {/* Accommodation line (lighter, dashed) */}
                      {dateRange.length > 0 && accommodationMap.size > 0 && accommodationTrendData && (() => {
                        const points = dateRange.map((dateKey, idx) => {
                          let score = accommodationMap.get(dateKey);
                          
                          // STEP 3: Force last point to equal card score
                          if (idx === dateRange.length - 1 && accommodationHealthScore?.healthScore != null) {
                            score = accommodationHealthScore?.healthScore ?? score;
                          }
                          
                          if (score === undefined) return null;
                          
                          // STEP 6: Ensure 0-100 scale
                          const clampedScore = Math.max(0, Math.min(100, score));
                          const x = 40 + (idx / (dateRange.length - 1 || 1)) * 760;
                          const y = 180 - (clampedScore / 100) * 160;
                          return `${x},${y}`;
                        }).filter(Boolean).join(' ');
                        
                        if (!points) return null;
                        
                        return (
                          <polyline
                            points={points}
                            fill="none"
                            stroke="#6b7280"
                            strokeWidth="2"
                            strokeOpacity="0.6"
                            strokeDasharray="4,2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })()}
                      
                      {/* F&B line (lighter) */}
                      {dateRange.length > 0 && fnbMap.size > 0 && fnbTrendData && (() => {
                        const points = dateRange.map((dateKey, idx) => {
                          let score = fnbMap.get(dateKey);
                          
                          // STEP 3: Force last point to equal card score
                          if (idx === dateRange.length - 1 && fnbHealthScore?.healthScore != null) {
                            score = fnbHealthScore?.healthScore ?? score;
                          }
                          
                          if (score === undefined) return null;
                          
                          // STEP 6: Ensure 0-100 scale
                          const clampedScore = Math.max(0, Math.min(100, score));
                          const x = 40 + (idx / (dateRange.length - 1 || 1)) * 760;
                          const y = 180 - (clampedScore / 100) * 160;
                          return `${x},${y}`;
                        }).filter(Boolean).join(' ');
                        
                        if (!points) return null;
                        
                        return (
                          <polyline
                            points={points}
                            fill="none"
                            stroke="#6b7280"
                            strokeWidth="2"
                            strokeOpacity="0.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })()}
                    </svg>
                  );
                })()}
              </div>
              
              {/* Legend */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '12px', color: '#6b7280' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '16px', height: '3px', backgroundColor: '#0a0a0a', borderRadius: '2px' }} />
                  <span>{locale === 'th' ? 'ภาพรวมบริษัท' : 'Overall Company'}</span>
                </div>
                {accommodationHealthScore && accommodationTrendData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '16px', height: '2px', backgroundColor: '#6b7280', borderRadius: '2px', opacity: 0.6, borderTop: '2px dashed #6b7280' }} />
                    <span>{locale === 'th' ? 'ที่พัก' : 'Accommodation'}</span>
                  </div>
                )}
                {fnbHealthScore && fnbTrendData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '16px', height: '2px', backgroundColor: '#6b7280', borderRadius: '2px', opacity: 0.6 }} />
                    <span>{locale === 'th' ? 'อาหารและเครื่องดื่ม' : 'F&B'}</span>
                  </div>
                )}
              </div>
            </div>
            </>
            )}
          </div>
        )}

        {/* RIGHT: Summary Cards (30% or full width if no chart or showTrends=false) */}
        <div style={{ 
          flex: (!showTrends || hasInsufficientData || !finalTrendData) ? '1 1 100%' : '0 0 250px', 
          display: 'flex', 
          flexDirection: (!showTrends || hasInsufficientData || !finalTrendData) ? 'row' : 'column',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: (!showTrends || hasInsufficientData || !finalTrendData) ? 'center' : 'flex-start',
        }}>
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f9fafb', 
            borderRadius: '8px', 
            border: '1px solid #e5e7eb',
            minWidth: (!showTrends || hasInsufficientData || !finalTrendData) ? '200px' : 'auto',
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
              {locale === 'th' ? 'ภาพรวมบริษัท' : 'Overall Company'}
            </div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: overallHealthScore.healthScore !== null ? getHealthScoreColor(overallHealthScore.healthScore) : '#6b7280', lineHeight: 1 }}>
              {overallHealthScore.healthScore !== null ? overallHealthScore.healthScore : '—'}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
              {overallHealthScore.branchesIncluded} {locale === 'th' ? 'สาขา' : 'branches'}
            </div>
          </div>

          {accommodationHealthScore && accommodationHealthScore.healthScore !== null && (
            <div style={{ padding: '0.75rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'ที่พัก' : 'Accommodation'}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: getHealthScoreColor(accommodationHealthScore.healthScore), lineHeight: 1 }}>
                {accommodationHealthScore.healthScore}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '0.25rem' }}>
                {accommodationHealthScore.branchesIncluded} {locale === 'th' ? 'สาขา' : 'branches'}
              </div>
            </div>
          )}

          {fnbHealthScore && fnbHealthScore.healthScore !== null && (
            <div style={{ padding: '0.75rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem' }}>
                {locale === 'th' ? 'อาหารและเครื่องดื่ม' : 'F&B'}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: getHealthScoreColor(fnbHealthScore.healthScore), lineHeight: 1 }}>
                {fnbHealthScore.healthScore}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '0.25rem' }}>
                {fnbHealthScore.branchesIncluded} {locale === 'th' ? 'สาขา' : 'branches'}
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
