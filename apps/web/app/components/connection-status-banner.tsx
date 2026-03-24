'use client';

import { useConnectivity } from '../contexts/connectivity-context';
import { useI18n } from '../hooks/use-i18n';

/**
 * Shown when the browser reports offline, or briefly after reconnect to surface recovery.
 */
export function ConnectionStatusBanner() {
  const { showConnectionWarning, isOnline } = useConnectivity();
  const { locale } = useI18n();
  const th = locale === 'th';

  if (!showConnectionWarning) return null;

  const text = !isOnline
    ? th
      ? 'ขาดการเชื่อมต่อ — กำลังลองใหม่...'
      : 'Connection lost — retrying...'
    : th
      ? 'กลับมาออนไลน์แล้ว — กำลังซิงก์...'
      : 'Back online — syncing...';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '10px 16px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 600,
        color: '#1e293b',
        background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)',
        borderBottom: '1px solid #f59e0b',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {text}
    </div>
  );
}
