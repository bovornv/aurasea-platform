'use client';

import type { AccommodationPricingPoint, AccommodationPricingInsight, PricingQuadrant } from '../../services/db/accommodation-pricing-service';

const COLORS: Record<PricingQuadrant, string> = {
  optimal: '#16a34a',
  underpriced: '#eab308',
  overpriced: '#f97316',
  weak: '#ef4444',
  unknown: '#64748b',
};

function bubbleRadius(revenue: number, minRev: number, maxRev: number): number {
  if (maxRev <= minRev) return 10;
  const t = (revenue - minRev) / (maxRev - minRev);
  return 6 + t * 12;
}

export function AccommodationPricingBubbleChart({
  points,
  insight,
  locale,
}: {
  points: AccommodationPricingPoint[];
  insight: AccommodationPricingInsight | null;
  locale: 'en' | 'th';
}) {
  if (!points.length) {
    return <div style={{ fontSize: 13, color: '#94a3b8' }}>{locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</div>;
  }

  const width = 600;
  const height = 220;
  const left = 52;
  const right = 24;
  const top = 12;
  const bottom = 36;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const xMin = 0;
  const xMax = 100;
  const yMin = Math.min(...points.map((p) => p.adr_thb));
  const yMax = Math.max(...points.map((p) => p.adr_thb));
  const yRange = yMax - yMin || 1;
  const minRev = Math.min(...points.map((p) => p.revenue_thb));
  const maxRev = Math.max(...points.map((p) => p.revenue_thb));
  const avgOcc = points[points.length - 1]?.avg_occ ?? null;
  const avgAdr = points[points.length - 1]?.avg_adr ?? null;

  const toX = (occ: number) => left + ((occ - xMin) / (xMax - xMin)) * plotW;
  const toY = (adr: number) => top + plotH - ((adr - yMin) / yRange) * plotH;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <rect x={left} y={top} width={plotW} height={plotH} fill="#fff" stroke="#e5e7eb" />
        {avgOcc != null ? <line x1={toX(avgOcc)} x2={toX(avgOcc)} y1={top} y2={top + plotH} stroke="#94a3b8" strokeDasharray="4,4" /> : null}
        {avgAdr != null ? <line x1={left} x2={left + plotW} y1={toY(avgAdr)} y2={toY(avgAdr)} stroke="#94a3b8" strokeDasharray="4,4" /> : null}
        {points.map((p, i) => (
          <g key={`${p.metric_date}-${i}`}>
            <circle
              cx={toX(p.occupancy_pct)}
              cy={toY(p.adr_thb)}
              r={bubbleRadius(p.revenue_thb, minRev, maxRev)}
              fill={COLORS[p.quadrant]}
              fillOpacity={0.55}
              stroke={COLORS[p.quadrant]}
            />
          </g>
        ))}
        <text x={left - 8} y={top - 2} textAnchor="end" fontSize="11" fill="#94a3b8">
          {locale === 'th' ? 'ADR (฿)' : 'ADR (฿)'}
        </text>
        <text x={left + plotW} y={height - 8} textAnchor="end" fontSize="11" fill="#94a3b8">
          {locale === 'th' ? 'อัตราเข้าพัก (%)' : 'Occupancy (%)'}
        </text>
      </svg>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
        {(['optimal', 'underpriced', 'overpriced', 'weak'] as PricingQuadrant[]).map((q) => (
          <span key={q} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569' }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: COLORS[q] }} />
            {q}
          </span>
        ))}
      </div>

      {insight?.title || insight?.insight_text ? (
        <div style={{ marginTop: 10, lineHeight: 1.45 }}>
          {insight.title ? <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{insight.title}</div> : null}
          {insight.insight_text ? <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{insight.insight_text}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
