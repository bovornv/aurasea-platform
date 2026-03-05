// Hotel / Resort Tab Content - Owner-focused, simplified view
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useI18n } from '../hooks/use-i18n';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { useHealthScore } from '../hooks/use-health-score';
import { useAlertStore } from '../contexts/alert-store-context';
import { businessGroupService } from '../services/business-group-service';
import { ModuleType } from '../models/business-group';
import { formatCurrency } from '../utils/formatting';
import { getSeverityColor } from '../utils/alert-utils';
import { operationalSignalsService } from '../services/operational-signals-service';
import { getRevenueImpactCopy, getAlertListSummary } from '../utils/revenue-impact-copy';

interface HotelTabContentProps {
  alerts: Array<{
    id: string;
    message: string;
    severity: 'critical' | 'warning' | 'informational';
    confidence: number;
    timestamp: Date;
  }>;
  alertCounts: {
    critical: number;
    warning: number;
    informational: number;
    total: number;
  };
}

export function HotelTabContent({ alerts, alertCounts }: HotelTabContentProps) {
  const { locale, t } = useI18n();
  const { branch, isAllBranches } = useCurrentBranch();
  const { groupHealthScore } = useHealthScore();
  const { alerts: rawAlerts } = useAlertStore();

  // Get latest signal for demand pattern
  const latestSignal = useMemo(() => {
    const businessGroup = businessGroupService.getBusinessGroup();
    const branchId = isAllBranches ? null : branch?.id;
    return operationalSignalsService.getLatestSignal(branchId, businessGroup?.id);
  }, [branch?.id, isAllBranches]);

  // Get health score for current branch or group
  const healthScore = useMemo(() => {
    if (!groupHealthScore) return null;
    
    if (isAllBranches) {
      // For aggregated view, calculate trend from branch trends
      // If majority of branches are improving/deteriorating, reflect that in aggregate trend
      const branchTrends = groupHealthScore.branchScores
        .filter(bs => bs.hasSufficientData)
        .map(bs => bs.trend);
      
      let aggregateTrend: 'up' | 'down' | 'stable' = 'stable';
      if (branchTrends.length > 0) {
        const upCount = branchTrends.filter(t => t === 'up').length;
        const downCount = branchTrends.filter(t => t === 'down').length;
        const stableCount = branchTrends.filter(t => t === 'stable').length;
        
        // If >50% of branches are trending in same direction, use that trend
        if (upCount > branchTrends.length / 2) {
          aggregateTrend = 'up';
        } else if (downCount > branchTrends.length / 2) {
          aggregateTrend = 'down';
        }
      }
      
      return {
        score: groupHealthScore.healthScore,
        confidence: groupHealthScore.confidence,
        trend: aggregateTrend,
      };
    }
    // For single branch, get from groupHealthScore branch scores
    if (branch) {
      const branchScore = groupHealthScore.branchScores.find(bs => bs.branchId === branch.id);
      if (branchScore) {
        return {
          score: branchScore.healthScore,
          confidence: branchScore.dataConfidence,
          trend: branchScore.trend,
        };
      }
    }
    // Fallback: use aggregated score if branch score not found
    return {
      score: groupHealthScore.healthScore,
      confidence: groupHealthScore.confidence,
      trend: 'stable' as const,
    };
  }, [isAllBranches, groupHealthScore, branch]);

  // Get top 3 performance drivers (alerts)
  const topDrivers = useMemo(() => {
    if (alerts.length === 0) return [];
    
    // Filter raw alerts to only include those in the current alerts list
    const filteredRawAlerts = rawAlerts.filter(a => 
      alerts.some(alert => alert.id === a.id)
    );
    
    if (filteredRawAlerts.length === 0) return [];
    
    try {
      if (typeof window !== 'undefined') {
        const { getTopRisks } = require('../../../../core/sme-os/engine/services/alert-health-score-mapper');
        const risks = getTopRisks(filteredRawAlerts, 3);
        if (risks && risks.length > 0) {
          return risks;
        }
      }
    } catch (e) {
      console.error('Failed to load top risks:', e);
    }
    
    // Fallback: return top 3 alerts by severity
    return alerts
      .sort((a, b) => {
        const severityOrder = { critical: 3, warning: 2, informational: 1 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      })
      .slice(0, 3)
      .map(alert => ({
        alertId: alert.id,
        title: alert.message,
        impactScore: 0,
        penalty: 0,
        confidence: alert.confidence,
        severity: alert.severity,
        explanation: alert.message,
      }));
  }, [alerts, rawAlerts]);

  // Calculate occupancy/demand pattern
  const demandPattern = useMemo(() => {
    if (!latestSignal?.occupancyRate) return null;
    
    const occupancy = latestSignal.occupancyRate * 100;
    const trend = occupancy >= 70 ? 'high' : occupancy >= 50 ? 'moderate' : 'low';
    
    return {
      occupancy: Math.round(occupancy),
      trend,
    };
  }, [latestSignal]);

  // Get branch comparison data (only if multi-branch)
  const branchComparison = useMemo(() => {
    if (!isAllBranches || !groupHealthScore) return null;
    
    const allBranches = businessGroupService.getAllBranches();
    return groupHealthScore.branchScores
      .filter(bs => {
        // Only show hotel branches
        const branch = allBranches.find(b => b.id === bs.branchId);
        return branch?.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
      })
      .map(bs => {
        const branch = allBranches.find(b => b.id === bs.branchId);
        return {
          branchId: bs.branchId,
          branchName: branch?.branchName || 'Unknown',
          healthScore: bs.healthScore,
          alertCount: bs.alertCounts.critical + bs.alertCounts.warning + bs.alertCounts.informational,
        };
      })
      .sort((a, b) => a.healthScore - b.healthScore); // Sort by health score (lowest first)
  }, [isAllBranches, groupHealthScore]);

  // Generate recommendations
  const recommendations = useMemo(() => {
    const recs: string[] = [];
    
    if (alertCounts.critical > 0) {
      recs.push(
        locale === 'th' 
          ? `แก้ไขการแจ้งเตือนที่สำคัญ ${alertCounts.critical} รายการเพื่อปรับปรุงสุขภาพธุรกิจ`
          : `Address ${alertCounts.critical} critical alert${alertCounts.critical !== 1 ? 's' : ''} to improve business health`
      );
    }
    
    if (topDrivers.length > 0 && topDrivers[0].severity === 'warning') {
      recs.push(
        locale === 'th'
          ? `ตรวจสอบและแก้ไข: ${topDrivers[0].title}`
          : `Review and address: ${topDrivers[0].title}`
      );
    }
    
    if (demandPattern && demandPattern.occupancy < 50) {
      recs.push(
        locale === 'th'
          ? 'พิจารณาเพิ่มอัตราการเข้าพักเพื่อปรับปรุงรายได้'
          : 'Consider increasing occupancy rate to improve revenue'
      );
    }
    
    if (healthScore && healthScore.score != null && healthScore.score < 60) {
      recs.push(
        locale === 'th'
                ? 'อัปเดตตัวเลขล่าสุดเพื่อให้ระบบสามารถประเมินได้แม่นยำขึ้น'
                : 'Update latest metrics for more accurate assessment'
      );
    }
    
    return recs.slice(0, 4);
  }, [alertCounts, topDrivers, demandPattern, healthScore, locale]);

  const getHealthScoreColor = (score: number) => {
    if (score >= 70) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getHealthScoreExplanation = (score: number) => {
    if (score >= 70) {
      return locale === 'th'
        ? 'ธุรกิจของคุณมีสุขภาพดี มีความเสี่ยงต่ำและโอกาสในการเติบโต'
        : 'Your business is healthy with low risks and growth opportunities';
    }
    if (score >= 50) {
      return locale === 'th'
        ? 'ธุรกิจของคุณมีสุขภาพปานกลาง มีบางพื้นที่ที่ต้องให้ความสนใจ'
        : 'Your business health is moderate with some areas needing attention';
    }
    return locale === 'th'
      ? 'ธุรกิจของคุณต้องการการดูแลทันที มีความเสี่ยงหลายประการที่ต้องแก้ไข'
      : 'Your business needs immediate attention with multiple risks to address';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Primary CTA: Update Hotel Data */}
      <div
        style={{
          border: '1px solid #3b82f6',
          borderRadius: '12px',
          padding: '1.5rem',
          backgroundColor: '#eff6ff',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', marginTop: 0 }}>
              {locale === 'th' ? 'อัปเดตตัวเลขล่าสุด' : 'Update Latest Metrics'}
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.5', fontStyle: 'italic' }}>
              {locale === 'th'
                ? 'อัปเดตสัญญาณอัตราการเข้าพัก รายได้ และต้นทุนของโรงแรม'
                : 'Update hotel occupancy, revenue, and cost signals'}
            </p>
          </div>
          <Link
            href={branch ? `/branch/${branch.id}/metrics` : '/branch/overview'}
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {locale === 'th' ? 'อัปเดตข้อมูลโรงแรม' : 'Update Hotel Data'} →
          </Link>
        </div>
      </div>

      {/* 1. Hotel Health Snapshot */}
      {healthScore && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'ภาพรวมสุขภาพโรงแรม' : 'Hotel Health Snapshot'}
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
              <div
                style={{
                  fontSize: '64px',
                  fontWeight: 700,
                  color: getHealthScoreColor(healthScore.score ?? 0),
                  lineHeight: 1,
                }}
              >
                {Math.round(healthScore.score ?? 0)}
              </div>
              <div style={{ fontSize: '24px', color: '#6b7280', fontWeight: 500 }}>
                / 100
              </div>
            </div>
            
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '20px' }}>
                  {healthScore.trend === 'up' ? '↑' : healthScore.trend === 'down' ? '↓' : '→'}
                </span>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  {healthScore.trend === 'up'
                    ? (locale === 'th' ? 'ดีขึ้น' : 'Improving')
                    : healthScore.trend === 'down'
                    ? (locale === 'th' ? 'แย่ลง' : 'Deteriorating')
                    : (locale === 'th' ? 'คงที่' : 'Stable')}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: healthScore.confidence >= 0.7 ? '#f0fdf4' : healthScore.confidence >= 0.5 ? '#fef3c7' : '#fef2f2',
                    border: `1px solid ${healthScore.confidence >= 0.7 ? '#bbf7d0' : healthScore.confidence >= 0.5 ? '#fde68a' : '#fecaca'}`,
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: healthScore.confidence >= 0.7 ? '#166534' : healthScore.confidence >= 0.5 ? '#92400e' : '#991b1b',
                  }}
                >
                  {Math.round(healthScore.confidence * 100)}% {locale === 'th' ? 'ความเชื่อมั่น' : 'Confidence'}
                </div>
              </div>
              
              <p style={{ fontSize: '14px', color: '#6b7280', margin: 0, lineHeight: '1.6' }}>
                {getHealthScoreExplanation(healthScore.score ?? 0)}
              </p>
              {healthScore.confidence < 0.7 && (
                <p style={{ fontSize: '12px', color: '#f59e0b', marginTop: '0.5rem', margin: 0, fontStyle: 'italic' }}>
                  {locale === 'th'
                    ? 'ความเชื่อมั่นขึ้นอยู่กับความใหม่ของข้อมูล — อัปเดตตัวเลขล่าสุดเพื่อเพิ่มความแม่นยำ'
                    : 'Confidence depends on data freshness — Update latest metrics to improve accuracy'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Top Performance Drivers */}
      {topDrivers.length > 0 && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.75rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'ตัวขับเคลื่อนผลการดำเนินงานหลัก' : 'Top Performance Drivers'}
          </h2>
          
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            {getAlertListSummary(topDrivers.length, locale)}
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {topDrivers.map((driver: { alertId: string; title?: string; severity?: string; explanation?: string; [key: string]: unknown }, idx: number) => (
              <div
                key={driver.alertId}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: getSeverityColor(driver.severity ?? 'informational'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                      {driver.severity === 'critical' ? '!' : driver.severity === 'warning' ? '⚠' : 'i'}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', marginTop: 0 }}>
                      {driver.title}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.6' }}>
                      {String(driver.explanation ?? '')}
                    </p>
                    {/* Revenue Impact */}
                    <div
                      style={{
                        padding: '0.75rem',
                        backgroundColor: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '6px',
                        marginTop: '0.5rem',
                      }}
                    >
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem', marginTop: 0 }}>
                        {getRevenueImpactCopy((driver.severity ?? 'informational') as 'critical' | 'warning' | 'informational', locale).summary}
                      </p>
                      <p style={{ fontSize: '12px', color: '#78350f', margin: 0, lineHeight: '1.5' }}>
                        {getRevenueImpactCopy((driver.severity ?? 'informational') as 'critical' | 'warning' | 'informational', locale).explanation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Demand Pattern Visualization */}
      {demandPattern && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'รูปแบบความต้องการ' : 'Demand Pattern'}
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', height: '120px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 700,
                  color: demandPattern.trend === 'high' ? '#10b981' : demandPattern.trend === 'moderate' ? '#f59e0b' : '#ef4444',
                  lineHeight: 1,
                }}
              >
                {demandPattern.occupancy}%
              </div>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                {locale === 'th' ? 'อัตราการเข้าพัก' : 'Occupancy Rate'}
              </span>
            </div>
          </div>
          
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0, lineHeight: '1.6', textAlign: 'center' }}>
            {locale === 'th'
              ? `อัตราการเข้าพักปัจจุบัน ${demandPattern.trend === 'high' ? 'สูง' : demandPattern.trend === 'moderate' ? 'ปานกลาง' : 'ต่ำ'} — ${demandPattern.trend === 'high' ? 'ดีมาก' : demandPattern.trend === 'moderate' ? 'มีโอกาสปรับปรุง' : 'ควรเพิ่มความพยายามในการตลาด'}`
              : `Current occupancy is ${demandPattern.trend} — ${demandPattern.trend === 'high' ? 'excellent performance' : demandPattern.trend === 'moderate' ? 'room for improvement' : 'consider increasing marketing efforts'}`}
          </p>
        </div>
      )}

      {/* 4. Branch Comparison (only if multi-branch) */}
      {branchComparison && branchComparison.length > 1 && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
            {locale === 'th' ? 'เปรียบเทียบสาขา' : 'Branch Comparison'}
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {branchComparison.map((branch) => (
              <div
                key={branch.branchId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.25rem', marginTop: 0 }}>
                    {branch.branchName}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                    {locale === 'th' ? `${branch.alertCount} การแจ้งเตือน` : `${branch.alertCount} alert${branch.alertCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: 600,
                    color: getHealthScoreColor(branch.healthScore),
                  }}
                >
                  {Math.round(branch.healthScore)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Active Alerts Summary */}
      {alertCounts.total > 0 && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '2rem',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em' }}>
              {locale === 'th' ? 'สรุปการแจ้งเตือน' : 'Active Alerts Summary'}
            </h2>
            <Link
              href="/branch/alerts"
              style={{
                fontSize: '14px',
                color: '#3b82f6',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {locale === 'th' ? 'ดูการแจ้งเตือนทั้งหมด' : 'View all alerts'} →
            </Link>
          </div>
          
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {alertCounts.critical > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  {alertCounts.critical} {locale === 'th' ? 'สำคัญ' : 'Critical'}
                </span>
              </div>
            )}
            {alertCounts.warning > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  {alertCounts.warning} {locale === 'th' ? 'เตือน' : 'Warning'}
                </span>
              </div>
            )}
            {alertCounts.informational > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  {alertCounts.informational} {locale === 'th' ? 'ข้อมูล' : 'Info'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. What to do next */}
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '2rem',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
          {locale === 'th' ? 'สิ่งที่ควรทำต่อไป' : 'What to do next'}
        </h2>
        
        {recommendations.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {recommendations.map((rec, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {idx + 1}
                </div>
                <p style={{ fontSize: '14px', color: '#374151', margin: 0, lineHeight: '1.6', flex: 1 }}>
                  {rec}
                </p>
              </div>
            ))}
          </div>
        )}
        
        <Link
          href="/branch/log-today"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#0a0a0a',
            color: '#ffffff',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#374151';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#0a0a0a';
          }}
        >
          {locale === 'th' ? 'อัปเดตตัวเลขล่าสุด' : 'Update Latest Metrics'}
        </Link>
      </div>
    </div>
  );
}
