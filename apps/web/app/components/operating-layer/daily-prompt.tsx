'use client';

interface DailyPromptProps {
  lastUpdated?: string | null;
  logTodayHref?: string | null;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function DailyPrompt({ lastUpdated, logTodayHref }: DailyPromptProps) {
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        padding: '0.875rem 1rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#374151',
      }}
    >
      <p style={{ margin: 0, marginBottom: lastUpdated ? '0.375rem' : 0 }}>
        วันนี้คุณได้บันทึกข้อมูลแล้วหรือยัง?
        {logTodayHref && (
          <a href={logTodayHref} style={{ marginLeft: '0.5rem', fontWeight: 600, color: '#0a0a0a' }}>
            บันทึกข้อมูลวันนี้
          </a>
        )}
      </p>
      {lastUpdated && (
        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
          อัปเดตล่าสุดเมื่อ: {formatTime(lastUpdated)}
        </p>
      )}
    </div>
  );
}
