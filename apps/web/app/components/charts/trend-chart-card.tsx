/**
 * TrendChartCard — decision-driven chart card for Trends page.
 * Template: [Title] [Trend arrow + %] | [Chart with axis, weekend shading, baseline] | [1-line insight]
 */
'use client';

interface TrendChartCardProps {
  title: string;
  /** e.g. "↓ 36% (−12% vs last week)" or "↑ 8% (+5% vs last week)". Omit to hide headline. */
  headline?: string | null;
  children: React.ReactNode;
  insight?: string | null;
  /** Column span in 12-col grid: 6 or 12 */
  cols?: 6 | 12;
}

export function TrendChartCard({ title, headline, children, insight, cols = 12 }: TrendChartCardProps) {
  return (
    <div style={{ gridColumn: `span ${cols}`, minWidth: 0 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 10,
          backgroundColor: '#ffffff',
          border: '1px solid #eee',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>
            {title}
          </h3>
          {headline != null && headline !== '' && (
            <span style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>
              {headline}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 140 }}>{children}</div>
        {insight ? (
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, marginTop: 8, lineHeight: 1.4 }}>
            {insight}
          </p>
        ) : null}
      </div>
    </div>
  );
}
