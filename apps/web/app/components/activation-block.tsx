/**
 * Activation block — first dashboard experience when no real data yet.
 * Shows: 1 placeholder chart, 1 flagged observation, 1 suggested action.
 * Copy: "Synced with your latest inputs", "Tracking your operations".
 * Calm, operator-built tone.
 */
'use client';

import { useI18n } from '../hooks/use-i18n';
import { useBusinessSetup } from '../contexts/business-setup-context';
import Link from 'next/link';

export function ActivationBlock() {
  const { locale } = useI18n();
  const { setup } = useBusinessSetup();
  const businessType = setup.businessType || 'cafe_restaurant';

  const observationEn = businessType === 'hotel_resort' || businessType === 'hotel_with_cafe'
    ? 'Once you log room and revenue numbers, occupancy and cash runway will appear here.'
    : 'Once you log revenue and costs, cash runway and demand patterns will appear here.';
  const observationTh = businessType === 'hotel_resort' || businessType === 'hotel_with_cafe'
    ? 'เมื่อคุณบันทึกตัวเลขห้องและรายได้ ตัวชี้วัดการเข้าพักและระยะเงินสดจะแสดงที่นี่'
    : 'เมื่อคุณบันทึกรายได้และต้นทุน ระยะเงินสดและรูปแบบความต้องการจะแสดงที่นี่';

  const actionEn = 'Log your first numbers to start tracking.';
  const actionTh = 'บันทึกตัวเลขครั้งแรกเพื่อเริ่มติดตาม';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
        <p style={{ fontSize: '13px', color: '#374151', margin: 0, fontWeight: 500 }}>
          {locale === 'th' ? 'ซิงค์กับข้อมูลล่าสุดของคุณแล้ว' : 'Synced with your latest inputs.'}
        </p>
        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0.25rem 0 0', lineHeight: 1.4 }}>
          {locale === 'th' ? 'กำลังติดตามการดำเนินงานของคุณ' : 'Tracking your operations.'}
        </p>
      </div>

      {/* Placeholder chart */}
      <div style={{ padding: '1.5rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', minHeight: '180px' }}>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, marginBottom: '1rem' }}>
          {locale === 'th' ? 'กราฟจะแสดงเมื่อมีข้อมูล' : 'Chart will appear when you have data.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
          {[40, 65, 45, 70, 55, 80, 60].map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                backgroundColor: '#e5e7eb',
                borderRadius: '4px 4px 0 0',
              }}
            />
          ))}
        </div>
      </div>

      {/* One flagged observation — highlighted */}
      <div
        style={{
          padding: '1rem 1.25rem',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          backgroundColor: '#fffbeb',
        }}
      >
        <p style={{ fontSize: '12px', color: '#92400e', fontWeight: 500, margin: 0 }}>
          {locale === 'th' ? 'สังเกต' : 'Observation'}
        </p>
        <p style={{ fontSize: '14px', color: '#374151', margin: '0.25rem 0 0', lineHeight: 1.5 }}>
          {locale === 'th' ? observationTh : observationEn}
        </p>
      </div>

      {/* One suggested action */}
      <div style={{ padding: '1rem 1.25rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff' }}>
        <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500, margin: 0 }}>
          {locale === 'th' ? 'แนวทางที่แนะนำ' : 'Suggested action'}
        </p>
        <p style={{ fontSize: '14px', color: '#374151', margin: '0.25rem 0 0.5rem', lineHeight: 1.5 }}>
          {locale === 'th' ? actionTh : actionEn}
        </p>
        <Link
          href="/branch/log-today"
          style={{ fontSize: '13px', fontWeight: 500, color: '#0a0a0a', textDecoration: 'underline' }}
        >
          {locale === 'th' ? 'ไปที่ Log Today' : 'Go to Log Today'}
        </Link>
      </div>
    </div>
  );
}
