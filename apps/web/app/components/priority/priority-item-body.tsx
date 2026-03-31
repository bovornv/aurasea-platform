'use client';

import {
  parseTrailingBahtImpactFromTitle,
  priorityEstimatedRevenueAtRiskLabel,
} from '../../utils/priority-title-parse';

export interface PriorityItemBodyProps {
  /** Raw title from API (may end with `(฿1,272)`). */
  titleRaw: string;
  /** Manager-facing description (what happened + what to do). */
  description: string;
  locale: string;
  /** Role-based: hide the estimated revenue line. */
  hideFinancials?: boolean;
  /** If the headline is empty after stripping the amount, use this (e.g. branch name on company view). */
  headlineFallback?: string;
}

/**
 * Three-line priorities layout: headline (problem only), optional impact estimate, description.
 * Financial amount is parsed from the end of `titleRaw`, not from schema fields.
 */
export function PriorityItemBody({
  titleRaw,
  description,
  locale,
  hideFinancials,
  headlineFallback,
}: PriorityItemBodyProps) {
  const th = locale === 'th' || locale.startsWith('th');
  const trimmed = titleRaw.trim();
  const { headline, amountDisplay } = parseTrailingBahtImpactFromTitle(trimmed);
  const titleLine =
    headline.trim() ||
    (headlineFallback?.trim() ?? '') ||
    (th ? 'ประเด็นสำคัญ' : 'Priority');
  const showImpact = !hideFinancials && amountDisplay != null;

  return (
    <div style={{ lineHeight: 1.55 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{titleLine}</div>
      {showImpact ? (
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
          {priorityEstimatedRevenueAtRiskLabel(locale)} {amountDisplay}
        </div>
      ) : null}
      <div style={{ fontSize: 14, color: '#475569', marginTop: 6 }}>{description}</div>
    </div>
  );
}
