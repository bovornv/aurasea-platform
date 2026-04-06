/**
 * Single entry point for Owner / Company Today dashboard data.
 * Coalesces bundle + secondary panels in one in-flight promise per org+branches key.
 */
import { fetchCompanyTodayBundle, type CompanyTodayBundle } from './company-today-data-service';
import { fetchCompanyDataConfidence, type CompanyDataConfidenceRow } from './company-data-confidence-service';
import { fetchCompanyStatusSummary, type CompanyStatusSummaryRow } from './company-status-summary-service';
import { fetchCompanyTodayPriorities, type TodayPrioritiesRow } from './today-priorities-service';
import {
  defaultBranchPrioritiesFallback,
  fetchTodayBranchPriorities,
  filterTodayBranchPriorityRows,
  syntheticAccommodationPrioritiesFromTodayUi,
  syntheticFnbPrioritiesFromTodayUi,
  type TodayBranchPriorityRow,
} from './today-branch-priorities-service';
import {
  getAccommodationTodayMetricsUi,
  getFnbOperatingStatus,
  getFnbRevenueDeltaPct,
  getTodaySummary,
} from './latest-metrics-service';
import {
  dedupeWhatsWorkingHighlightLines,
  fetchWhatsWorkingToday,
  isWeakWhatsWorkingText,
  type WhatsWorkingTodayRow,
} from './whats-working-today-service';
import { fetchOpportunitiesToday, type OpportunitiesTodayRow } from './opportunities-today-service';
import { fetchWatchlistToday, type WatchlistTodayRow } from './watchlist-today-service';
import {
  fetchCompanyLatestBusinessStatusV3,
  type CompanyLatestBusinessStatusV3Row,
} from './company-latest-business-status-v3-service';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';
import {
  logPostgrestAlertsRead,
  logPostgrestPhase1Read,
  resolvePostgrestAlertsTable,
  resolvePostgrestPhase1Table,
} from '../../lib/supabase/postgrest-phase1-cutover';
import {
  SELECT_OPPORTUNITIES_TODAY_BRANCH,
  SELECT_WATCHLIST_TODAY_BRANCH,
  SELECT_WHATS_WORKING_TODAY_BRANCH,
} from './today-panels-columns';

export interface CompanyTodayDashboardData {
  bundle: CompanyTodayBundle;
  priorities: TodayPrioritiesRow[];
  whatsWorking: WhatsWorkingTodayRow[];
  opportunities: OpportunitiesTodayRow[];
  watchlist: WatchlistTodayRow[];
  dataConfidence: CompanyDataConfidenceRow | null;
  companyStatusSummary: CompanyStatusSummaryRow | null;
  /** Latest business status table — canonical `company_status_current`. */
  latestBusinessStatus: CompanyLatestBusinessStatusV3Row[];
}

const dashboardInFlight = new Map<string, Promise<CompanyTodayDashboardData>>();
const branchPanelsInFlight = new Map<string, Promise<BranchTodayPanels>>();

