/**
 * Group Alerts Page
 * 
 * Cross-vertical alerts view for group context
 * Shows alerts across all branches, grouped by patterns and business types
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { PageLayout } from '../../components/page-layout';
import { useI18n } from '../../hooks/use-i18n';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';
import { useAlertStore } from '../../contexts/alert-store-context';
import { businessGroupService } from '../../services/business-group-service';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { EmptyState } from '../../components/empty-state';
import { getSeverityColor, getSeverityLabel, sortAlertsBySeverity } from '../../utils/alert-utils';
import { formatDateTime } from '../../utils/date-utils';
import { exportAlertsToCSV } from '../../utils/export-utils';
import { AlertSuppressionNotice } from '../../components/alert-suppression-notice';
import { useSystemValidation } from '../../hooks/use-system-validation';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';
import { ModuleType } from '../../models/business-group';

export default function GroupAlertsPage() {
  const { locale, t } = useI18n();
  const { alerts, loading, error, refreshAlerts, suppressionInfo } = useHospitalityAlerts();
  const { alerts: rawAlerts } = useAlertStore();
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'informational'>('all');
  const [businessTypeFilter, setBusinessTypeFilter] = useState<'all' | 'hotel' | 'cafe'>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // PART 1: System validation (development only)
  useSystemValidation({ enabled: process.env.NODE_ENV === 'development', interval: 60000 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const businessGroup = useMemo(() => {
    if (!mounted) return null;
    return businessGroupService.getBusinessGroup();
  }, [mounted]);

  const branches = useMemo(() => {
    if (!mounted || !businessGroup) return [];
    return businessGroupService.getAllBranches().filter(b => b.businessGroupId === businessGroup.id);
  }, [businessGroup, mounted]);

  // Identify cross-vertical alerts (alerts that appear in multiple branches or affect multiple business types)
  const crossVerticalAlerts = useMemo(() => {
    if (!mounted || !rawAlerts || !businessGroup) return [];

    // Group alerts by alert ID to find duplicates across branches
    const alertsById = new Map<string, AlertContract[]>();
    rawAlerts.forEach(alert => {
      if (alert.id) {
        const existing = alertsById.get(alert.id) || [];
        existing.push(alert);
        alertsById.set(alert.id, existing);
      }
    });

    // Find alerts that appear in multiple branches
    const multiBranchAlerts = new Set<string>();
    alertsById.forEach((alertList, alertId) => {
      const branchIds = new Set(alertList.map(a => a.branchId).filter(Boolean));
      if (branchIds.size > 1) {
        multiBranchAlerts.add(alertId);
      }
    });

    // Filter alerts: include if appears in multiple branches OR affects multiple business types
    return rawAlerts.filter(alert => {
      // Must belong to this business group
      if (alert.businessGroupId && alert.businessGroupId !== businessGroup.id) {
        return false;
      }

      // Include if appears in multiple branches
      if (alert.id && multiBranchAlerts.has(alert.id)) {
        return true;
      }

      // Include group-level alerts (no branchId)
      if (!alert.branchId) {
        return true;
      }

      return false;
    });
  }, [rawAlerts, businessGroup, mounted]);

  // Apply filters
  const filteredAlerts = useMemo(() => {
    let filtered = [...crossVerticalAlerts];

    // Filter by severity
    if (severityFilter !== 'all') {
      filtered = filtered.filter(a => a.severity === severityFilter);
    }

    // Filter by module type
    if (businessTypeFilter !== 'all') {
      filtered = filtered.filter(alert => {
        const branch = branches.find(b => b.id === alert.branchId);
        if (!branch) return false;
        
        if (businessTypeFilter === 'hotel') {
          return branch.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
        } else if (businessTypeFilter === 'cafe') {
          return branch.modules?.includes(ModuleType.FNB) ?? false;
        }
        return true;
      });
    }

    // Filter by branch
    if (branchFilter !== 'all') {
      filtered = filtered.filter(a => a.branchId === branchFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => {
        const message = (a.message || '').toLowerCase();
        const id = a.id.toLowerCase();
        return message.includes(query) || id.includes(query);
      });
    }

    return filtered;
  }, [crossVerticalAlerts, severityFilter, businessTypeFilter, branchFilter, searchQuery, branches]);

  // Convert to HospitalityAlert format for sorting
  const sortedAlerts = sortAlertsBySeverity(filteredAlerts.map(alert => ({
    id: alert.id,
    timestamp: alert.timestamp,
    type: (alert as any).type || 'risk',
    severity: alert.severity,
    category: 'revenue' as const,
    timeHorizon: alert.timeHorizon,
    title: alert.message.split('.')[0] || alert.message.substring(0, 50),
    message: alert.message,
    confidence: alert.confidence,
    context: alert.message,
  })) as any);

  // Group alerts by alert ID to show which branches are affected
  const alertsByPattern = useMemo(() => {
    const patternMap = new Map<string, {
      alert: AlertContract;
      branches: string[];
      branchNames: string[];
    }>();

    filteredAlerts.forEach(alert => {
      const key = alert.id || alert.message;
      const existing = patternMap.get(key);
      
      if (existing) {
        if (alert.branchId && !existing.branches.includes(alert.branchId)) {
          existing.branches.push(alert.branchId);
          const branch = branches.find(b => b.id === alert.branchId);
          if (branch) {
            existing.branchNames.push(branch.branchName);
          }
        }
      } else {
        const branchNames: string[] = [];
        if (alert.branchId) {
          const branch = branches.find(b => b.id === alert.branchId);
          if (branch) {
            branchNames.push(branch.branchName);
          }
        } else {
          branchNames.push(locale === 'th' ? 'ระดับกลุ่ม' : 'Group Level');
        }

        patternMap.set(key, {
          alert,
          branches: alert.branchId ? [alert.branchId] : [],
          branchNames,
        });
      }
    });

    return Array.from(patternMap.values());
  }, [filteredAlerts, branches, locale]);

  const alertCounts = {
    critical: filteredAlerts.filter(a => a.severity === 'critical').length,
    warning: filteredAlerts.filter(a => a.severity === 'warning').length,
    informational: filteredAlerts.filter(a => a.severity === 'informational').length,
    total: filteredAlerts.length,
  };

  if (loading) {
    return (
      <PageLayout 
        title={locale === 'th' ? 'การแจ้งเตือนข้ามแนวตั้ง' : 'Cross-Vertical Alerts'}
        subtitle={locale === 'th' ? 'ภาพรวมการแจ้งเตือนระดับกลุ่ม' : 'Group-level alerts overview'}
      >
        <LoadingSpinner />
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout 
        title={locale === 'th' ? 'การแจ้งเตือนข้ามแนวตั้ง' : 'Cross-Vertical Alerts'}
        subtitle={locale === 'th' ? 'ภาพรวมการแจ้งเตือนระดับกลุ่ม' : 'Group-level alerts overview'}
      >
        <ErrorState
          message={error.message}
          action={{
            label: locale === 'th' ? 'ลองอีกครั้ง' : 'Retry',
            onClick: refreshAlerts,
          }}
        />
      </PageLayout>
    );
  }

  if (filteredAlerts.length === 0 && !loading) {
    return (
      <PageLayout 
        title={locale === 'th' ? 'การแจ้งเตือนข้ามแนวตั้ง' : 'Cross-Vertical Alerts'}
        subtitle={locale === 'th' ? 'ภาพรวมการแจ้งเตือนระดับกลุ่ม' : 'Group-level alerts overview'}
      >
        <EmptyState
          title={locale === 'th' ? 'ไม่มีการแจ้งเตือน' : 'No Cross-Vertical Alerts'}
          description={locale === 'th' 
            ? 'ไม่มีการแจ้งเตือนที่ส่งผลกระทบหลายสาขาหรือหลายแนวตั้งในขณะนี้'
            : 'No alerts affecting multiple branches or verticals at this time.'}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title={locale === 'th' ? 'การแจ้งเตือนข้ามแนวตั้ง' : 'Cross-Vertical Alerts'}
      subtitle={locale === 'th' ? 'ภาพรวมการแจ้งเตือนระดับกลุ่ม' : 'Group-level alerts overview'}
    >
      {/* Suppression Notice */}
      {suppressionInfo && <AlertSuppressionNotice suppressionInfo={suppressionInfo} />}

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1.5rem',
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
      }}>
        {/* Search */}
        <div>
          <input
            type="text"
            placeholder={locale === 'th' ? 'ค้นหาการแจ้งเตือน...' : 'Search alerts...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Filter Row */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="all">{locale === 'th' ? 'ทุกระดับความรุนแรง' : 'All Severities'}</option>
            <option value="critical">{locale === 'th' ? 'วิกฤต' : 'Critical'}</option>
            <option value="warning">{locale === 'th' ? 'คำเตือน' : 'Warning'}</option>
            <option value="informational">{locale === 'th' ? 'ข้อมูล' : 'Informational'}</option>
          </select>

          {/* Business Type Filter */}
          <select
            value={businessTypeFilter}
            onChange={(e) => setBusinessTypeFilter(e.target.value as any)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="all">{locale === 'th' ? 'ทุกประเภทธุรกิจ' : 'All Business Types'}</option>
            <option value="hotel">{locale === 'th' ? 'โรงแรม / รีสอร์ท' : 'Hotel / Resort'}</option>
            <option value="cafe">{locale === 'th' ? 'คาเฟ่ / ร้านอาหาร' : 'Café / Restaurant'}</option>
          </select>

          {/* Branch Filter */}
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="all">{locale === 'th' ? 'ทุกสาขา' : 'All Branches'}</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.branchName}</option>
            ))}
          </select>

          {/* Export Button */}
          <button
            onClick={() => exportAlertsToCSV(sortedAlerts)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            {locale === 'th' ? 'ส่งออก CSV' : 'Export CSV'}
          </button>
        </div>

        {/* Summary Stats */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '14px', color: '#6b7280' }}>
          <span>
            <strong style={{ color: '#0a0a0a' }}>{alertCounts.total}</strong> {locale === 'th' ? 'การแจ้งเตือนทั้งหมด' : 'total alerts'}
          </span>
          <span>
            <strong style={{ color: '#dc2626' }}>{alertCounts.critical}</strong> {locale === 'th' ? 'วิกฤต' : 'critical'}
          </span>
          <span>
            <strong style={{ color: '#f59e0b' }}>{alertCounts.warning}</strong> {locale === 'th' ? 'คำเตือน' : 'warning'}
          </span>
          <span>
            <strong style={{ color: '#3b82f6' }}>{alertCounts.informational}</strong> {locale === 'th' ? 'ข้อมูล' : 'informational'}
          </span>
        </div>
      </div>

      {/* Alerts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {alertsByPattern.map(({ alert, branchNames }, index) => {
          const severityColor = getSeverityColor(alert.severity);
          const severityLabel = getSeverityLabel(alert.severity, locale);

          return (
            <div
              key={`${alert.id}-${index}`}
              style={{
                padding: '1.5rem',
                backgroundColor: '#ffffff',
                border: `1px solid ${severityColor}`,
                borderRadius: '8px',
                borderLeftWidth: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: severityColor,
                        color: '#ffffff',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {severityLabel}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {formatDateTime(alert.timestamp, locale)}
                    </span>
                    {alert.confidence && (
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {Math.round(alert.confidence * 100)}% {locale === 'th' ? 'ความมั่นใจ' : 'confidence'}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a' }}>
                    {alert.message.split('.')[0] || alert.message.substring(0, 100)}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', marginBottom: '0.75rem' }}>
                    {alert.message}
                  </p>
                  
                  {/* Affected Branches */}
                  {branchNames.length > 0 && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>
                        {locale === 'th' ? 'สาขาที่ได้รับผลกระทบ' : 'Affected Branches'}:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {branchNames.map((name, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: '#374151',
                            }}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageLayout>
  );
}
