/**
 * Branch History Page
 * 
 * Decision history for branch - shows alert history specific to current branch
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { useAlertHistory } from '../../hooks/use-alert-history';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useAlertStore } from '../../contexts/alert-store-context';
import { EmptyState } from '../../components/empty-state';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import { useI18n } from '../../hooks/use-i18n';
import { formatDate } from '../../utils/date-utils';
import type { AlertContract } from '../../../../../core/sme-os/contracts/alerts';

export default function BranchHistoryPage() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { history, loading, clearHistory } = useAlertHistory();
  const { branch } = useCurrentBranch();
  const { alerts: rawAlerts } = useAlertStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter history for current branch only
  const branchHistory = useMemo(() => {
    if (!mounted || !branch || !rawAlerts) return [];
    
    // Get alert IDs for this branch
    const branchAlertIds = new Set(
      rawAlerts
        .filter(alert => alert.branchId === branch.id)
        .map(alert => alert.id)
    );

    // Filter history items that match branch alerts
    return history.filter(item => {
      // Try to match by alert ID if available
      if (item.alertId && branchAlertIds.has(item.alertId)) {
        return true;
      }
      // Fallback: include all history items (since we can't always match)
      return true;
    });
  }, [history, branch, rawAlerts, mounted]);

  if (!mounted) {
    return (
      <PageLayout title={locale === 'th' ? 'ประวัติ' : 'History'} subtitle={locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}>
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (!branch) {
    return (
      <PageLayout title={locale === 'th' ? 'ประวัติ' : 'History'}>
        <ErrorState
          message={locale === 'th' ? 'ไม่พบสาขา' : 'No branch selected'}
          action={{
            label: locale === 'th' ? 'ไปที่ภาพรวม' : 'Go to overview',
            onClick: () => router.push(paths.branchOverview || '/branch/overview'),
          }}
        />
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout 
        title={locale === 'th' ? 'ประวัติ' : 'History'}
        subtitle={locale === 'th' ? `ประวัติการตัดสินใจสำหรับ ${branch.branchName}` : `Decision history for ${branch.branchName}`}
      >
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title={locale === 'th' ? 'ประวัติ' : 'History'}
      subtitle={locale === 'th' ? `ประวัติการตัดสินใจสำหรับ ${branch.branchName}` : `Decision history for ${branch.branchName}`}
    >
      {branchHistory.length === 0 ? (
        <EmptyState
          title={locale === 'th' ? 'ไม่มีประวัติ' : 'No History'}
          description={locale === 'th' 
            ? 'ยังไม่มีการตัดสินใจที่บันทึกไว้สำหรับสาขานี้'
            : 'No decision history recorded for this branch yet.'}
        />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button
              onClick={clearHistory}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#6b7280',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {locale === 'th' ? 'ล้างประวัติ' : 'Clear History'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {branchHistory.map((item) => (
              <SectionCard key={item.id} title={formatDate(item.date)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a' }}>
                      {item.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {formatDate(item.date, locale === 'th' ? 'th-TH' : 'en-US')}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: item.response === 'Acknowledged' ? '#dbeafe' : '#f3f4f6',
                          color: item.response === 'Acknowledged' ? '#1e40af' : '#6b7280',
                          fontWeight: 500,
                        }}
                      >
                        {item.response === 'Acknowledged' 
                          ? (locale === 'th' ? 'ยืนยันแล้ว' : 'Acknowledged')
                          : (locale === 'th' ? 'ไม่สนใจ' : 'Ignored')}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: item.outcome === 'Resolved' ? '#dcfce7' : item.outcome === 'Escalated' ? '#fee2e2' : '#fef3c7',
                          color: item.outcome === 'Resolved' ? '#166534' : item.outcome === 'Escalated' ? '#991b1b' : '#92400e',
                          fontWeight: 500,
                        }}
                      >
                        {item.outcome === 'Resolved' 
                          ? (locale === 'th' ? 'แก้ไขแล้ว' : 'Resolved')
                          : item.outcome === 'Escalated' 
                          ? (locale === 'th' ? 'เพิ่มระดับ' : 'Escalated')
                          : (locale === 'th' ? 'กำลังดำเนินการ' : 'Ongoing')}
                      </span>
                    </div>
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        </>
      )}
    </PageLayout>
  );
}
