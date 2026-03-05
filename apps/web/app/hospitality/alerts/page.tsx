// Alert List Page - Phase 4 MVP
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { PageLayout } from '../../components/page-layout';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { EmptyState } from '../../components/empty-state';
import { SkeletonCard } from '../../components/skeleton-loader';
import { AlertSuppressionNotice } from '../../components/alert-suppression-notice';
import { getSeverityColor, getSeverityLabel, getTimeHorizonLabel, getAlertTypeColor, getAlertTypeLabel, sortAlertsBySeverity } from '../../utils/alert-utils';
import { formatDateTime } from '../../utils/date-utils';
import { exportAlertsToCSV } from '../../utils/export-utils';
import { useI18n } from '../../hooks/use-i18n';
import { businessGroupService } from '../../services/business-group-service';
import { getRevenueImpactCopy, getAlertListSummary } from '../../utils/revenue-impact-copy';

export default function AlertListPage() {
  const { alerts, loading, error, refreshAlerts, suppressionInfo } = useHospitalityAlerts();
  const { branch, isAllBranches } = useCurrentBranch();
  const { t, locale } = useI18n();
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'informational'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'risk' | 'opportunity'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Apply filters - MUST be called before any early returns to maintain hook order
  const filteredAlerts = useMemo(() => {
    let filtered = [...alerts];
    
    // Filter by branch if not in "All Branches" view
    if (!isAllBranches && branch) {
      filtered = filtered.filter(a => {
        const alertBranchId = (a as any).branchId;
        return alertBranchId === branch.id || !alertBranchId; // Include alerts without branchId for backward compatibility
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => {
        const title = (a.title || '').toLowerCase();
        const message = (a.message || '').toLowerCase();
        const id = a.id.toLowerCase();
        return title.includes(query) || message.includes(query) || id.includes(query);
      });
    }
    
    // Filter by severity
    if (severityFilter !== 'all') {
      filtered = filtered.filter(a => a.severity === severityFilter);
    }
    
    // Filter by type (risk vs opportunity)
    if (typeFilter !== 'all') {
      filtered = filtered.filter(a => {
        const alertType = (a as any).type || 'risk';
        return alertType === typeFilter;
      });
    }
    
    return filtered;
  }, [alerts, severityFilter, typeFilter, searchQuery, branch, isAllBranches]);

  const sortedAlerts = sortAlertsBySeverity(filteredAlerts);

  if (loading) {
    return (
      <PageLayout 
        title={t('hospitality.alerts.title')} 
        subtitle={t('hospitality.alerts.subtitle')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout 
        title={t('hospitality.alerts.title')} 
        subtitle={t('hospitality.alerts.subtitle')}
      >
        <ErrorState
          message={error.message}
          action={{
            label: t('common.retry'),
            onClick: refreshAlerts,
          }}
        />
      </PageLayout>
    );
  }

  // Group alerts by category
  const categorizeAlert = (alert: typeof alerts[0]): 'cash' | 'demand' | 'cost' => {
    const id = alert.id.toLowerCase();
    const message = alert.message.toLowerCase();
    
    if (alert.domain === 'cash' || id.includes('cash') || message.includes('cash')) {
      return 'cash';
    }
    if (id.includes('demand') || id.includes('occupancy') || id.includes('seasonal') || 
        message.includes('demand') || message.includes('occupancy') || message.includes('revenue')) {
      return 'demand';
    }
    if (id.includes('cost') || id.includes('margin') || id.includes('pressure') ||
        message.includes('cost') || message.includes('margin') || message.includes('pressure')) {
      return 'cost';
    }
    // Default to risk category
    return 'demand';
  };

  const alertsByCategory = {
    cash: sortedAlerts.filter(a => categorizeAlert(a) === 'cash'),
    demand: sortedAlerts.filter(a => categorizeAlert(a) === 'demand'),
    cost: sortedAlerts.filter(a => categorizeAlert(a) === 'cost'),
  };

  if (sortedAlerts.length === 0 && alerts.length === 0) {
    return (
      <PageLayout 
        title={t('hospitality.alerts.title')} 
        subtitle={t('hospitality.alerts.subtitle')}
      >
        <EmptyState
          title={t('hospitality.alerts.noAlerts')}
          description={t('hospitality.alerts.noAlertsDesc')}
          action={{
            label: locale === 'th' ? 'อัปเดตข้อมูล' : 'Update Data',
            onClick: () => window.location.href = '/hospitality/data-entry',
          }}
        />
      </PageLayout>
    );
  }

  if (sortedAlerts.length === 0 && alerts.length > 0) {
    return (
      <PageLayout 
        title={t('hospitality.alerts.title')} 
        subtitle={t('hospitality.alerts.subtitle')}
      >
        <EmptyState
          title={locale === 'th' ? 'ไม่พบการแจ้งเตือนที่ตรงกับตัวกรอง' : 'No alerts match your filters'}
          description={locale === 'th' 
            ? 'ลองเปลี่ยนตัวกรองเพื่อดูการแจ้งเตือนอื่น ๆ'
            : 'Try adjusting your filters to see other alerts'}
          action={{
            label: locale === 'th' ? 'ล้างตัวกรอง' : 'Clear Filters',
            onClick: () => {
              setSeverityFilter('all');
              setTypeFilter('all');
              setSearchQuery('');
            },
          }}
        />
      </PageLayout>
    );
  }

  const plural = sortedAlerts.length !== 1 ? (locale === 'th' ? '' : 's') : '';
  const displaySubtitle = isAllBranches
    ? t('hospitality.alerts.subtitleWithCount', { count: sortedAlerts.length, plural })
    : branch
    ? `${branch.branchName} • ${t('hospitality.alerts.subtitleWithCount', { count: sortedAlerts.length, plural })}`
    : t('hospitality.alerts.subtitleWithCount', { count: sortedAlerts.length, plural });
  
  return (
    <PageLayout 
      title={t('hospitality.alerts.title')} 
      subtitle={displaySubtitle}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Alert List Summary */}
        {sortedAlerts.length > 0 && (
          <div
            style={{
              padding: '1rem 1.5rem',
              backgroundColor: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '8px',
            }}
          >
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#92400e', margin: 0, lineHeight: '1.6' }}>
              {getAlertListSummary(sortedAlerts.length, locale)}
            </p>
          </div>
        )}
        
        {/* Early Warning Explanation Banner */}
        <div style={{
          border: '1px solid #dbeafe',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          backgroundColor: '#eff6ff',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 600,
              flexShrink: 0,
              marginTop: '2px',
            }}>
              i
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#1e40af', marginBottom: '0.5rem', marginTop: 0 }}>
                {locale === 'th' 
                  ? 'การแจ้งเตือนคือสัญญาณเตือนล่วงหน้า — ไม่ใช่ความล้มเหลว'
                  : 'Alerts are early signals — not failures'}
              </h4>
              <p style={{ fontSize: '14px', color: '#1e3a8a', margin: 0, lineHeight: '1.6' }}>
                {locale === 'th'
                  ? 'การแจ้งเตือนเหล่านี้เน้นแนวโน้มที่อาจกลายเป็นความเสี่ยงหากไม่มีการดำเนินการ พวกเขาไม่ใช่ข้อผิดพลาดหรือความล้มเหลวของธุรกิจ'
                  : 'These alerts highlight trends that may become risky if no action is taken. They are not errors or business failures.'}
              </p>
            </div>
          </div>
        </div>

        {/* Filters and Summary Bar */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '1rem',
        }}>
          {/* Search and Filters */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            gap: '1rem',
          }}>
            {/* Search Bar */}
            <div style={{
              position: 'relative',
            }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={locale === 'th' ? 'ค้นหาการแจ้งเตือน...' : 'Search alerts...'}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  fontSize: '14px',
                  color: '#374151',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '16px',
                  color: '#9ca3af',
                }}
              >
                🔍
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={locale === 'th' ? 'ล้างการค้นหา' : 'Clear search'}
                >
                  ×
                </button>
              )}
            </div>
            
            {/* Filters */}
            <div style={{ 
              display: 'flex', 
              gap: '1rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              padding: '1rem',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                {locale === 'th' ? 'กรองตาม:' : 'Filter by:'}
              </label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  fontSize: '14px',
                  color: '#374151',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="all">{locale === 'th' ? 'ทุกระดับความรุนแรง' : 'All Severities'}</option>
                <option value="critical">{t('hospitality.alerts.critical')}</option>
                <option value="warning">{t('hospitality.alerts.warning')}</option>
                <option value="informational">{t('hospitality.alerts.info')}</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  fontSize: '14px',
                  color: '#374151',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="all">{locale === 'th' ? 'ทุกประเภท' : 'All Types'}</option>
                <option value="risk">{locale === 'th' ? 'ความเสี่ยง' : 'Risks'}</option>
                <option value="opportunity">{locale === 'th' ? 'โอกาส' : 'Opportunities'}</option>
              </select>
            </div>
          </div>

          {/* Summary Bar */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '1rem 1.25rem', 
            backgroundColor: '#f9fafb', 
            borderRadius: '8px', 
            border: '1px solid #e5e7eb',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              fontSize: '14px', 
              color: '#6b7280', 
              flexWrap: 'wrap',
              flex: 1,
            }}>
              <span>
                <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.critical')}:</strong> {alerts.filter(a => a.severity === 'critical').length}
              </span>
              <span>
                <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.warning')}:</strong> {alerts.filter(a => a.severity === 'warning').length}
              </span>
              <span>
                <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.info')}:</strong> {alerts.filter(a => a.severity === 'informational').length}
              </span>
              <span>
                <strong style={{ color: '#374151', fontWeight: 500 }}>{locale === 'th' ? 'โอกาส:' : 'Opportunities:'}</strong> {alerts.filter(a => (a as any).type === 'opportunity').length}
              </span>
              <span>
                <strong style={{ color: '#374151', fontWeight: 500 }}>{locale === 'th' ? 'แสดง:' : 'Showing:'}</strong> {sortedAlerts.length} / {alerts.length}
              </span>
            </div>
            <div style={{ 
              display: 'flex', 
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}>
              {sortedAlerts.length > 0 && (
                <button
                  onClick={() => exportAlertsToCSV(sortedAlerts)}
                  aria-label={locale === 'th' ? 'ส่งออก CSV' : 'Export CSV'}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#9ca3af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = '2px solid #3b82f6';
                    e.currentTarget.style.outlineOffset = '2px';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  <span>📥</span>
                  <span>{locale === 'th' ? 'ส่งออก' : 'Export'}</span>
                </button>
              )}
              <button
                onClick={refreshAlerts}
                aria-label={t('hospitality.alerts.refresh')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = '2px solid #3b82f6';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                {t('hospitality.alerts.refresh')}
              </button>
            </div>
          </div>
        </div>

        {/* Alert Suppression Notice */}
        {suppressionInfo && suppressionInfo.isSuppressed && (
          <AlertSuppressionNotice suppressionInfo={suppressionInfo} />
        )}

        {/* Update Data CTA */}
        {!suppressionInfo?.isSuppressed && (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            backgroundColor: '#f9fafb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
              {locale === 'th'
                ? 'อัปเดตข้อมูลเพื่อปรับปรุงความแม่นยำของการแจ้งเตือน'
                : 'Update data to improve alert accuracy'}
            </p>
            <Link
              href="/hospitality/data-entry"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                backgroundColor: '#0a0a0a',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0a0a0a';
              }}
            >
              {locale === 'th' ? 'อัปเดตข้อมูล' : 'Update Data'}
            </Link>
          </div>
        )}

        {/* Alert List - Grouped by Category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Cash Alerts */}
          {alertsByCategory.cash.length > 0 && (
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
                {locale === 'th' ? 'การแจ้งเตือนด้านเงินสด' : 'Cash Alerts'}
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1rem', lineHeight: '1.6' }}>
                {getAlertListSummary(alertsByCategory.cash.length, locale)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {alertsByCategory.cash.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/hospitality/alerts/${alert.id}`}
                    style={{
                      display: 'block',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      backgroundColor: '#ffffff',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em' }}>
                            {alert.title}
                          </h3>
                          <span
                            style={{
                              fontSize: '12px',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '6px',
                              backgroundColor: getSeverityColor(alert.severity),
                              color: '#ffffff',
                              fontWeight: 500,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {getSeverityLabel(alert.severity, locale)}
                          </span>
                          {(alert as any).type === 'opportunity' && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '0.25rem 0.625rem',
                                borderRadius: '6px',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                fontWeight: 600,
                                letterSpacing: '0.01em',
                                textTransform: 'uppercase',
                              }}
                            >
                              {locale === 'th' ? 'โอกาส' : 'Opportunity'}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '15px', color: '#374151', marginBottom: '1rem', lineHeight: '1.5' }}>
                          {alert.message}
                        </p>
                        {/* Revenue Impact */}
                        <div
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fde68a',
                            borderRadius: '6px',
                            marginBottom: '1rem',
                          }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem', marginTop: 0 }}>
                            {getRevenueImpactCopy(alert.severity, locale).summary}
                          </p>
                          <p style={{ fontSize: '12px', color: '#78350f', margin: 0, lineHeight: '1.5' }}>
                            {getRevenueImpactCopy(alert.severity, locale).explanation}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280' }}>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.confidence')}:</strong> {Math.round(((alert as any).confidenceAdjusted !== undefined 
                              ? (alert as any).confidenceAdjusted 
                              : alert.confidence) * 100)}%
                            {(alert as any).confidenceDecayReason && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }}>↓</span>
                            )}
                          </span>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.timeHorizon')}:</strong> {getTimeHorizonLabel(alert.timeHorizon, locale)}
                          </span>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.evaluated')}:</strong> {formatDateTime(alert.timestamp, locale === 'th' ? 'th-TH' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Demand Alerts */}
          {alertsByCategory.demand.length > 0 && (
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
                {locale === 'th' ? 'การแจ้งเตือนด้านความต้องการ' : 'Demand Alerts'}
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1rem', lineHeight: '1.6' }}>
                {getAlertListSummary(alertsByCategory.demand.length, locale)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {alertsByCategory.demand.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/hospitality/alerts/${alert.id}`}
                    style={{
                      display: 'block',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      backgroundColor: '#ffffff',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em' }}>
                            {alert.title}
                          </h3>
                          <span
                            style={{
                              fontSize: '12px',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '6px',
                              backgroundColor: getSeverityColor(alert.severity),
                              color: '#ffffff',
                              fontWeight: 500,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {getSeverityLabel(alert.severity, locale)}
                          </span>
                          {(alert as any).type === 'opportunity' && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '0.25rem 0.625rem',
                                borderRadius: '6px',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                fontWeight: 600,
                                letterSpacing: '0.01em',
                                textTransform: 'uppercase',
                              }}
                            >
                              {locale === 'th' ? 'โอกาส' : 'Opportunity'}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '15px', color: '#374151', marginBottom: '1rem', lineHeight: '1.5' }}>
                          {alert.message}
                        </p>
                        {/* Revenue Impact */}
                        <div
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fde68a',
                            borderRadius: '6px',
                            marginBottom: '1rem',
                          }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem', marginTop: 0 }}>
                            {getRevenueImpactCopy(alert.severity, locale).summary}
                          </p>
                          <p style={{ fontSize: '12px', color: '#78350f', margin: 0, lineHeight: '1.5' }}>
                            {getRevenueImpactCopy(alert.severity, locale).explanation}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280' }}>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.confidence')}:</strong> {Math.round(((alert as any).confidenceAdjusted !== undefined 
                              ? (alert as any).confidenceAdjusted 
                              : alert.confidence) * 100)}%
                            {(alert as any).confidenceDecayReason && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }}>↓</span>
                            )}
                          </span>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.timeHorizon')}:</strong> {getTimeHorizonLabel(alert.timeHorizon, locale)}
                          </span>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.evaluated')}:</strong> {formatDateTime(alert.timestamp, locale === 'th' ? 'th-TH' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Cost Alerts */}
          {alertsByCategory.cost.length > 0 && (
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
                {locale === 'th' ? 'การแจ้งเตือนด้านต้นทุน' : 'Cost Alerts'}
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1rem', lineHeight: '1.6' }}>
                {getAlertListSummary(alertsByCategory.cost.length, locale)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {alertsByCategory.cost.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/hospitality/alerts/${alert.id}`}
                    style={{
                      display: 'block',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      backgroundColor: '#ffffff',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', margin: 0, letterSpacing: '-0.01em' }}>
                            {alert.title}
                          </h3>
                          <span
                            style={{
                              fontSize: '12px',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '6px',
                              backgroundColor: getSeverityColor(alert.severity),
                              color: '#ffffff',
                              fontWeight: 500,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {getSeverityLabel(alert.severity, locale)}
                          </span>
                          {(alert as any).type === 'opportunity' && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '0.25rem 0.625rem',
                                borderRadius: '6px',
                                backgroundColor: '#10b981',
                                color: '#ffffff',
                                fontWeight: 600,
                                letterSpacing: '0.01em',
                                textTransform: 'uppercase',
                              }}
                            >
                              {locale === 'th' ? 'โอกาส' : 'Opportunity'}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '15px', color: '#374151', marginBottom: '1rem', lineHeight: '1.5' }}>
                          {alert.message}
                        </p>
                        {/* Revenue Impact */}
                        <div
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fde68a',
                            borderRadius: '6px',
                            marginBottom: '1rem',
                          }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem', marginTop: 0 }}>
                            {getRevenueImpactCopy(alert.severity, locale).summary}
                          </p>
                          <p style={{ fontSize: '12px', color: '#78350f', margin: 0, lineHeight: '1.5' }}>
                            {getRevenueImpactCopy(alert.severity, locale).explanation}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '13px', color: '#6b7280' }}>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.confidence')}:</strong> {Math.round(((alert as any).confidenceAdjusted !== undefined 
                              ? (alert as any).confidenceAdjusted 
                              : alert.confidence) * 100)}%
                            {(alert as any).confidenceDecayReason && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }}>↓</span>
                            )}
                          </span>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.timeHorizon')}:</strong> {getTimeHorizonLabel(alert.timeHorizon, locale)}
                          </span>
                          <span>
                            <strong style={{ color: '#374151', fontWeight: 500 }}>{t('hospitality.alerts.evaluated')}:</strong> {formatDateTime(alert.timestamp, locale === 'th' ? 'th-TH' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
