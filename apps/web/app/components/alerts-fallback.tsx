/**
 * Alerts Fallback Component
 * 
 * Displays safe fallback UI when alerts fail to load.
 */
'use client';

import { useI18n } from '../hooks/use-i18n';

interface AlertsFallbackProps {
  error?: Error | null;
  onRetry?: () => void;
}

export function AlertsFallback({ error, onRetry }: AlertsFallbackProps) {
  const { locale } = useI18n();

  return (
    <div style={{
      padding: '1.5rem',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      backgroundColor: '#fef2f2',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '24px',
        marginBottom: '0.5rem',
      }}>
        ⚠️
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 500,
        color: '#991b1b',
        marginBottom: '0.25rem',
      }}>
        {locale === 'th' ? 'ไม่สามารถโหลดการแจ้งเตือนได้' : 'Unable to Load Alerts'}
      </div>
      <div style={{
        fontSize: '12px',
        color: '#7f1d1d',
        marginBottom: '1rem',
      }}>
        {locale === 'th'
          ? 'เกิดข้อผิดพลาดในการโหลดการแจ้งเตือน กรุณาลองใหม่อีกครั้ง'
          : 'An error occurred while loading alerts. Please try again.'
        }
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#dc2626',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {locale === 'th' ? 'ลองอีกครั้ง' : 'Try Again'}
        </button>
      )}
      {error && process.env.NODE_ENV === 'development' && (
        <details style={{ marginTop: '1rem', fontSize: '11px', color: '#666' }}>
          <summary style={{ cursor: 'pointer' }}>Error Details (DEV)</summary>
          <pre style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '10px',
            textAlign: 'left',
          }}>
            {error.message}
          </pre>
        </details>
      )}
    </div>
  );
}
