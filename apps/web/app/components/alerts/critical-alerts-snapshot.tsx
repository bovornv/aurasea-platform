/**
 * Critical Alerts Snapshot Component
 * 
 * Shows top 3-5 alerts with highest money impact
 * Compact summary view with link to full alerts page
 */
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '../section-card';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { formatCurrency } from '../../utils/formatting';
import { getSeverityColor, getSeverityLabel } from '../../utils/alert-utils';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import type { ExtendedAlertContract } from '../../services/monitoring-service';

interface CriticalAlertsSnapshotProps {
  alerts: AlertContract[];
  viewType: 'company' | 'branch';
  locale?: string;
  /** When true and no alerts: show init message instead of "System Stable". */
  alertsInitializing?: boolean;
  /** Company Today page: severity-3 / critical first, impact sort, backfill, no “System stable” empty. */
  layoutVariant?: 'default' | 'companyToday';
}

function isMaxSeverityAlert(alert: AlertContract): boolean {
  if (alert.severity === 'critical') return true;
  const ext = alert as unknown as Record<string, unknown>;
  const n = ext.severityNumeric ?? ext.severity_level ?? ext.severityLevel;
  return n === 3 || n === '3';
}

function alertUniqueKey(alert: AlertContract): string {
  const code = (alert as { code?: string }).code || alert.id;
  return `${code}_${alert.branchId || 'unknown'}`;
}

function isAlertRecent(alert: AlertContract, now: Date): boolean {
  if (!alert.timestamp) return true;
  try {
    const alertDate = new Date(alert.timestamp);
    if (isNaN(alertDate.getTime())) return true;
    const alertAgeDays = (now.getTime() - alertDate.getTime()) / (1000 * 60 * 60 * 24);
    return alertAgeDays <= 30;
  } catch {
    return true;
  }
}

