/**
 * Health Score Fallback Component
 * 
 * Displays safe fallback UI when health score calculation fails.
 * Shows "insufficient_data" status instead of crashing.
 */
'use client';

import { useI18n } from '../hooks/use-i18n';

interface HealthScoreFallbackProps {
  reason?: string;
}

export function HealthScoreFallback({ reason }: HealthScoreFallbackProps) {
  const { locale } = useI18n();

  return (
    <div style={{
      padding: '1.5rem',
      border: '1px solid #dbeafe',
      borderRadius: '8px',
      backgroundColor: '#eff6ff',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '32px',
        fontWeight: 600,
        color: '#1e40af',
        marginBottom: '0.5rem',
      }}>
        —
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 500,
        color: '#1e3a8a',
        marginBottom: '0.25rem',
      }}>
        {locale === 'th' ? 'ข้อมูลไม่เพียงพอ' : 'Insufficient Data'}
      </div>
      <div style={{
        fontSize: '12px',
        color: '#64748b',
        marginTop: '0.5rem',
      }}>
        {locale === 'th'
          ? 'ไม่สามารถคำนวณคะแนนสุขภาพได้ กรุณาอัปเดตข้อมูล'
          : 'Unable to calculate health score. Please update metrics.'
        }
      </div>
      {reason && process.env.NODE_ENV === 'development' && (
        <div style={{
          marginTop: '0.75rem',
          fontSize: '11px',
          color: '#94a3b8',
          fontStyle: 'italic',
        }}>
          {reason}
        </div>
      )}
    </div>
  );
}
