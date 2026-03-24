/**
 * Branch Recommendations Page
 *
 * Fetches from branch_recommendations (intelligence engine). Display only.
 */
'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from '../../components/page-layout';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { useI18n } from '../../hooks/use-i18n';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { LoadingSpinner } from '../../components/loading-spinner';
import { ErrorState } from '../../components/error-state';
import { SectionCard } from '../../components/section-card';
import {
  getBranchRecommendationsFromKpi,
  type BranchRecommendationRow,
} from '../../services/db/kpi-analytics-service';

export default function BranchRecommendationsPage() {
  const { locale } = useI18n();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();
  const [items, setItems] = useState<BranchRecommendationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branch?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getBranchRecommendationsFromKpi(branch.id)
      .then(setItems)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load recommendations');
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [branch?.id]);

  if (!branch) {
    return (
      <PageLayout title={locale === 'th' ? 'คำแนะนำ' : 'Recommendations'}>
        <ErrorState
          message={locale === 'th' ? 'ไม่พบสาขา' : 'No branch selected'}
          action={{
            label: locale === 'th' ? 'ไปที่ภาพรวม' : 'Go to Overview',
            onClick: () => window.location.assign(paths.branchOverview || '/branch/overview'),
          }}
        />
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout title={locale === 'th' ? 'คำแนะนำ' : 'Recommendations'}>
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title={locale === 'th' ? 'คำแนะนำ' : 'Recommendations'}>
        <ErrorState message={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={locale === 'th' ? 'คำแนะนำ' : 'Recommendations'}>
      <SectionCard title={locale === 'th' ? 'คำแนะนำจากระบบวิเคราะห์' : 'Recommendations from intelligence engine'}>
        {items.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
            {locale === 'th' ? 'ยังไม่มีคำแนะนำในขณะนี้' : 'No recommendations at this time.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((r) => {
              const rec = (r.recommendation ?? '').trim();
              const dk = `${r.branch_id}|${r.metric_date ?? ''}|${rec.toLowerCase()}`;
              return (
              <div
                key={dk}
                style={{
                  padding: '1rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#eab308',
                    marginTop: '0.375rem',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  {r.category && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '0.25rem',
                        textTransform: 'capitalize',
                      }}
                    >
                      {String(r.category)}
                    </div>
                  )}
                  <div style={{ fontSize: '14px', color: '#0a0a0a', lineHeight: '1.4' }}>
                    {r.recommendation ?? ''}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </SectionCard>
    </PageLayout>
  );
}