export function CriticalAlertsSnapshot({
  alerts,
  viewType,
  locale = 'en',
  alertsInitializing,
  layoutVariant = 'default',
}: CriticalAlertsSnapshotProps) {
  const router = useRouter();
  const paths = useOrgBranchPaths();

  // STABILITY: Guard revenueImpact everywhere
  const safeRevenueImpact = (alert: AlertContract): number => {
    const extended = alert as ExtendedAlertContract;
    const impact = extended?.revenueImpact;
    return typeof impact === 'number' && !isNaN(impact) && isFinite(impact) && impact > 0 ? impact : 0;
  };

  // STABILITY: Safe alert copy, all sorting in useMemo
  const safeAlerts = useMemo(() => {
    if (!alerts || !Array.isArray(alerts)) return [];
    return [...alerts]; // Create copy, never mutate original
  }, [alerts]);

  // PART 2: Get branch names for company view
  const branchNamesMap = useMemo(() => {
    if (viewType !== 'company' || typeof window === 'undefined') {
      return new Map<string, string>();
    }
    
    try {
      const { businessGroupService } = require('../../services/business-group-service');
      const allBranches = businessGroupService.getAllBranches();
      const map = new Map<string, string>();
      
      allBranches.forEach((branch: { id: string; branchName?: string }) => {
        if (branch.id && branch.branchName) {
          map.set(branch.id, branch.branchName);
        }
      });
      
      return map;
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CriticalAlertsSnapshot] Error getting branch names:', e);
      }
      return new Map<string, string>();
    }
  }, [viewType, alerts]);

  // PART 2: Critical Alerts Snapshot (Company)
  // Rules:
  // - Collect alerts from all branches
  // - Deduplicate by alert.code + branchId (do NOT merge alerts from different branches)
  // - Include branchId reference
  // - Sort by financial impact descending
  const topAlerts = useMemo(() => {
    if (!safeAlerts.length) return [];

    // PART 2: Deduplicate by code + branchId (for company view, keep separate alerts per branch)
    // Use: const uniqueAlerts = Array.from(new Map(allAlerts.map(a => [a.code + a.branchId, a])).values());
    const uniqueAlertsMap = new Map<string, AlertContract>();
    safeAlerts.forEach(alert => {
      // PART 2: Use code + branchId as unique key (do NOT merge alerts from different branches)
      const code = (alert as any).code || alert.id;
      const branchId = alert.branchId || 'unknown';
      const uniqueKey = `${code}_${branchId}`;
      if (!uniqueAlertsMap.has(uniqueKey)) {
        uniqueAlertsMap.set(uniqueKey, alert);
      }
    });
    const deduplicatedAlerts = Array.from(uniqueAlertsMap.values());
    const now = new Date();
    const recentDeduped = deduplicatedAlerts.filter((a) => isAlertRecent(a, now));

    if (layoutVariant === 'companyToday' && viewType === 'company') {
      const byImpactDesc = (a: AlertContract, b: AlertContract) =>
        safeRevenueImpact(b) - safeRevenueImpact(a);
      const maxSev = recentDeduped.filter(isMaxSeverityAlert).sort(byImpactDesc);
      let picked: AlertContract[] = maxSev.slice(0, 5);
      if (picked.length < 3) {
        const keys = new Set(picked.map(alertUniqueKey));
        for (const a of [...recentDeduped].sort(byImpactDesc)) {
          if (picked.length >= 5) break;
          const k = alertUniqueKey(a);
          if (keys.has(k)) continue;
          picked.push(a);
          keys.add(k);
        }
      }
      if (picked.length === 0) {
        picked = [...recentDeduped].sort(byImpactDesc).slice(0, 5);
      }
      return picked.map((alert) => ({
        ...alert,
        estimatedRevenueImpact: safeRevenueImpact(alert),
        moneyImpactTHB: safeRevenueImpact(alert),
        branchId: alert.branchId,
      }));
    }

    // PART 1.3: Only alerts with severity === 'critical' appear (not warning)
    // Filter out ghost alerts from old scenarios by checking timestamp
    const criticalAlerts = deduplicatedAlerts.filter(alert => {
      // PART 1.3: Only include critical severity (not warning)
      if (alert.severity !== 'critical') {
        return false;
      }
      // PART 1.3: Filter out ghost alerts from old scenarios
      // Check timestamp if available, but don't exclude alerts without timestamp (they're likely current)
      if (alert.timestamp) {
        try {
          const alertDate = new Date(alert.timestamp);
          if (!isNaN(alertDate.getTime())) {
            const alertAge = now.getTime() - alertDate.getTime();
            const alertAgeDays = alertAge / (1000 * 60 * 60 * 24);
            // Only show alerts from last 30 days (prevent ghost alerts after scenario switch)
            // Using 30 days instead of 7 to avoid filtering out valid alerts
            if (alertAgeDays > 30) {
              return false;
            }
          }
        } catch (e) {
          // If timestamp parsing fails, include the alert (better to show than hide)
        }
      }
      return true;
    });

    // Separate alerts with and without revenue impact
    const alertsWithImpact: AlertContract[] = [];
    const alertsWithoutImpact: AlertContract[] = [];

    criticalAlerts.forEach(alert => {
      const impact = safeRevenueImpact(alert);
      if (impact > 0) {
        alertsWithImpact.push(alert);
      } else {
        // Include alerts without impact - they're still critical
        alertsWithoutImpact.push(alert);
      }
    });
    
    // Debug logging (development only)
    if (process.env.NODE_ENV === 'development' && criticalAlerts.length > 0) {
      console.log('[CriticalAlertsSnapshot] Processing alerts:', {
        total: safeAlerts.length,
        critical: criticalAlerts.length,
        withImpact: alertsWithImpact.length,
        withoutImpact: alertsWithoutImpact.length,
      });
    }

    // PART 2: Sort by financial impact descending
    alertsWithImpact.sort((a, b) => {
      const aImpact = safeRevenueImpact(a);
      const bImpact = safeRevenueImpact(b);
      if (bImpact !== aImpact) return bImpact - aImpact;
      
      // Secondary sort by severity
      const severityOrder: Record<string, number> = { critical: 3, warning: 2, informational: 1 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });

    // PART 2: Return top alerts with branchId reference included
    if (alertsWithImpact.length > 0) {
      return alertsWithImpact.slice(0, 5).map(alert => ({
        ...alert,
        estimatedRevenueImpact: safeRevenueImpact(alert),
        moneyImpactTHB: safeRevenueImpact(alert),
        // PART 2: Ensure branchId is included (already on alert, but ensure it's preserved)
        branchId: alert.branchId,
      }));
    }

    // Fallback: Sort critical alerts by confidence
    alertsWithoutImpact.sort((a, b) => {
      return (b.confidence || 0) - (a.confidence || 0);
    });

    return alertsWithoutImpact.slice(0, 5).map(alert => ({
      ...alert,
      estimatedRevenueImpact: 0,
      moneyImpactTHB: 0,
    }));
  }, [safeAlerts, layoutVariant, viewType]);

  const handleViewAll = () => {
    const href = viewType === 'company' ? paths.companyAlerts : paths.branchAlerts;
    if (href) router.push(href);
  };

  const isCompanyToday = layoutVariant === 'companyToday' && viewType === 'company';
  const sectionTitle = isCompanyToday
    ? locale === 'th'
      ? 'การแจ้งเตือนวิกฤติ'
      : 'Critical Alerts'
    : locale === 'th'
      ? 'ภาพรวมการแจ้งเตือนที่สำคัญ'
      : 'Critical Alerts Snapshot';

  const resolveAlertTitle = (alert: AlertContract, extended: ExtendedAlertContract): string => {
    let alertTitle = extended.revenueImpactTitle;
    if (!alertTitle && alert.message) {
      const firstSentence = alert.message.split('.')[0].trim();
      alertTitle = firstSentence.replace(/:\s*0(\.\d+)?\s*$/, '').trim() || firstSentence;
      if (alertTitle.includes(':') && alertTitle.split(':').length > 1) {
        const parts = alertTitle.split(':');
        alertTitle = parts[parts.length - 1].trim() || parts[0].trim();
      }
    }
    if (!alertTitle || alertTitle === alert.id) {
      alertTitle = alert.id
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
        .replace(/liquidity runway risk/gi, 'Liquidity Runway Risk');
    }
    return alertTitle;
  };

  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!isCompanyToday && (
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.5rem' }}>
            {locale === 'th'
              ? 'ปัญหาที่อาจทำให้คุณสูญเสียเงินในขณะนี้'
              : 'These issues may be costing you money right now.'}
          </div>
        )}

        {topAlerts.length === 0 ? (
          <div
            style={{
              padding: '1.25rem',
              textAlign: 'center',
              backgroundColor: alertsInitializing ? '#fefce8' : isCompanyToday ? '#f9fafb' : '#f0fdf4',
              border: alertsInitializing
                ? '1px solid #fef08a'
                : isCompanyToday
                  ? '1px solid #e5e7eb'
                  : '1px solid #bbf7d0',
              borderRadius: '6px',
            }}
          >
            {alertsInitializing ? (
              <>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#854d0e', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? 'กำลังเตรียมความพร้อมของระบบ' : 'Operational Intelligence initializing'}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {locale === 'th'
                    ? 'บันทึกข้อมูลอย่างน้อย 7 วันเพื่อเปิดใช้งานการแจ้งเตือน'
                    : 'Log 7 days of data to activate alerts.'}
                </div>
              </>
            ) : isCompanyToday ? (
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                {locale === 'th'
                  ? 'ยังไม่มีการแจ้งเตือน — บันทึกข้อมูลรายวันเพื่อให้ระบบประเมินความเสี่ยง'
                  : 'No alerts yet — keep logging daily metrics so the system can surface risks.'}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>
                  {locale === 'th' ? '✓ ระบบเสถียร' : '✓ System Stable'}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {locale === 'th' ? 'ยังไม่พบความเสี่ยงที่ต้องดำเนินการ' : 'No risks requiring action at this time.'}
                </div>
              </>
            )}
          </div>
        ) : isCompanyToday ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {topAlerts.map((alert) => {
                const extended = alert as ExtendedAlertContract;
                const impact = safeRevenueImpact(alert);
                const alertTitle = resolveAlertTitle(alert, extended);
                const branchName =
                  alert.branchId && branchNamesMap.has(alert.branchId)
                    ? branchNamesMap.get(alert.branchId)!
                    : locale === 'th'
                      ? 'ทั้งองค์กร'
                      : 'Organization';
                const cause =
                  alert.contributingFactors?.[0]?.factor ||
                  alert.message?.split('.').slice(0, 2).join('.').trim() ||
                  '—';
                const actionLine =
                  extended.revenueImpactDescription ||
                  alert.conditions?.find((c) => /recommend|action|review/i.test(c)) ||
                  alert.conditions?.[alert.conditions.length - 1] ||
                  (locale === 'th' ? 'ดูรายละเอียดในหน้าการแจ้งเตือน' : 'Review full alerts for next steps.');
                return (
                  <div
                    key={`${alert.id}-${alert.branchId ?? ''}`}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>
                      {branchName}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                      {alertTitle}
                    </div>
                    <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem', lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 600 }}>Cause:</span> {cause}
                    </div>
                    <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600 }}>Impact:</span>{' '}
                      {impact > 0 ? (
                        <span style={{ fontWeight: 600, color: '#b91c1c' }}>
                          ฿{formatCurrency(impact)} {locale === 'th' ? 'ต่อเดือน ความเสี่ยงต่อรายได้' : 'THB/mo at risk'}
                        </span>
                      ) : (
                        <span>{locale === 'th' ? 'ประเมินผลกระทบเมื่อมีข้อมูลเพิ่ม' : 'Impact TBD as data fills in'}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 600 }}>Action:</span> {actionLine}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleViewAll}
              style={{
                marginTop: '0.5rem',
                padding: '0.625rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {locale === 'th' ? 'ดูการแจ้งเตือนทั้งหมด' : 'View All Alerts'}
              <span>→</span>
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {topAlerts.map((alert) => {
                const severityColor = getSeverityColor(alert.severity);
                const extended = alert as ExtendedAlertContract;
                const impact = safeRevenueImpact(alert);
                
                // Get alert title - prefer revenueImpactTitle, fallback to clean message extraction
                let alertTitle = extended.revenueImpactTitle;
                if (!alertTitle && alert.message) {
                  // Extract first sentence, but clean up common patterns
                  const firstSentence = alert.message.split('.')[0].trim();
                  // Remove confusing patterns like ": 0" or ": 0.1" at the end
                  alertTitle = firstSentence.replace(/:\s*0(\.\d+)?\s*$/, '').trim() || firstSentence;
                  // If still looks like an ID or technical name, try to extract meaningful part
                  if (alertTitle.includes(':') && alertTitle.split(':').length > 1) {
                    const parts = alertTitle.split(':');
                    // Use the part after the colon if it's meaningful, otherwise use the part before
                    alertTitle = parts[parts.length - 1].trim() || parts[0].trim();
                  }
                }
                // Final fallback to alert ID if still no good title
                if (!alertTitle || alertTitle === alert.id) {
                  // Try to create a readable title from alert ID
                  alertTitle = alert.id
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())
                    .replace(/liquidity runway risk/gi, 'Liquidity Runway Risk');
                }
                
                const alertDescription = extended.revenueImpactDescription || alert.message;
                // Truncate description to one line
                const shortDescription = alertDescription.length > 80 
                  ? alertDescription.substring(0, 80) + '...'
                  : alertDescription;

                return (
                  <div
                    key={alert.id}
                    style={{
                      padding: '0.875rem 1rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    {/* Left: Alert Info */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      {/* Severity Dot */}
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: severityColor,
                        marginTop: '0.375rem',
                        flexShrink: 0,
                      }} />
                      
                      {/* Alert Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.25rem',
                          flexWrap: 'wrap',
                        }}>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: 600, 
                            color: '#0a0a0a',
                            lineHeight: '1.4',
                          }}>
                            {alertTitle}
                          </div>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: severityColor + '20',
                            color: severityColor,
                          }}>
                            {getSeverityLabel(alert.severity, locale)}
                          </span>
                        </div>
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#6b7280',
                          lineHeight: '1.4',
                          marginBottom: '0.25rem',
                        }}>
                          {shortDescription}
                        </div>
                        {/* PART 2: Display branch name for company view */}
                        {viewType === 'company' && alert.branchId && branchNamesMap.has(alert.branchId) && (
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                            {locale === 'th' ? 'สาขา: ' : 'Branch: '}
                            <span style={{ fontWeight: 500 }}>
                              {branchNamesMap.get(alert.branchId)}
                            </span>
                          </div>
                        )}
                        {impact > 0 && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {locale === 'th' ? 'ผลกระทบโดยประมาณ: ' : 'Estimated impact: '}
                            <span style={{ fontWeight: 600, color: '#ef4444' }}>
                              ฿{formatCurrency(impact)} / {locale === 'th' ? 'เดือน' : 'month'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* View All Button */}
            <button
              onClick={handleViewAll}
              style={{
                marginTop: '0.5rem',
                padding: '0.625rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#9ca3af';
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {locale === 'th' ? 'ดูการแจ้งเตือนทั้งหมด' : 'View All Alerts'}
              <span>→</span>
            </button>
          </>
        )}
      </div>
  );

  if (isCompanyToday) {
    return inner;
  }

  return <SectionCard title={sectionTitle}>{inner}</SectionCard>;
}
