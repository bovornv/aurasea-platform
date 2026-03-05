// Onboarding checklist component - shows 3-step setup progress
'use client';

import Link from 'next/link';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useMonitoring } from '../hooks/use-monitoring';
import { useI18n } from '../hooks/use-i18n';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { operationalSignalsService } from '../services/operational-signals-service';
import { useEffect, useState } from 'react';

interface OnboardingChecklistProps {
  onComplete?: () => void;
}

export function OnboardingChecklist({ onComplete }: OnboardingChecklistProps) {
  const { setup } = useBusinessSetup();
  const { status: monitoringStatus } = useMonitoring();
  const { t, locale } = useI18n();
  const { branch } = useCurrentBranch();
  const [hasOperationalData, setHasOperationalData] = useState(false);
  
  // Use new metrics route
  const metricsHref = '/branch/log-today';

  useEffect(() => {
    // Check for operational data
    const signals = operationalSignalsService.getAllSignals();
    setHasOperationalData(signals.length > 0);
  }, [monitoringStatus.isActive]);

  // Step 1: Business Setup (name + type + revenue sources only; cash/fixed costs no longer required)
  const step1Complete = setup.isCompleted &&
    setup.businessType !== null &&
    setup.businessName !== '' &&
    Object.values(setup.revenueSources).some(Boolean);

  // Step 2: Initial Financials (same as step 1 for now, but could be separate)
  const step2Complete = step1Complete;

  // Step 3: Start Monitoring (has at least one operational signal)
  const step3Complete = monitoringStatus.isActive && hasOperationalData;

  const allStepsComplete = step1Complete && step2Complete && step3Complete;

  // If all steps complete, show collapsed badge
  if (allStepsComplete) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        backgroundColor: '#dcfce7',
        border: '1px solid #86efac',
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#10b981',
        }} />
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#166534' }}>
          {locale === 'th' ? 'การติดตามทำงานอยู่' : 'Monitoring Active'}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '1.75rem',
      backgroundColor: '#ffffff',
      marginBottom: '2rem',
    }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem', letterSpacing: '-0.01em' }}>
        {locale === 'th' ? 'เริ่มต้นใช้งาน' : 'Get Started'}
      </h3>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1.5rem', lineHeight: '1.6' }}>
        {locale === 'th' 
          ? 'ทำตามขั้นตอนเหล่านี้เพื่อเริ่มการติดตามธุรกิจของคุณ'
          : 'Complete these steps to start monitoring your business'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Step 1 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: step1Complete ? '#10b981' : '#e5e7eb',
            color: step1Complete ? '#ffffff' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
            flexShrink: 0,
            marginTop: '2px',
          }}>
            {step1Complete ? '✓' : '1'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 500, color: '#374151', margin: 0 }}>
                {locale === 'th' ? 'ขั้นตอนที่ 1: ตั้งค่าธุรกิจ' : 'Step 1: Complete Business Setup'}
              </h4>
              {step1Complete ? (
                <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                  {locale === 'th' ? 'เสร็จสิ้น' : 'Complete'}
                </span>
              ) : (
                <Link
                  href="/hospitality/setup"
                  style={{
                    fontSize: '13px',
                    color: '#3b82f6',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {locale === 'th' ? 'เริ่มต้น' : 'Start'}
                </Link>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
              {locale === 'th'
                ? 'ระบุประเภทธุรกิจ ชื่อธุรกิจ และแหล่งรายได้'
                : 'Specify business type, name, and revenue sources'}
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: step2Complete ? '#10b981' : step1Complete ? '#3b82f6' : '#e5e7eb',
            color: step2Complete ? '#ffffff' : step1Complete ? '#ffffff' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
            flexShrink: 0,
            marginTop: '2px',
          }}>
            {step2Complete ? '✓' : '2'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 500, color: '#374151', margin: 0 }}>
                {locale === 'th' ? 'ขั้นตอนที่ 2: ใส่ข้อมูลทางการเงินเริ่มต้น' : 'Step 2: Enter Initial Financials'}
              </h4>
              {step2Complete ? (
                <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                  {locale === 'th' ? 'เสร็จสิ้น' : 'Complete'}
                </span>
              ) : step1Complete ? (
                <Link
                  href="/hospitality/setup"
                  style={{
                    fontSize: '13px',
                    color: '#3b82f6',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {locale === 'th' ? 'แก้ไข' : 'Edit'}
                </Link>
              ) : (
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                  {locale === 'th' ? 'รอขั้นตอนที่ 1' : 'Complete Step 1'}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
              {locale === 'th'
                ? 'โปรไฟล์ธุรกิจและแหล่งรายได้'
                : 'Business profile and revenue sources'}
            </p>
          </div>
        </div>

        {/* Step 3 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: step3Complete ? '#10b981' : step2Complete ? '#3b82f6' : '#e5e7eb',
            color: step3Complete ? '#ffffff' : step2Complete ? '#ffffff' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
            flexShrink: 0,
            marginTop: '2px',
          }}>
            {step3Complete ? '✓' : '3'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 500, color: '#374151', margin: 0 }}>
                {locale === 'th' ? 'ขั้นตอนที่ 3: เริ่มการติดตาม' : 'Step 3: Start Monitoring'}
              </h4>
              {step3Complete ? (
                <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                  {locale === 'th' ? 'เสร็จสิ้น' : 'Complete'}
                </span>
              ) : step2Complete ? (
                <Link
                  href={metricsHref}
                  style={{
                    fontSize: '13px',
                    color: '#3b82f6',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {locale === 'th' ? 'อัปเดตตัวเลขล่าสุด' : 'Update Latest Metrics'}
                </Link>
              ) : (
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                  {locale === 'th' ? 'รอขั้นตอนที่ 2' : 'Complete Step 2'}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
              {locale === 'th'
                ? 'ส่งข้อมูลการดำเนินงานครั้งแรกเพื่อเริ่มการติดตาม'
                : 'Submit your first operational update to start monitoring'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