function dashboardKey(organizationId: string | null, branchIds: string[]): string {
  return `${organizationId ?? 'none'}::${[...branchIds].sort().join(',')}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (!isNaN(n) && isFinite(n)) return n;
    }
  }
  return null;
}

function normalizePanelText(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

function dedupeRepeatedSegments(input: string): string {
  const raw = input
    .split(/\s-\s|•|\u2022/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (raw.length <= 1) return input.trim();

  const kept: string[] = [];
  for (const seg of raw) {
    const nSeg = normalizePanelText(seg);
    const duplicateIdx = kept.findIndex((k) => {
      const nK = normalizePanelText(k);
      return nK === nSeg || nK.includes(nSeg) || nSeg.includes(nK);
    });
    if (duplicateIdx === -1) {
      kept.push(seg);
      continue;
    }
    if (seg.length > kept[duplicateIdx].length) {
      kept[duplicateIdx] = seg;
    }
  }
  return kept.join(' - ');
}

/** Branch What's Working: headline = title, grey line = description. */
function buildWhatsWorkingBranchLine(title: string, description: string): string {
  const t = title.trim();
  const detail = (description || '').trim();
  if (!t) return detail;
  if (!detail) return t;
  const nT = normalizePanelText(t);
  const nD = normalizePanelText(detail);
  if (nD === nT) return t;
  return `${t} - ${detail}`;
}

function isWeakWatchlistText(...parts: Array<string | null | undefined>): boolean {
  const n = normalizePanelText(parts.filter(Boolean).join(' | '));
  if (!n) return true;
  return (
    n.includes('no early warning signals detected') ||
    n.includes('no meaningful watchlist signals detected today') ||
    n.includes('business stable today') ||
    n.includes('operations stable today') ||
    n.includes('no urgent priority issues detected')
  );
}

function isGenericStableOpportunityText(...parts: Array<string | null | undefined>): boolean {
  const n = normalizePanelText(parts.filter(Boolean).join(' | '));
  if (!n) return true;
  return (
    n.includes('operations stable today') ||
    n.includes('no urgent priority issues detected') ||
    n.includes('no clear opportunities today') ||
    n.includes('ยังไม่มีโอกาสชัดเจนวันนี้')
  );
}

function mergeCompanyOpportunities(
  opportunities: OpportunitiesTodayRow[],
  bundle: CompanyTodayBundle,
  organizationId: string | null,
  branchNameById: Map<string, string>
): {
  rows: OpportunitiesTodayRow[];
  sourceUsed: string;
  dbActionableCount: number;
  fallbackActionableCount: number;
} {
  const byBranch = new Map<string, OpportunitiesTodayRow>();
  const dbActionable = opportunities.filter(
    (r) =>
      !isGenericStableOpportunityText(r.title, r.description, r.opportunity_text) &&
      (r.branch_id ?? '').trim().length > 0
  );
  for (const row of dbActionable) {
    const branchId = (row.branch_id ?? '').trim();
    if (!branchId || byBranch.has(branchId)) continue;
    byBranch.set(branchId, {
      ...row,
      branch_name: row.branch_name?.trim() || branchNameById.get(branchId) || null,
    });
  }

  const generatedFallback: OpportunitiesTodayRow[] = [];
  for (const row of bundle.businessStatus ?? []) {
    const branchId = (row.branchId ?? '').trim();
    if (!branchId) continue;

    if (row.branchType === 'accommodation') {
      const shouldShow =
        (row.healthScore != null && row.healthScore < 85) ||
        (row.occupancyPct != null && row.occupancyPct < 60) ||
        row.profitabilityTrend === 'down';
      if (!shouldShow) continue;
      generatedFallback.push({
        organization_id: organizationId,
        branch_id: branchId,
        branch_name: row.branchName ?? branchNameById.get(branchId) ?? null,
        metric_date: row.metricDate,
        title: 'Lift occupancy',
        description: 'Launch demand-capture packages and fenced OTA promos to recover occupancy without broad discounting.',
        opportunity_text: 'Capture shoulder-night demand with value-added offers and targeted channel pushes.',
        sort_score: row.occupancyPct != null ? Math.max(0, 100 - row.occupancyPct) : 40,
      });
      continue;
    }

    const shouldShow =
      (row.healthScore != null && row.healthScore < 85) ||
      row.marginTrend === 'down' ||
      (row.avgTicketThb != null && row.avgTicketThb < 220);
    if (!shouldShow) continue;
    generatedFallback.push({
      organization_id: organizationId,
      branch_id: branchId,
      branch_name: row.branchName ?? branchNameById.get(branchId) ?? null,
      metric_date: row.metricDate,
      title: 'Increase avg ticket',
      description: 'Push bundles and premium add-ons to raise basket size during active demand windows.',
      opportunity_text: 'Use menu engineering and checkout prompts to lift average spend per customer.',
      sort_score: row.avgTicketThb != null ? Math.max(0, 260 - row.avgTicketThb) : 35,
    });
  }

  for (const row of generatedFallback) {
    const branchId = (row.branch_id ?? '').trim();
    if (!branchId || byBranch.has(branchId)) continue;
    byBranch.set(branchId, {
      organization_id: row.organization_id ?? organizationId,
      branch_id: branchId,
      branch_name: row.branch_name?.trim() || branchNameById.get(branchId) || null,
      metric_date: row.metric_date ?? null,
      title: row.title,
      description: row.description,
      opportunity_text: row.opportunity_text || row.description,
      sort_score: row.sort_score,
    });
  }

  const merged = Array.from(byBranch.values())
    .sort((a, b) => (b.sort_score ?? Number.NEGATIVE_INFINITY) - (a.sort_score ?? Number.NEGATIVE_INFINITY))
    .slice(0, 3);
  return {
    rows: merged,
    sourceUsed:
      dbActionable.length > 0 && merged.length > dbActionable.length
        ? 'opportunities_today+generated_opportunity_fallback'
        : dbActionable.length > 0
          ? 'opportunities_today'
          : 'generated_opportunity_fallback',
    dbActionableCount: dbActionable.length,
    fallbackActionableCount: generatedFallback.length,
  };
}

function dedupeOpportunityLine(parts: {
  branchId: string;
  title: string;
  description: string;
  opportunityText: string;
}): string {
  const title = parts.title.trim();
  const opp = parts.opportunityText.trim();
  const desc = parts.description.trim();
  if (title && opp) {
    return dedupeRepeatedSegments(`${title} - ${opp}`);
  }
  if (title && desc) {
    return dedupeRepeatedSegments(`${title} - ${desc}`);
  }
  return dedupeRepeatedSegments(title || opp || desc);
}

/** Branch snapshot: one row per (branch_id, title, opportunity_text), highest sort_score first. */
function dedupeBranchOpportunityRowsByTitleAndText(
  branchId: string,
  rows: Array<{
    title: string;
    description: string;
    opportunityText: string;
    sort_score: number | null;
  }>,
  cap: number
): Array<{
  title: string;
  description: string;
  opportunityText: string;
  sort_score: number | null;
}> {
  const sorted = [...rows].sort(
    (a, b) => (b.sort_score ?? Number.NEGATIVE_INFINITY) - (a.sort_score ?? Number.NEGATIVE_INFINITY),
  );
  const seen = new Set<string>();
  const out: Array<{
    title: string;
    description: string;
    opportunityText: string;
    sort_score: number | null;
  }> = [];
  const bid = branchId.trim();
  for (const row of sorted) {
    const key = `${bid}|${row.title.trim().toLowerCase().replace(/\s+/g, ' ')}|${row.opportunityText.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

function withCompanyRankAndSegment(rows: TodayPrioritiesRow[], limit: number): TodayPrioritiesRow[] {
  return rows.slice(0, limit).map((r, i) => {
    const rank = i + 1;
    const priority_segment = rank === 1 ? 'fix_first' : rank >= 2 && rank <= 4 ? 'next_moves' : 'more';
    return { ...r, rank, priority_segment };
  });
}

function branchPriorityRowToCompanyRow(
  organizationId: string,
  br: TodayBranchPriorityRow,
  branchDisplayName?: string | null
): TodayPrioritiesRow {
  const bt =
    br.business_type === 'fnb' || br.business_type === 'accommodation' ? br.business_type : 'accommodation';
  return {
    branch_id: br.branch_id,
    business_type: bt,
    organization_id: organizationId,
    branch_name: branchDisplayName?.trim() || null,
    alert_type: null,
    title: br.title,
    description: br.description,
    action_text: br.action_text,
    short_title: br.short_title,
    impact_thb: br.impact_thb,
    impact_estimate_thb: br.impact_estimate_thb,
    impact_label: br.impact_label,
    reason_short: null,
    sort_score: br.sort_score,
    rank: null,
    priority_segment: null,
  };
}

function branchMetaFromBundle(
  bundle: CompanyTodayBundle,
  branchId: string
): { name: string; branchType: 'accommodation' | 'fnb' } {
  const row = bundle.businessStatus.find((x) => x.branchId === branchId);
  const name = row?.branchName?.trim() || branchId;
  const branchType = row?.branchType === 'fnb' ? 'fnb' : 'accommodation';
  return { name, branchType };
}

/**
 * When org-scoped SQL priorities are empty, mirror branch Today: per-branch `branch_priorities_current`,
 * then the same synthetic + default fallbacks as branch overview (fallbacks only when branch view is empty).
 */
async function fillCompanyPrioritiesFromBranchesAndUi(
  organizationId: string,
  branchIds: string[],
  bundle: CompanyTodayBundle,
  locale: 'en' | 'th',
  limit: number
): Promise<TodayPrioritiesRow[]> {
  const bids = [...new Set(branchIds.map((x) => x.trim()).filter(Boolean))];
  if (bids.length === 0) return [];

  /** One top priority per branch (same source + filters as branch overview), then org-wide sort. */
  const fromPerBranchView = (
    await Promise.all(
      bids.map(async (bid) => {
        const { branchType, name } = branchMetaFromBundle(bundle, bid);
        const rows = await fetchTodayBranchPriorities(bid, branchType, 100, locale);
        const fnbDelta = branchType === 'fnb' ? await getFnbRevenueDeltaPct(bid) : undefined;
        const filtered = filterTodayBranchPriorityRows(rows, {
          isFnb: branchType === 'fnb',
          fnbRevenueDeltaPct: fnbDelta,
        });
        const top = filtered[0];
        return top ? [branchPriorityRowToCompanyRow(organizationId, top, name)] : [];
      })
    )
  ).flat();

  const sortedView = fromPerBranchView.sort(
    (a, b) => (b.sort_score ?? 0) - (a.sort_score ?? 0)
  );
  if (sortedView.length > 0) {
    return withCompanyRankAndSegment(sortedView, limit);
  }

  const syntheticFlat: TodayPrioritiesRow[] = [];
  for (const bid of bids) {
    const { name, branchType } = branchMetaFromBundle(bundle, bid);
    const fnbDelta = branchType === 'fnb' ? await getFnbRevenueDeltaPct(bid) : undefined;
    let brRows: TodayBranchPriorityRow[] = [];
    if (branchType === 'fnb') {
      const fnb = await getFnbOperatingStatus(bid);
      const summary = await getTodaySummary(bid, { uiSurface: 'fnb' });
      brRows = syntheticFnbPrioritiesFromTodayUi(
        bid,
        name,
        {
          metric_date: fnb?.metric_date ?? null,
          revenue: fnb?.revenue ?? null,
          customers: fnb?.customers ?? null,
          revenue_delta_day:
            summary?.revenue_delta_day != null && Number.isFinite(Number(summary.revenue_delta_day))
              ? Number(summary.revenue_delta_day)
              : null,
        },
        locale
      );
      if (brRows.length === 0) {
        brRows = defaultBranchPrioritiesFallback(bid, name, 'fnb', locale);
      }
    } else {
      const acc = await getAccommodationTodayMetricsUi(bid);
      brRows = syntheticAccommodationPrioritiesFromTodayUi(bid, name, acc, locale);
      if (brRows.length === 0) {
        brRows = defaultBranchPrioritiesFallback(bid, name, 'accommodation', locale);
      }
    }
    const filtered = filterTodayBranchPriorityRows(brRows, {
      isFnb: branchType === 'fnb',
      fnbRevenueDeltaPct: fnbDelta,
    });
    const top = filtered[0];
    if (top) {
      syntheticFlat.push(branchPriorityRowToCompanyRow(organizationId, top, name));
    }
  }

  syntheticFlat.sort((a, b) => (b.sort_score ?? 0) - (a.sort_score ?? 0));
  return withCompanyRankAndSegment(syntheticFlat, limit);
}

async function fetchCompanyPanelsFromDashboardView(
  organizationId: string,
  prioritiesLimit: number,
  panelLimit: number
): Promise<{
  priorities: TodayPrioritiesRow[];
  whatsWorking: WhatsWorkingTodayRow[];
  opportunities: OpportunitiesTodayRow[];
  watchlist: WatchlistTodayRow[];
  dataConfidence: CompanyDataConfidenceRow | null;
} | null> {
  // Schema cleanup: `public.today_company_dashboard` was deleted. Do not call it.
  // Keep the fallback path below (panels loaded individually).
  return null;
}

/**
 * One parallel batch: company bundle (business + critical + alerts_today) + org-scoped panels + data confidence.
 */
export async function fetchCompanyTodayDashboard(
  organizationId: string | null,
  branchIds: string[],
  options?: { prioritiesLimit?: number; panelLimit?: number; locale?: 'en' | 'th' }
): Promise<CompanyTodayDashboardData> {
  const key = dashboardKey(organizationId, branchIds);
  const existing = dashboardInFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const prioLim = options?.prioritiesLimit ?? 5;
    const panelLim = options?.panelLimit ?? 3;
    const locale: 'en' | 'th' = options?.locale === 'th' ? 'th' : 'en';
    const orgId = organizationId?.trim() ?? null;
    const bundlePromise = fetchCompanyTodayBundle(orgId, branchIds);

    const panelsPromise = (async () => {
      if (!orgId) {
        return {
          priorities: [] as TodayPrioritiesRow[],
          whatsWorking: [] as WhatsWorkingTodayRow[],
          opportunities: [] as OpportunitiesTodayRow[],
          watchlist: [] as WatchlistTodayRow[],
          dataConfidence: null as CompanyDataConfidenceRow | null,
          companyStatusSummary: null as CompanyStatusSummaryRow | null,
        };
      }
      const fromDashboard = await fetchCompanyPanelsFromDashboardView(orgId, prioLim, panelLim);
      if (fromDashboard) {
        return {
          ...fromDashboard,
          companyStatusSummary: await fetchCompanyStatusSummary(orgId),
        };
      }
      // Fallback path until `today_company_dashboard` is deployed.
      // What's Working is loaded separately via `fetchWhatsWorkingToday` (v_next) in the outer bundle — not from panels here.
      const [priorities, opportunities, watchlist, dataConfidence] = await Promise.all([
        fetchCompanyTodayPriorities(orgId, prioLim),
        fetchOpportunitiesToday(orgId, panelLim),
        fetchWatchlistToday(orgId, panelLim),
        fetchCompanyDataConfidence(orgId),
      ]);
      return {
        priorities,
        whatsWorking: [] as WhatsWorkingTodayRow[],
        opportunities,
        watchlist,
        dataConfidence,
        companyStatusSummary: await fetchCompanyStatusSummary(orgId),
      };
    })();

    const latestStatusPromise =
      orgId && branchIds.length > 0
        ? fetchCompanyLatestBusinessStatusV3(orgId, branchIds)
        : orgId
          ? fetchCompanyLatestBusinessStatusV3(orgId, [])
          : Promise.resolve([] as CompanyLatestBusinessStatusV3Row[]);

    const companyStatusSummaryPromise = orgId ? fetchCompanyStatusSummary(orgId) : Promise.resolve(null);
    const [bundle, panels, latestBusinessStatus, canonicalWatchlist, canonicalWhatsWorking, companyStatusSummary] = await Promise.all([
      bundlePromise,
      panelsPromise,
      latestStatusPromise,
      orgId ? fetchWatchlistToday(orgId, 20) : Promise.resolve([] as WatchlistTodayRow[]),
      orgId ? fetchWhatsWorkingToday(orgId, Math.max(panelLim, 20)) : Promise.resolve([] as WhatsWorkingTodayRow[]),
      companyStatusSummaryPromise,
    ]);

    // Company status table keeps its existing source for non-health fields.
    // Health is always overridden from branch page source-of-truth:
    // Canonical path: `company_status_current` already carries health from branch_health_current.
    if (process.env.NODE_ENV === 'development') {
      const oldRenderedHealthByBranch = new Map(bundle.businessStatus.map((r) => [r.branchId, r.healthScore] as const));
      latestBusinessStatus.forEach((row) => {
        const canonical = row.health_score == null ? null : Number(row.health_score);
        const oldRendered = oldRenderedHealthByBranch.get(row.branch_id);
        const oldNum = oldRendered == null ? null : Number(oldRendered);
        if (canonical != null && oldNum != null && canonical !== oldNum) {
          console.log('[health-canonical-mismatch]', {
            page_context: 'company_today_latest_business_status',
            branch_id: row.branch_id,
            business_type: row.business_type,
            canonical_health: canonical,
            old_rendered_health: oldNum,
          });
        }
      });
    }

    let priorities = panels.priorities;
    if (orgId && branchIds.length > 0) {
      try {
        const fromBranches = await fillCompanyPrioritiesFromBranchesAndUi(orgId, branchIds, bundle, locale, prioLim);
        priorities = fromBranches.length > 0 ? fromBranches : panels.priorities;
      } catch {
        priorities = panels.priorities;
      }
    }

    const branchNameById = new Map(
      (bundle.businessStatus ?? [])
        .map((r) => [r.branchId?.trim(), r.branchName?.trim()] as const)
        .filter((x): x is readonly [string, string] => Boolean(x[0] && x[1]))
    );
    const mergedOpportunities = mergeCompanyOpportunities(
      panels.opportunities,
      bundle,
      orgId,
      branchNameById
    );
    const canonicalWhatsWorkingWithBranchNames = (canonicalWhatsWorking ?? []).map((row) => {
      const branchId = (row.branch_id ?? '').trim();
      return {
        ...row,
        branch_name: row.branch_name?.trim() || (branchId ? branchNameById.get(branchId) ?? null : null),
      };
    });
    const canonicalWatchlistWithBranchNames = canonicalWatchlist.map((row) => {
      const branchId = (row.branch_id ?? '').trim();
      const fallbackBranchName = branchId ? branchNameById.get(branchId) ?? null : null;
      return {
        ...row,
        branch_name: row.branch_name?.trim() || fallbackBranchName,
      };
    });

    if (process.env.NODE_ENV === 'development' && orgId) {
      console.log('[opportunities-source]', {
        page_context: 'company',
        organization_id: orgId,
        source_used: mergedOpportunities.sourceUsed,
        rows_returned: panels.opportunities.length,
        actionable_rows_count: mergedOpportunities.dbActionableCount,
        fallback_actionable_rows_count: mergedOpportunities.fallbackActionableCount,
        selected_rows_after_fallback: mergedOpportunities.rows.map((r) => ({
          branch_id: r.branch_id,
          branch_name: r.branch_name,
          title: r.title,
          detail: r.opportunity_text || r.description || null,
        })),
      });
    }

    return {
      bundle,
      priorities,
      whatsWorking: canonicalWhatsWorkingWithBranchNames,
      opportunities: mergedOpportunities.rows,
      // Canonical source for company Watchlist: watchlist_today.
      watchlist: canonicalWatchlistWithBranchNames,
      dataConfidence: panels.dataConfidence,
      companyStatusSummary: panels.companyStatusSummary ?? companyStatusSummary,
      latestBusinessStatus,
    };
  })().finally(() => {
    dashboardInFlight.delete(key);
  });

  dashboardInFlight.set(key, p);
  return p;
}

