/**
 * Risk Distribution Card Component
 * 
 * Compact risk distribution visualization for Trends page
 */
'use client';

import { useMemo } from 'react';
import { SectionCard } from '../section-card';
import { useHospitalityAlerts } from '../../hooks/use-hospitality-alerts';

interface RiskDistributionCardProps {
  businessGroupId: string;
  locale: string;
}

export function RiskDistributionCard({ businessGroupId, locale }: RiskDistributionCardProps) {
  const { alerts } = useHospitalityAlerts();

  const riskDistribution = useMemo(() => {
    const distribution = {
      financial: 0,
      operational: 0,
      liquidity: 0,
      demand: 0,
    };

    alerts?.forEach(alert => {
      const type = (alert as any).type || '';
      if (type.includes('cost') || type.includes('revenue') || type.includes('margin')) {
        distribution.financial++;
      } else if (type.includes('occupancy') || type.includes('customer') || type.includes('promo')) {
        distribution.demand++;
      } else if (type.includes('cash') || type.includes('runway')) {
        distribution.liquidity++;
      } else {
        distribution.operational++;
      }
    });

    const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);
    if (total === 0) return null;

    return {
      financial: (distribution.financial / total) * 100,
      operational: (distribution.operational / total) * 100,
      liquidity: (distribution.liquidity / total) * 100,
      demand: (distribution.demand / total) * 100,
      counts: distribution,
    };
  }, [alerts]);

  return (
    <SectionCard 
      title={locale === 'th' ? 'การกระจายความเสี่ยง' : 'Risk Distribution'}
    >
      {!riskDistribution ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
          {locale === 'th' ? 'ไม่มีข้อมูลความเสี่ยง' : 'No risk data'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Financial */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '13px', color: '#374151' }}>
                {locale === 'th' ? 'การเงิน' : 'Financial'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a0a0a' }}>
                {riskDistribution.counts.financial}
              </span>
            </div>
            <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${riskDistribution.financial}%`, 
                  backgroundColor: '#ef4444',
                  transition: 'width 0.3s',
                }} 
              />
            </div>
          </div>

          {/* Operational */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '13px', color: '#374151' }}>
                {locale === 'th' ? 'การดำเนินงาน' : 'Operational'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a0a0a' }}>
                {riskDistribution.counts.operational}
              </span>
            </div>
            <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${riskDistribution.operational}%`, 
                  backgroundColor: '#f59e0b',
                  transition: 'width 0.3s',
                }} 
              />
            </div>
          </div>

          {/* Liquidity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '13px', color: '#374151' }}>
                {locale === 'th' ? 'สภาพคล่อง' : 'Liquidity'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a0a0a' }}>
                {riskDistribution.counts.liquidity}
              </span>
            </div>
            <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${riskDistribution.liquidity}%`, 
                  backgroundColor: '#ef4444',
                  transition: 'width 0.3s',
                }} 
              />
            </div>
          </div>

          {/* Demand */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '13px', color: '#374151' }}>
                {locale === 'th' ? 'ความต้องการ' : 'Demand'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0a0a0a' }}>
                {riskDistribution.counts.demand}
              </span>
            </div>
            <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${riskDistribution.demand}%`, 
                  backgroundColor: '#f59e0b',
                  transition: 'width 0.3s',
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
