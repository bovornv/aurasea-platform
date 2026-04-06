/**
 * TrendChartCard — [Bold inline label as title] [Chart] Problem / Recommendation.
 * No separate title; legend or titleLabel acts as title (bold 14px). Localized insight headers.
 * Also supports a one-line signal insight (colored dot + sentence) via the `insight` prop.
 */
'use client';

export interface LegendItem {
  label: string;
  color: string;
}

/** Signal severity for the one-line insight dot system. */
export type SignalColor = 'green' | 'amber' | 'red' | 'info';

/** One-line colored-dot insight (replaces Problem/Recommendation when provided). */
export interface TrendSignal {
  signal: SignalColor;
  text: string;
}

const SIGNAL_COLORS: Record<SignalColor, string> = {
  green: '#16a34a',
  amber: '#d97706',
  red: '#ef4444',
  info: '#6b7280',
};

interface TrendChartCardProps {
  /** When no legend: single line as chart title (e.g. "Occupancy by day of week"). Bold 14px. */
  titleLabel?: string | null;
  /** Optional subtitle rendered below titleLabel in small grey text. */
  subtitle?: string | null;
  /** Inline legend for dual-line charts: acts as title. Bold 14px, ● + label. */
  legend?: LegendItem[] | null;
  children: React.ReactNode;
  problem?: string | null;
  recommendation?: string | null;
  /** One-line signal insight. When provided, renders colored dot + text instead of Problem/Recommendation. */
  insight?: TrendSignal | null;
  /** For "Problem:" / "Recommendation:" translation */
  locale?: 'th' | 'en';
  cols?: 6 | 12;
}

export function TrendChartCard({
  titleLabel,
  subtitle,
  legend,
  children,
  problem,
  recommendation,
  insight,
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
          <div style={{ marginBottom: 6 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>
              {titleLabel}
            </p>
            {subtitle ? (
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, marginTop: 2 }}>
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}
        <div style={{ flex: 1, minHeight: 140 }}>{children}</div>
        {insight ? (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: SIGNAL_COLORS[insight.signal],
                flexShrink: 0,
                marginTop: 4,
              }}
            />
            <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.4 }}>
              {insight.text}
            </p>
          </div>
        ) : hasInsight ? (
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
