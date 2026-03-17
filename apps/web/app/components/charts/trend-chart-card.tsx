/**
 * TrendChartCard — soft container for Trends page charts.
 * Padding 16px, radius 8–10px, light border or none, white. Title 14–15px 600, 8px below; optional insight 13px muted.
 */
'use client';

interface TrendChartCardProps {
  title: string;
  children: React.ReactNode;
  insight?: string | null;
  /** Column span in 12-col grid: 6 or 12 */
  cols?: 6 | 12;
}

export function TrendChartCard({ title, children, insight, cols = 6 }: TrendChartCardProps) {
  return (
    <div
      style={{
        gridColumn: `span ${cols}`,
        minWidth: 0,
      }}
    >
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
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0, marginBottom: 8 }}>
          {title}
        </h3>
        <div style={{ flex: 1, minHeight: 120 }}>{children}</div>
        {insight ? (
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, marginTop: 8, lineHeight: 1.4 }}>
            {insight}
          </p>
        ) : null}
      </div>
    </div>
  );
}
