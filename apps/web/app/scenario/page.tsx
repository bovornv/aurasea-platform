// Scenario page - Safe thinking, not optimization
'use client';

import { useState, useMemo } from 'react';
import { PageLayout } from '../components/page-layout';
import { calculateScenarioImpact } from '../utils/scenario-calculator';
import { useI18n } from '../hooks/use-i18n';

export default function ScenarioPage() {
  const [demand, setDemand] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [pricing, setPricing] = useState(0);
  const { t, locale } = useI18n();

  const resetScenario = () => {
    setDemand(0);
    setStaffCount(0);
    setPricing(0);
  };

  const { riskChange, cashChange, forecastChange } = useMemo(
    () => calculateScenarioImpact({ demand, staffCount, pricing }),
    [demand, staffCount, pricing]
  );

  const hasNoChanges = demand === 0 && staffCount === 0 && pricing === 0;

  return (
    <PageLayout title={t('scenario.title')} subtitle={t('scenario.subtitle')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Purpose Clarification */}
        <div style={{
          border: '1px solid #dbeafe',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          backgroundColor: '#eff6ff',
          marginTop: '-1rem',
        }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#1e40af', marginBottom: '0.5rem', marginTop: 0 }}>
            {locale === 'th' 
              ? 'เครื่องมือนี้ช่วยให้คุณทดสอบการตัดสินใจแบบ "ถ้า...จะเป็นอย่างไร"'
              : 'This tool lets you test what-if decisions'}
          </h4>
          <p style={{ fontSize: '14px', color: '#1e3a8a', margin: 0, lineHeight: '1.6' }}>
            {locale === 'th'
              ? 'มันไม่เปลี่ยนข้อมูลการติดตามแบบเรียลไทม์ ใช้เมื่อวางแผนการเปลี่ยนแปลง'
              : 'It does not change live monitoring data. Use when planning changes.'}
          </p>
        </div>

        {/* Helper text */}
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '-1rem', marginBottom: '0.5rem' }}>
          {t('scenario.helperText')}
        </p>

        {/* Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Demand */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <label style={{ display: 'block', fontSize: '15px', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
              {t('scenario.demandChangeLabel')}
            </label>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.5' }}>
              {t('scenario.demandChangeHelper')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => setDemand(Math.max(-10, demand - 1))}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                −
              </button>
              <span style={{ minWidth: '3rem', textAlign: 'center', fontSize: '0.9375rem', color: '#374151' }}>
                {demand > 0 ? '+' : ''}{demand}%
              </span>
              <button
                onClick={() => setDemand(Math.min(10, demand + 1))}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Staff Count */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <label style={{ display: 'block', fontSize: '15px', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
              {t('scenario.staffCountChangeLabel')}
            </label>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.5' }}>
              {t('scenario.staffCountChangeHelper')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => setStaffCount(Math.max(-5, staffCount - 1))}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                −
              </button>
              <span style={{ minWidth: '3rem', textAlign: 'center', fontSize: '0.9375rem', color: '#374151' }}>
                {staffCount > 0 ? '+' : ''}{staffCount}
              </span>
              <button
                onClick={() => setStaffCount(Math.min(5, staffCount + 1))}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Pricing */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <label style={{ display: 'block', fontSize: '15px', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
              {t('scenario.pricingChangeLabel')}
            </label>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.5' }}>
              {t('scenario.pricingChangeHelper')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => setPricing(Math.max(-10, pricing - 1))}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                −
              </button>
              <span style={{ minWidth: '3rem', textAlign: 'center', fontSize: '0.9375rem', color: '#374151' }}>
                {pricing > 0 ? '+' : ''}{pricing}%
              </span>
              <button
                onClick={() => setPricing(Math.min(10, pricing + 1))}
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Outputs - Directional only */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
            {t('scenario.whatThisMeans')}
          </h3>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1rem', lineHeight: '1.5' }}>
            {t('scenario.whatThisMeansDescription')}
          </p>
          <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('scenario.directionalImpact')}
          </h4>
          {hasNoChanges ? (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
              {t('scenario.adjustInputs')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>{t('scenario.overallBusinessRisk')}: </span>
                <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                  {riskChange === 'increases' ? t('scenario.increases') : riskChange === 'decreases' ? t('scenario.decreases') : t('scenario.neutral')}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>{t('scenario.cashPosition')}: </span>
                <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                  {cashChange === 'improves' ? t('scenario.improves') : cashChange === 'declines' ? t('scenario.declines') : t('scenario.neutral')}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>{t('scenario.confidenceInDirection')}: </span>
                <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                  {forecastChange === 'increases' ? t('scenario.increases') : forecastChange === 'decreases' ? t('scenario.decreases') : t('scenario.neutral')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Reset Button */}
        {(demand !== 0 || staffCount !== 0 || pricing !== 0) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={resetScenario}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#6b7280',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              {t('common.reset')}
            </button>
          </div>
        )}

        {/* How to Use This Page */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '1.75rem',
            backgroundColor: '#f9fafb',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '1rem', color: '#0a0a0a', letterSpacing: '-0.01em' }}>
            {t('scenario.howToUseTitle')}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <li style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: '#6b7280' }}>•</span>
              <span>{t('scenario.howToUse1')}</span>
            </li>
            <li style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: '#6b7280' }}>•</span>
              <span>{t('scenario.howToUse2')}</span>
            </li>
            <li style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6', display: 'flex', gap: '0.75rem' }}>
              <span style={{ color: '#6b7280' }}>•</span>
              <span>{t('scenario.howToUse3')}</span>
            </li>
          </ul>
        </div>
      </div>
    </PageLayout>
  );
}
