'use client';

import {
  formatImpactThbBaht,
  parseTrailingBahtImpactFromTitle,
  priorityEstimatedRevenueAtRiskLabel,
} from '../../utils/priority-title-parse';

export interface PriorityItemBodyProps {
  /** Raw title from API (trailing `(฿…)` stripped for problem-only headline). */
  titleRaw: string;
  /** Manager-facing description (what happened + what to do). */
  description: string;
  locale: string;
  /** From branch_priorities_current / company_priorities_current.impact_thb */
  impactThb?: number | null;
  /** Role-based: hide the impact line. */
  hideFinancials?: boolean;
  /** If the headline is empty after stripping the amount, use this (e.g. branch name on company view). */
  headlineFallback?: string;
}

/**
 * Title (problem only) → optional impact line from impact_thb → description.
 */
export function PriorityItemBody({
  titleRaw,
  description,
  locale,
  impactThb,
  hideFinancials,
  headlineFallback,
}: PriorityItemBodyProps) {
  const th = locale === 'th' || locale.startsWith('th');
  const trimmed = titleRaw.trim();
  const { headline } = parseTrailingBahtImpactFromTitle(trimmed);
  const titleLine =
    headline.trim() ||
    (headlineFallback?.trim() ?? '') ||
    (th ? 'ประเด็นสำคัญ' : 'Priority');

  const n = impactThb != null ? Number(impactThb) : NaN;
  const hasImpact = !hideFinancials && impactThb != null && Number.isFinite(n);
  const impactDisplay = hasImpact ? formatImpactThbBaht(n) : '';

  return (
    <div style={{ lineHeight: 1.55 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{titleLine}</div>
      {hasImpact && impactDisplay ? (
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
          {priorityEstimatedRevenueAtRiskLabel(locale)} {impactDisplay}
        </div>
      ) : null}
      <div style={{ fontSize: 14, color: '#475569', marginTop: 6 }}>
        {description}
      </div>
    </div>
  );
}
