/**
 * SimpleTrendLine — minimal SVG line chart for Trends page.
 * Soft colors, 2px stroke, no heavy gridlines. Uses polyline from values array.
 */
'use client';

interface SimpleTrendLineProps {
  values: number[];
  color?: string;
  height?: number;
  /** If true, show empty state message */
  emptyMessage?: string;
}

const DEFAULT_COLOR = '#6366f1'; // soft indigo
const HEIGHT = 160;

export function SimpleTrendLine({
  values,
  color = DEFAULT_COLOR,
  height = HEIGHT,
  emptyMessage = 'No data',
}: SimpleTrendLineProps) {
  if (!values || values.length < 2) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: 13,
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return { x, y: Math.max(0, Math.min(100, y)) };
  });
  const points = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${points} 100,100 0,100`;

  return (
    <div style={{ height, position: 'relative' }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <polygon
          points={areaPoints}
          fill={color}
          fillOpacity={0.08}
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
