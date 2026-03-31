/**
 * Priorities from branch_priorities_current / company_priorities_current embed
 * financial impact in the title, e.g. "Revenue Drop — Cafe (฿1,272)".
 * UI strips the trailing "(฿…)" from the headline and shows it on a separate line.
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
