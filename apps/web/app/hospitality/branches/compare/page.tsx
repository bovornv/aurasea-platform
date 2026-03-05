/**
 * Branch Comparison View
 * 
 * Table showing all branches with key metrics for comparison.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../../components/page-layout';
import { businessGroupService } from '../../../services/business-group-service';
import { getBranchComparisonData, sortBranchComparisonData, type BranchComparisonData, type SortField } from '../../../services/branch-comparison-service';
import { useAlertStore } from '../../../contexts/alert-store-context';
import { useUserSession } from '../../../contexts/user-session-context';
import { BranchBusinessType } from '../../../models/business-group';
import { useI18n } from '../../../hooks/use-i18n';

export default function BranchComparisonPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const { alerts: rawAlerts } = useAlertStore();
  const { permissions } = useUserSession();
  const [comparisonData, setComparisonData] = useState<BranchComparisonData[]>([]);
  const [sortField, setSortField] = useState<SortField>('healthScore');
  const [sortAscending, setSortAscending] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) {
        setComparisonData([]);
        setIsLoading(false);
        return;
      }

      const roleForCompare: 'owner' | 'manager' | 'branch' =
        permissions.role === 'owner' || permissions.role === 'admin' ? 'owner'
        : permissions.role === 'manager' ? 'manager'
        : 'branch';
      const data = getBranchComparisonData(rawAlerts, businessGroup.id, {
        role: roleForCompare,
        organizationId: permissions.organizationId,
        branchIds: permissions.branchIds,
      });
      const sorted = sortBranchComparisonData(data, sortField, sortAscending);
      setComparisonData(sorted);
    } catch (err) {
      console.error('Failed to load branch comparison data:', err);
      setComparisonData([]);
    } finally {
      setIsLoading(false);
    }
  }, [rawAlerts, sortField, sortAscending, permissions]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle ascending/descending
      setSortAscending(!sortAscending);
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortAscending(true);
    }
  };

  const handleBranchClick = (branchId: string) => {
    // Set branch as current and navigate to dashboard
    businessGroupService.setCurrentBranch(branchId);
    router.push('/hospitality');
  };

  const getBusinessTypeLabel = (type: BranchBusinessType): string => {
    const labels: Record<BranchBusinessType, string> = {
      [BranchBusinessType.CAFE_RESTAURANT]: locale === 'th' ? 'คาเฟ่ / ร้านอาหาร' : 'Café / Restaurant',
      [BranchBusinessType.HOTEL_RESORT]: locale === 'th' ? 'โรงแรม / รีสอร์ท' : 'Hotel / Resort',
      [BranchBusinessType.HOTEL_WITH_CAFE]: locale === 'th' ? 'โรงแรมพร้อมคาเฟ่' : 'Hotel with Café',
    };
    return labels[type];
  };

  const getHealthScoreColor = (score: number): string => {
    if (score >= 70) return '#10b981'; // green
    if (score >= 50) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable'): string => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      case 'stable':
        return '→';
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable'): string => {
    switch (trend) {
      case 'up':
        return '#10b981';
      case 'down':
        return '#ef4444';
      case 'stable':
        return '#6b7280';
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => {
    const isActive = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        style={{
          padding: '0.5rem 0.75rem',
          border: 'none',
          backgroundColor: isActive ? '#f3f4f6' : 'transparent',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: isActive ? 500 : 400,
          color: isActive ? '#0a0a0a' : '#6b7280',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        {label}
        {isActive && (
          <span style={{ fontSize: '12px' }}>
            {sortAscending ? '↑' : '↓'}
          </span>
        )}
      </button>
    );
  };

  if (isLoading) {
    return (
      <PageLayout
        title={locale === 'th' ? 'เปรียบเทียบสาขา' : 'Branch Comparison'}
        subtitle={locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
      >
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {locale === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={locale === 'th' ? 'เปรียบเทียบสาขา' : 'Branch Comparison'}
      subtitle={locale === 'th' ? 'เปรียบเทียบประสิทธิภาพของสาขาทั้งหมด' : 'Compare performance across all branches'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Sort Controls */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '14px', color: '#6b7280', marginRight: '0.5rem' }}>
            {locale === 'th' ? 'เรียงตาม:' : 'Sort by:'}
          </span>
          <SortButton field="healthScore" label={locale === 'th' ? 'คะแนนสุขภาพ' : 'Health Score'} />
          <SortButton field="revenueGap" label={locale === 'th' ? 'ช่องว่างรายได้' : 'Revenue Gap'} />
          <SortButton field="utilization" label={locale === 'th' ? 'การใช้งานวันธรรมดา' : 'Weekday Utilization'} />
        </div>

        {/* Comparison Table */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'ชื่อสาขา' : 'Branch Name'}
                  </th>
                  <th
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'ประเภทธุรกิจ' : 'Business Type'}
                  </th>
                  <th
                    style={{
                      padding: '1rem',
                      textAlign: 'right',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'คะแนนสุขภาพ' : 'Health Score'}
                  </th>
                  <th
                    style={{
                      padding: '1rem',
                      textAlign: 'right',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'การใช้งานวันธรรมดา' : 'Weekday Utilization'}
                  </th>
                  <th
                    style={{
                      padding: '1rem',
                      textAlign: 'center',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'แนวโน้มรายได้' : 'Revenue Trend'}
                  </th>
                  <th
                    style={{
                      padding: '1rem',
                      textAlign: 'right',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}
                  >
                    {locale === 'th' ? 'การแจ้งเตือน' : 'Active Alerts'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '3rem',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: '14px',
                      }}
                    >
                      {locale === 'th' ? 'ไม่มีข้อมูลสาขา' : 'No branch data available'}
                    </td>
                  </tr>
                ) : (
                  comparisonData.map((branch, index) => (
                    <tr
                      key={branch.branchId}
                      onClick={() => handleBranchClick(branch.branchId)}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                    >
                      <td
                        style={{
                          padding: '1rem',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: '#0a0a0a',
                        }}
                      >
                        {branch.branchName}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          fontSize: '14px',
                          color: '#6b7280',
                        }}
                      >
                        {getBusinessTypeLabel(branch.businessType)}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: getHealthScoreColor(branch.healthScore),
                        }}
                      >
                        {branch.healthScore.toFixed(1)}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontSize: '14px',
                          color: branch.weekdayUtilization === null ? '#9ca3af' : '#374151',
                        }}
                      >
                        {branch.weekdayUtilization === null
                          ? '—'
                          : `${branch.weekdayUtilization.toFixed(1)}%`}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'center',
                          fontSize: '18px',
                          fontWeight: 600,
                          color: getTrendColor(branch.revenueTrend),
                        }}
                      >
                        {getTrendIcon(branch.revenueTrend)}
                      </td>
                      <td
                        style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontSize: '14px',
                          color: branch.activeAlertsCount > 0 ? '#ef4444' : '#10b981',
                          fontWeight: branch.activeAlertsCount > 0 ? 500 : 400,
                        }}
                      >
                        {branch.activeAlertsCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