/** Latest row from public.business_trends_today for branch overview (max metric_date). */
export interface BranchBusinessTrendsSnapshot {
  metric_date: string | null;
  template_key: string | null;
  trend_text: string;
  read_text: string;
  meaning_text: string;
}

export interface BranchTodayPanels {
  workingLines: string[];
  opportunityLines: string[];
  watchlistLines: string[];
  businessTrends: BranchBusinessTrendsSnapshot | null;
  watchlistMeta?: {
    rowsReturned: number;
    latestMetricDate: string | null;
    relationName: string;
  };
}

async function fetchBranchTodayPanelsCore(branchId: string, branchLabel: string): Promise<BranchTodayPanels> {
  const empty: BranchTodayPanels = {
    workingLines: [],
    opportunityLines: [],
    watchlistLines: [],
    businessTrends: null,
    watchlistMeta: { rowsReturned: 0, latestMetricDate: null, relationName: 'watchlist_today' },
  };
  const bid = branchId?.trim();
  if (!bid || !isSupabaseAvailable()) return empty;
  const supabase = getSupabaseClient();
  if (!supabase) return empty;

  const applyWorkingSubstitutions = (txt: string): string => {
    if (/performance stable across branches/i.test(txt)) {
      return `${branchLabel} operating normally — no major issues detected`;
    }
    if (/no major operational risks detected/i.test(txt)) {
      return `${branchLabel} operating normally — no major issues detected`;
    }
    return txt;
  };

  const BT_TABLE = 'business_trends_today';
  const SELECT_BUSINESS_TRENDS_BRANCH =
    'metric_date,template_key,trend_text,read_text,meaning_text,sort_score';

  const [workingRes, oppRes, watchRes, trendsRes] = await Promise.all([
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.whats_working_today)) return [];
      const wwTable = 'whats_working_today';
      const { data, error } = await supabase
        .from(wwTable)
        .select(SELECT_WHATS_WORKING_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('metric_date', { ascending: false })
        .order('sort_score', { ascending: false })
        .limit(40);
      const wwRaw = Array.isArray(data) ? data : [];
      logPostgrestPhase1Read('whats_working_today', {
        branchId: bid,
        rowCount: wwRaw.length,
        error: error ? { message: error.message, code: String(error.code ?? '') } : null,
      });
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.whats_working_today);
        }
        return [];
      }
      if (!Array.isArray(data)) return [];
      const rows = data as Array<Record<string, unknown>>;
      type ParsedWw = {
        title: string;
        description: string;
        whats_working_text: string;
        metric_date: string;
        sort_score: number | null;
        weak: boolean;
      };
      const parsed: ParsedWw[] = rows
        .map((row) => {
          const r = row as Record<string, unknown>;
          const title = pickStr(r, 'title');
          const description = pickStr(r, 'description');
          const whats_working_text = pickStr(r, 'whats_working_text', 'whatsWorkingText');
          const metric_date = r.metric_date != null ? String(r.metric_date).slice(0, 10) : '';
          const sort_score = pickNum(r, 'sort_score');
          return {
            title,
            description,
            whats_working_text,
            metric_date,
            sort_score,
            weak: isWeakWhatsWorkingText(title, description, whats_working_text),
          };
        })
        .filter((p) => Boolean(p.title || p.description));
      parsed.sort((a, b) => {
        const dc = b.metric_date.localeCompare(a.metric_date);
        if (dc !== 0) return dc;
        return (b.sort_score ?? Number.NEGATIVE_INFINITY) - (a.sort_score ?? Number.NEGATIVE_INFINITY);
      });
      const meaningfulRows = parsed.filter((p) => !p.weak);
      const picked = meaningfulRows.length > 0 ? meaningfulRows[0] : parsed[0];
      if (!picked) return [];
      const rawLine = buildWhatsWorkingBranchLine(
        picked.title,
        picked.whats_working_text || picked.description,
      );
      const line = applyWorkingSubstitutions(rawLine);
      if (process.env.NODE_ENV === 'development') {
        const parts = line.includes(' - ') ? line.split(' - ') : [line];
        const head = parts[0]?.trim() ?? line;
        const tail = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
        console.log('[whats-working-source]', {
          page_context: 'branch',
          branch_id: bid,
          source_relation: wwTable,
          rows_returned: wwRaw.length,
          meaningful_rows_count: meaningfulRows.length,
          selected_title: picked.title || null,
          selected_description: picked.description || null,
          final_title_shown: head || null,
          final_detail_shown: tail || null,
          fallback_used: picked.weak,
        });
      }
      return dedupeWhatsWorkingHighlightLines([line]).slice(0, 1);
    })(),
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.opportunities_today)) return [];
      const opTable = resolvePostgrestAlertsTable('opportunities_today');

      const { data: headData, error: headError } = await supabase
        .from(opTable)
        .select('metric_date')
        .eq('branch_id', bid)
        .order('metric_date', { ascending: false })
        .limit(1);

      if (headError) {
        logPostgrestAlertsRead('opportunities_today', {
          branchId: bid,
          rowCount: 0,
          error: { message: headError.message, code: String(headError.code ?? '') },
        });
        if (isPostgrestObjectMissingError(headError)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.opportunities_today);
        }
        return [];
      }

      const headRows = Array.isArray(headData) ? headData : [];
      const latestMetricDateRaw = headRows[0] != null ? (headRows[0] as Record<string, unknown>).metric_date : null;
      const latestMetricDate =
        latestMetricDateRaw != null ? String(latestMetricDateRaw).slice(0, 10) : '';
      if (!latestMetricDate) {
        logPostgrestAlertsRead('opportunities_today', {
          branchId: bid,
          rowCount: 0,
          error: null,
        });
        return [];
      }

      const { data, error } = await supabase
        .from(opTable)
        .select(SELECT_OPPORTUNITIES_TODAY_BRANCH)
        .eq('branch_id', bid)
        .eq('metric_date', latestMetricDate)
        .order('sort_score', { ascending: false })
        .limit(40);

      const opRaw = Array.isArray(data) ? data : [];
      logPostgrestAlertsRead('opportunities_today', {
        branchId: bid,
        rowCount: opRaw.length,
        error: error ? { message: error.message, code: String(error.code ?? '') } : null,
      });
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.opportunities_today);
        }
        return [];
      }
      if (!Array.isArray(data)) return [];

      const parsed = data.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          title: pickStr(r, 'title'),
          description: pickStr(r, 'description'),
          opportunityText: pickStr(r, 'opportunity_text', 'opportunityText'),
          sort_score: pickNum(r, 'sort_score'),
        };
      });

      const deduped = dedupeBranchOpportunityRowsByTitleAndText(bid, parsed, 3);

      return deduped
        .map((row) =>
          dedupeOpportunityLine({
            branchId: bid,
            title: row.title,
            description: row.description,
            opportunityText: row.opportunityText,
          }),
        )
        .filter(Boolean)
        .slice(0, 3);
    })(),
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.watchlist_today)) {
        return {
          lines: [] as string[],
          rowsReturned: 0,
          latestMetricDate: null as string | null,
          relationName: 'watchlist_today',
        };
      }
      const wlTable = 'watchlist_today';
      const { data, error } = await supabase
        .from(wlTable)
        .select(SELECT_WATCHLIST_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('metric_date', { ascending: false })
        .order('sort_score', { ascending: false })
        .limit(20);
      const wlRaw = Array.isArray(data) ? data : [];
      logPostgrestPhase1Read('watchlist_today', {
        branchId: bid,
        rowCount: wlRaw.length,
        error: error ? { message: error.message, code: String(error.code ?? '') } : null,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[watchlist-trace-db-fetch]', {
          branch_id: bid,
          source_relation_used: wlTable,
          rows_returned: wlRaw.length,
          first_row: wlRaw[0] ?? null,
        });
      }
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.watchlist_today);
        }
        return {
          lines: [] as string[],
          rowsReturned: wlRaw.length,
          latestMetricDate: null as string | null,
          relationName: wlTable,
        };
      }
      if (!Array.isArray(data)) {
        return {
          lines: [] as string[],
          rowsReturned: 0,
          latestMetricDate: null as string | null,
          relationName: wlTable,
        };
      }
      const rows = data as Array<Record<string, unknown>>;
      const latestMetricDate = rows
        .map((r) => (r.metric_date != null ? String(r.metric_date).slice(0, 10) : ''))
        .find((d) => d.length > 0) || null;
      const latestRows = latestMetricDate
        ? rows.filter((r) => String(r.metric_date ?? '').slice(0, 10) === latestMetricDate)
        : rows;
      const entries = latestRows
        .map((row) => {
          const r = row as Record<string, unknown>;
          const title = pickStr(r, 'title');
          const description = pickStr(r, 'description');
          const watchlistText = pickStr(r, 'watchlist_text', 'watchlistText');
          const line = buildWhatsWorkingBranchLine(title, watchlistText || description);
          return {
            line,
            weak: isWeakWatchlistText(title, description, watchlistText),
          };
        })
        .filter((x) => Boolean(x.line));
      const meaningful = entries.filter((x) => !x.weak);
      const selected = meaningful.length > 0 ? meaningful : entries;
      const lines = selected.map((x) => x.line).slice(0, 1);
      if (process.env.NODE_ENV === 'development') {
        console.log('[watchlist-trace-latest-date]', {
          branch_id: bid,
          latest_metric_date: latestMetricDate,
          latest_rows_count: latestRows.length,
          meaningful_rows_count: meaningful.length,
          selected_rows_after_latest_filter: selected.slice(0, 3).map((x) => x.line),
          selected_line: lines[0] ?? null,
        });
      }
      return {
        lines,
        rowsReturned: rows.length,
        latestMetricDate,
        relationName: wlTable,
      };
    })(),
    (async (): Promise<BranchBusinessTrendsSnapshot | null> => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.business_trends_today)) return null;
      const { data, error } = await supabase
        .from(BT_TABLE)
        .select(SELECT_BUSINESS_TRENDS_BRANCH)
        .eq('branch_id', bid)
        .order('metric_date', { ascending: false })
        .order('sort_score', { ascending: false })
        .limit(1);
      const raw = Array.isArray(data) ? data : [];
      if (process.env.NODE_ENV === 'development') {
        console.log('[business-trends-today]', {
          branch_id: bid,
          row_count: raw.length,
          error: error ? { message: error.message, code: String(error.code ?? '') } : null,
        });
      }
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.business_trends_today);
        }
        return null;
      }
      const row = raw[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      const trend_text = pickStr(row, 'trend_text', 'trendText');
      const read_text = pickStr(row, 'read_text', 'readText');
      const meaning_text = pickStr(row, 'meaning_text', 'meaningText');
      if (!trend_text && !read_text && !meaning_text) return null;
      return {
        metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
        template_key: pickStr(row, 'template_key', 'templateKey') || null,
        trend_text: trend_text || '',
        read_text: read_text || '',
        meaning_text: meaning_text || '',
      };
    })(),
  ]);

  return {
    workingLines: workingRes,
    opportunityLines: oppRes,
    watchlistLines: watchRes.lines,
    businessTrends: trendsRes,
    watchlistMeta: {
      rowsReturned: watchRes.rowsReturned,
      latestMetricDate: watchRes.latestMetricDate,
      relationName: watchRes.relationName,
    },
  };
}

/**
 * Branch Today: three panels; deduped in-flight per branchId (StrictMode / double mount).
 */
export async function fetchBranchTodayPanels(branchId: string, branchLabel: string): Promise<BranchTodayPanels> {
  const bid = branchId?.trim() ?? '';
  if (!bid) {
    return {
      workingLines: [],
      opportunityLines: [],
      watchlistLines: [],
      businessTrends: null,
      watchlistMeta: { rowsReturned: 0, latestMetricDate: null, relationName: 'watchlist_today' },
    };
  }
  const inflight = branchPanelsInFlight.get(bid);
  if (inflight) return inflight;
  const p = fetchBranchTodayPanelsCore(branchId, branchLabel).finally(() => {
    branchPanelsInFlight.delete(bid);
  });
  branchPanelsInFlight.set(bid, p);
  return p;
}
