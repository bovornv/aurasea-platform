'use client';

export type StatusChipColor = 'green' | 'yellow' | 'red';

const dotColors: Record<StatusChipColor, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

const borderColors: Record<StatusChipColor, string> = {
  green: '#bbf7d0',
  yellow: '#fef08a',
  red: '#fecaca',
};

const textColors: Record<StatusChipColor, string> = {
  green: '#166534',
  yellow: '#854d0e',
  red: '#991b1b',
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
        backgroundColor: color === 'green' ? '#f0fdf4' : color === 'yellow' ? '#fefce8' : '#fef2f2',
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
