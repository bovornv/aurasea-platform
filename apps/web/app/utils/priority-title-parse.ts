/**
 * Priority title cleanup: strip trailing "(฿…)" so the headline is problem-only.
 * The impact line in UI uses `impact_thb` from the API; this parser is for legacy titles.
 */

/** Trailing Thai-baht amount in parentheses, e.g. (฿1,272) or (฿650) */
const TRAILING_BAHT_IN_PARENS = /\s*\(฿([\d,]+)\)\s*$/;

export function parseTrailingBahtImpactFromTitle(title: string | null | undefined): {
  headline: string;
  /** e.g. "฿1,272" — commas preserved from source */
  amountDisplay: string | null;
} {
  const raw = (title ?? '').trim();
  if (!raw) return { headline: '', amountDisplay: null };
  const m = TRAILING_BAHT_IN_PARENS.exec(raw);
  if (!m) return { headline: raw, amountDisplay: null };
  const headline = raw.slice(0, m.index).trimEnd();
  return { headline: headline || raw, amountDisplay: `฿${m[1]}` };
}

export function priorityEstimatedRevenueAtRiskLabel(locale: string): string {
  return locale === 'th' ? 'ประมาณการรายได้ที่เสี่ยง:' : 'Estimated revenue at risk:';
}

/** Whole baht with comma grouping, e.g. ฿1,313 (uses en-US grouping per product spec). */
export function formatImpactThbBaht(impactThb: number): string {
  const n = Math.round(Number(impactThb));
  if (!Number.isFinite(n)) return '';
  return `฿${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
