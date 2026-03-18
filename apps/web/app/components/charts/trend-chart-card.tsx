/**
 * TrendChartCard — [Bold inline label as title] [Chart] Problem / Recommendation.
 * No separate title; legend or titleLabel acts as title (bold 14px). Localized insight headers.
 */
'use client';

export interface LegendItem {
  label: string;
  color: string;
}

interface TrendChartCardProps {
  /** When no legend: single line as chart title (e.g. "Occupancy by day of week"). Bold 14px. */
  titleLabel?: string | null;
  /** Inline legend for dual-line charts: acts as title. Bold 14px, ● + label. */
  legend?: LegendItem[] | null;
  children: React.ReactNode;
  problem?: string | null;
  recommendation?: string | null;
  /** For "Problem:" / "Recommendation:" translation */
  locale?: 'th' | 'en';
  cols?: 6 | 12;
}

export function TrendChartCard({
  titleLabel,
  legend,
  children,
  problem,
  recommendation,
  locale = 'en',
  cols = 12,
}: TrendChartCardProps) {
  const hasInsight = (problem && problem.trim()) || (recommendation && recommendation.trim());
  const problemLabel = locale === 'th' ? 'ปัญหา:' : 'Problem:';
  const recLabel = locale === 'th' ? 'คำแนะนำ:' : 'Recommendation:';

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
        {legend && legend.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            {legend.map((item, i) => (
              <span key={i} style={{ fontSize: 14, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : titleLabel ? (
          <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0, marginBottom: 6 }}>
            {titleLabel}
          </p>
        ) : null}
        <div style={{ flex: 1, minHeight: 140 }}>{children}</div>
        {hasInsight ? (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {problem && problem.trim() ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                <strong style={{ color: '#374151' }}>{problemLabel}</strong> {problem.trim()}
              </p>
            ) : null}
            {recommendation && recommendation.trim() ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                <strong style={{ color: '#374151' }}>{recLabel}</strong> {recommendation.trim()}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
