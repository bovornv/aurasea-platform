/**
 * TrendChartCard — [Title] [Legend] [Chart] Problem / Recommendation.
 * No header clutter; optional subtitle under title; insight = problem + recommendation.
 */
'use client';

export interface LegendItem {
  label: string;
  color: string;
}

interface TrendChartCardProps {
  title: string;
  /** Small text under title (12–13px muted). e.g. "Revenue by day of week" */
  subtitle?: string | null;
  /** Inline legend for dual-line charts: ● Label (same color as line). 12–13px. */
  legend?: LegendItem[] | null;
  children: React.ReactNode;
  /** One line each; 13px; 6–8px between. */
  problem?: string | null;
  recommendation?: string | null;
  cols?: 6 | 12;
}

export function TrendChartCard({
  title,
  subtitle,
  legend,
  children,
  problem,
  recommendation,
  cols = 12,
}: TrendChartCardProps) {
  const hasInsight = (problem && problem.trim()) || (recommendation && recommendation.trim());

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
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>
          {title}
        </h3>
        {subtitle ? (
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0 0', lineHeight: 1.3 }}>
            {subtitle}
          </p>
        ) : null}
        {legend && legend.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6, marginBottom: 4 }}>
            {legend.map((item, i) => (
              <span key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
        <div style={{ flex: 1, minHeight: 140 }}>{children}</div>
        {hasInsight ? (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {problem && problem.trim() ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                <strong style={{ color: '#374151' }}>Problem:</strong> {problem.trim()}
              </p>
            ) : null}
            {recommendation && recommendation.trim() ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                <strong style={{ color: '#374151' }}>Recommendation:</strong> {recommendation.trim()}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
