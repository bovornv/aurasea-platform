/**
 * Company Trend Analytics Component
 * 
 * Compact, analytical view for Trends page
 * Shows health trends, revenue trends, alert trends, and risk distribution
 */
'use client';

import { useState, useMemo } from 'react';
import { SectionCard } from '../section-card';
import { businessGroupService } from '../../services/business-group-service';
import { ModuleType } from '../../models/business-group';
import type { BranchHealthScore, GroupHealthScore } from '../../services/health-score-service';
interface CompanyTrendAnalyticsProps {
  businessGroupId: string;
  branchScores: BranchHealthScore[];
  overallHealthScore: GroupHealthScore | null;
  locale: string;
}

export function CompanyTrendAnalytics({
  businessGroupId,
  branchScores,
  overallHealthScore,
  locale,
}: CompanyTrendAnalyticsProps) {
  const [trendWindow, setTrendWindow] = useState<30 | 90>(30);

  const trendData = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const { getHealthScoreTrend } = require('../../../../../core/sme-os/engine/services/health-score-trend-service');
      const allBranches = businessGroupService.getAllBranches();
      
      // If only one branch, use that branch's trend directly
      if (allBranches.length === 1) {
        const singleBranch = allBranches[0];
        const branchTrend30 = getHealthScoreTrend(businessGroupId, 30, singleBranch.id);
        const branchTrend90 = getHealthScoreTrend(businessGroupId, 90, singleBranch.id);
        const branchTrend = trendWindow === 30 ? branchTrend30 : branchTrend90;
        
        // Override hasInsufficientData if snapshots exist
        let finalTrend = branchTrend;
        if (branchTrend.hasInsufficientData && branchTrend.snapshots.length > 0) {
          finalTrend = {
            ...branchTrend,
            hasInsufficientData: false,
          };
        }
        
        // Ensure last snapshot equals current card score
        if (finalTrend.snapshots.length > 0 && overallHealthScore?.healthScore !== null) {
          const lastSnapshot = finalTrend.snapshots[finalTrend.snapshots.length - 1];
          const currentCardScore = overallHealthScore?.healthScore ?? 0;
          
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
            };
          }
        }
        
        return finalTrend;
      }
      
      // Multi-branch: aggregate trends
      const companyTrend30 = getHealthScoreTrend(businessGroupId, 30);
      const companyTrend90 = getHealthScoreTrend(businessGroupId, 90);
      const companyTrend = trendWindow === 30 ? companyTrend30 : companyTrend90;
      
      // Override hasInsufficientData if snapshots exist
      let finalTrend = companyTrend;
      if (companyTrend.hasInsufficientData && companyTrend.snapshots.length > 0) {
        finalTrend = {
          ...companyTrend,
          hasInsufficientData: false,
        };
      }
      
      // Ensure last snapshot equals current card score
      if (finalTrend.snapshots.length > 0 && overallHealthScore?.healthScore !== null) {
        const lastSnapshot = finalTrend.snapshots[finalTrend.snapshots.length - 1];
        const currentCardScore = overallHealthScore?.healthScore ?? 0;
        
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
          };
        }
      }
      
      return finalTrend;
    } catch (e) {
      console.error('[CompanyTrendAnalytics] Failed to load trend data:', e);
      return null;
    }
  }, [businessGroupId, trendWindow, overallHealthScore?.healthScore]);

  const hasInsufficientData = trendData?.hasInsufficientData || !trendData || trendData.snapshots.length < 5;
  
  // Calculate trend comparison (current vs previous period)
  const trendComparison = useMemo(() => {
    if (!trendData || hasInsufficientData) return null;
    
    const snapshots = trendData.snapshots;
    if (snapshots.length < 10) return null;
    
    const currentPeriod = snapshots.slice(-Math.floor(snapshots.length / 2));
    const previousPeriod = snapshots.slice(0, Math.floor(snapshots.length / 2));
    
    const currentAvg = currentPeriod.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / currentPeriod.length;
    const previousAvg = previousPeriod.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / previousPeriod.length;
    
    const delta = currentAvg - previousAvg;
    const percentChange = previousAvg > 0 ? (delta / previousAvg) * 100 : 0;
    
    return {
      delta,
      percentChange,
      isImproving: delta > 0,
    };
  }, [trendData, hasInsufficientData]);

  return (
<SectionCard title={locale === 'th' ? 'แนวโน้มสุขภาพ' : 'Health Trend'}>
      {/* Compact Header with Stats */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '0.75rem',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.25rem' }}>
            {locale === 'th' ? `แนวโน้มสุขภาพ (${trendWindow} วันล่าสุด)` : `Health Trend (Last ${trendWindow} Days)`}
          </div>
          {trendComparison && (
            <div style={{ fontSize: '14px', fontWeight: 500, color: trendComparison.isImproving ? '#10b981' : '#ef4444' }}>
              {trendComparison.isImproving ? '▲' : '▼'} {Math.abs(trendComparison.percentChange).toFixed(1)}% 
              {locale === 'th' ? ' เทียบกับช่วงก่อนหน้า' : ' vs previous period'}
            </div>
          )}
          {overallHealthScore && (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '0.25rem' }}>
              {locale === 'th' ? 'ความมั่นใจ' : 'Confidence'}: {Math.round(overallHealthScore.confidence || 0)}%
            </div>
          )}
        </div>
        
        {/* Window Toggle */}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => setTrendWindow(30)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '12px',
              border: `1px solid ${trendWindow === 30 ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '4px',
              backgroundColor: trendWindow === 30 ? '#eff6ff' : 'transparent',
              color: trendWindow === 30 ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            30d
          </button>
          <button
            onClick={() => setTrendWindow(90)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '12px',
              border: `1px solid ${trendWindow === 90 ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '4px',
              backgroundColor: trendWindow === 90 ? '#eff6ff' : 'transparent',
              color: trendWindow === 90 ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            90d
          </button>
        </div>
      </div>

      {/* Compact Chart */}
      {hasInsufficientData ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
          {locale === 'th' 
            ? 'ข้อมูลประวัติไม่เพียงพอ แนวโน้มจะปรากฏหลังจากติดตาม 10+ วัน'
            : 'Insufficient history data. Trends will appear after 10+ days of monitoring.'}
        </div>
      ) : trendData && overallHealthScore ? (
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{
            height: '150px',
            marginBottom: '0.75rem',
            position: 'relative',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '0.5rem',
          }}>
            {trendData.snapshots.length > 1 ? (
              <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                {(() => {
                  const snapshots = trendData.snapshots;
                  const width = 100;
                  const height = 100;
                  const minScore = Math.max(0, Math.min(...snapshots.map((s: { score: number }) => s.score)) - 5);
                  const maxScore = Math.min(100, Math.max(...snapshots.map((s: { score: number }) => s.score)) + 5);
                  const range = maxScore - minScore || 1;
                  
                  const getHealthScoreColor = (score: number): string => {
                    if (score >= 80) return '#10b981';
                    if (score >= 60) return '#f59e0b';
                    return '#ef4444';
                  };
                  
                  const chartColor = getHealthScoreColor(overallHealthScore?.healthScore ?? 0);
                  
                  const points = snapshots.map((snapshot: { score: number }, idx: number) => {
                    const x = (idx / (snapshots.length - 1)) * width;
                    const y = height - ((snapshot.score - minScore) / range) * height;
                    return `${x},${y}`;
                  }).join(' ');
                  
                  return (
                    <polyline
                      points={points}
                      fill="none"
                      stroke={chartColor}
                      strokeWidth="2"
                      style={{ transform: 'scale(0.95)', transformOrigin: '0 0' }}
                    />
                  );
                })()}
              </svg>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#6b7280',
                fontSize: '13px'
              }}>
                {locale === 'th' ? 'ไม่มีข้อมูลเพียงพอ' : 'Insufficient data'}
              </div>
            )}
          </div>
          
          {/* Trend Summary */}
          {trendData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '16px' }}>
                  {trendData.delta > 0 ? '▲' : trendData.delta < 0 ? '▼' : '—'}
                </span>
                <span style={{
                  fontWeight: 600,
                  color: trendData.delta > 0 ? '#10b981' : trendData.delta < 0 ? '#ef4444' : '#6b7280',
                }}>
                  {trendData.delta > 0 ? '+' : ''}{trendData.delta.toFixed(1)}
                </span>
              </div>
              <div style={{ color: '#6b7280' }}>
                {Math.abs(trendData.delta) < 2
                  ? (locale === 'th' ? 'คงที่' : 'Stable')
                  : trendData.trend === 'improving'
                  ? (locale === 'th' ? 'ดีขึ้น' : 'Improving')
                  : (locale === 'th' ? 'ลดลง' : 'Declining')}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
