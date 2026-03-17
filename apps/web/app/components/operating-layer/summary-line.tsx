'use client';

/**
 * Single metric line for overview top summary: label above value, optional sub line.
 * Used to replace inline card markup with a consistent, i18n-friendly row.
 */
export interface SummaryLineProps {
  /** Short label (e.g. "Business Health Score") */
  label: string;
  /** Main value (number, formatted string, or "Collecting data...") */
  value: React.ReactNode;
  /** Optional line below value (e.g. "/ 100", "Occupancy 85%") */
  subLabel?: React.ReactNode;
  /** Optional title for the whole block (tooltip) */
  title?: string;
  /** Optional inline styles for the value (e.g. color by health) */
  valueStyle?: React.CSSProperties;
}

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  minWidth: 0,
};

export function SummaryLine({ label, value, subLabel, title, valueStyle }: SummaryLineProps) {
  return (
    <div style={cardStyle} title={title}>
      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color: '#0a0a0a',
          ...valueStyle,
        }}
      >
        {value}
      </div>
      {subLabel != null && (
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
          {subLabel}
        </div>
      )}
    </div>
  );
}
