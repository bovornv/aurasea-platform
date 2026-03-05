// Data History Page - View past operational signals
'use client';

import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { EmptyState } from '../../components/empty-state';
import { useI18n } from '../../hooks/use-i18n';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { formatDateTime } from '../../utils/date-utils';
import { formatCurrency } from '../../utils/formatting';
import { exportSignalsToCSV } from '../../utils/export-utils';
import { useBusinessSetup } from '../../contexts/business-setup-context';
import { useEffect, useState, useMemo } from 'react';
import { businessGroupService } from '../../services/business-group-service';
import type { OperationalSignal } from '../../services/operational-signals-service';

type SortOption = 'newest' | 'oldest' | 'cash-high' | 'cash-low';

export default function DataHistoryPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t, locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch, isAllBranches } = useCurrentBranch();
  const [signals, setSignals] = useState<OperationalSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  useEffect(() => {
    const businessGroup = businessGroupService.getBusinessGroup();
    const branchId = isAllBranches ? '__all__' : branch?.id || null;
    const allSignals = operationalSignalsService.getAllSignals(branchId, businessGroup?.id);
    setSignals(allSignals);
    setLoading(false);
  }, [branch, isAllBranches]);

  // Sort signals based on selected option
  const sortedSignals = useMemo(() => {
    const sorted = [...signals];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      case 'oldest':
        return sorted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      case 'cash-high':
        return sorted.sort((a, b) => b.cashBalance - a.cashBalance);
      case 'cash-low':
        return sorted.sort((a, b) => a.cashBalance - b.cashBalance);
      default:
        return sorted;
    }
  }, [signals, sortBy]);

  const displaySubtitle = isAllBranches
    ? t('dataHistory.subtitle')
    : branch
    ? `${branch.branchName} • ${t('dataHistory.subtitle')}`
    : t('dataHistory.subtitle');

  if (loading) {
    return (
      <PageLayout title={t('dataHistory.title')} subtitle={displaySubtitle}>
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('common.loading')}</p>
        </div>
      </PageLayout>
    );
  }

  if (signals.length === 0) {
    return (
      <PageLayout title={t('dataHistory.title')} subtitle={displaySubtitle}>
        <EmptyState
          title={locale === 'th' ? 'ยังไม่มีข้อมูล' : t('dataHistory.noData')}
          description={locale === 'th' ? 'เริ่มบันทึกข้อมูลวันแรก ระบบจะเริ่มวิเคราะห์ให้อัตโนมัติ' : t('dataHistory.noDataDescription')}
          action={{
            label: locale === 'th' ? 'เพิ่มข้อมูลวันนี้' : 'Add data today',
            onClick: () => router.push(paths.branchLog || '/branch/log-today'),
          }}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t('dataHistory.title')} subtitle={displaySubtitle}>
      {/* Export Button */}
      {signals.length > 0 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end',
          marginBottom: '1rem',
        }}>
          <button
            onClick={() => exportSignalsToCSV(signals)}
            style={{
              padding: '0.625rem 1.25rem',
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
            <span>{locale === 'th' ? 'ส่งออก CSV' : 'Export CSV'}</span>
          </button>
        </div>
      )}

      {/* Sort Controls */}
      {signals.length > 1 && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem', 
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
            {locale === 'th' ? 'เรียงตาม:' : 'Sort by:'}
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
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
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid #3b82f6';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            <option value="newest">{locale === 'th' ? 'ใหม่ที่สุด' : 'Newest first'}</option>
            <option value="oldest">{locale === 'th' ? 'เก่าที่สุด' : 'Oldest first'}</option>
            <option value="cash-high">{locale === 'th' ? 'เงินสดมากที่สุด' : 'Highest cash'}</option>
            <option value="cash-low">{locale === 'th' ? 'เงินสดน้อยที่สุด' : 'Lowest cash'}</option>
          </select>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {sortedSignals.map((signal, index) => {
          const isLatest = index === 0;
          const previousSignal = index < signals.length - 1 ? signals[index + 1] : null;
          
          return (
            <div
              key={signal.timestamp.getTime()}
              style={{
                border: isLatest ? '2px solid #0a0a0a' : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.75rem',
                backgroundColor: '#ffffff',
                boxShadow: isLatest ? '0 2px 4px 0 rgba(0, 0, 0, 0.1)' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.25rem' }}>
                    {formatDateTime(signal.timestamp, locale === 'th' ? 'th-TH' : 'en-US')}
                  </h3>
                  {isLatest && (
                    <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                      {t('dataHistory.latest')}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
                    {t('dataHistory.cashBalance')}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0 }}>
                    {formatCurrency(signal.cashBalance, locale === 'th' ? 'th-TH' : 'en-US')}
                  </p>
                  {previousSignal && (
                    <p style={{ fontSize: '12px', color: signal.cashBalance >= previousSignal.cashBalance ? '#10b981' : '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                      {signal.cashBalance >= previousSignal.cashBalance ? '↑' : '↓'} {Math.abs(((signal.cashBalance - previousSignal.cashBalance) / previousSignal.cashBalance) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>

                <div>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
                    {t('dataHistory.revenue7Days')}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0 }}>
                    {formatCurrency(signal.revenue7Days, locale === 'th' ? 'th-TH' : 'en-US')}
                  </p>
                  {previousSignal && (
                    <p style={{ fontSize: '12px', color: signal.revenue7Days >= previousSignal.revenue7Days ? '#10b981' : '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                      {signal.revenue7Days >= previousSignal.revenue7Days ? '↑' : '↓'} {Math.abs(((signal.revenue7Days - previousSignal.revenue7Days) / (previousSignal.revenue7Days || 1)) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>

                <div>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
                    {t('dataHistory.costs7Days')}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0 }}>
                    {formatCurrency(signal.costs7Days, locale === 'th' ? 'th-TH' : 'en-US')}
                  </p>
                  {previousSignal && (
                    <p style={{ fontSize: '12px', color: signal.costs7Days <= previousSignal.costs7Days ? '#10b981' : '#ef4444', marginTop: '0.25rem', margin: 0 }}>
                      {signal.costs7Days <= previousSignal.costs7Days ? '↓' : '↑'} {Math.abs(((signal.costs7Days - previousSignal.costs7Days) / (previousSignal.costs7Days || 1)) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>

                {signal.staffCount > 0 && (
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
                      {t('dataHistory.staffCount')}
                    </p>
                    <p style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0 }}>
                      {signal.staffCount}
                    </p>
                  </div>
                )}

                {signal.occupancyRate !== undefined && (
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
                      {t('dataHistory.occupancyRate')}
                    </p>
                    <p style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0 }}>
                      {(signal.occupancyRate * 100).toFixed(1)}%
                    </p>
                  </div>
                )}

                {signal.customerVolume !== undefined && (
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
                      {t('dataHistory.customerVolume')}
                    </p>
                    <p style={{ fontSize: '18px', fontWeight: 600, color: '#0a0a0a', margin: 0 }}>
                      {signal.customerVolume.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PageLayout>
  );
}
