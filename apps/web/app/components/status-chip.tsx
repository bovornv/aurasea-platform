'use client';

export type StatusChipColor = 'green' | 'yellow' | 'red';

// High-contrast, SaaS-grade: bg-*-100, text-*-700, border-*-200
const dotColors: Record<StatusChipColor, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
};

const borderColors: Record<StatusChipColor, string> = {
  green: '#bbf7d0',
  yellow: '#fef08a',
  red: '#fecaca',
};

const bgColors: Record<StatusChipColor, string> = {
  green: '#dcfce7',
  yellow: '#fef9c3',
  red: '#fee2e2',
};

const textColors: Record<StatusChipColor, string> = {
  green: '#15803d',
  yellow: '#a16207',
  red: '#b91c1c',
};

interface StatusChipProps {
  label: string;
  color: StatusChipColor;
}

export function StatusChip({ label, color }: StatusChipProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        padding: '4px 12px',
        borderRadius: 9999,
        border: `1px solid ${borderColors[color]}`,
        backgroundColor: bgColors[color],
        color: textColors[color],
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColors[color],
        }}
      />
      <span>{label}</span>
    </div>
  );
}
