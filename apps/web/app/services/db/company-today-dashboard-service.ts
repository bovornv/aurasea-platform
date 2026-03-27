/**
 * Single entry point for Owner / Company Today dashboard data.
 * Coalesces bundle + secondary panels in one in-flight promise per org+branches key.
 */
import { fetchCompanyTodayBundle, type CompanyTodayBundle } from './company-today-data-service';
import { fetchCompanyDataConfidence, type CompanyDataConfidenceRow } from './company-data-confidence-service';
import { fetchCompanyTodayPriorities, type TodayPrioritiesRow } from './today-priorities-service';
import {
  defaultBranchPrioritiesFallback,
  fetchTodayBranchPriorities,
  syntheticAccommodationPrioritiesFromTodayUi,
  syntheticFnbPrioritiesFromTodayUi,
  type TodayBranchPriorityRow,
} from './today-branch-priorities-service';
import {
  getAccommodationTodayMetricsUi,
  getFnbOperatingStatus,
  getTodaySummary,
} from './latest-metrics-service';
import { fetchWhatsWorkingToday, type WhatsWorkingTodayRow } from './whats-working-today-service';
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
import { dedupeWhatsWorkingHighlightLines } from './whats-working-today-service';
import {
  resolveTodayPanelDisplay,
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

function composeDedupedPanelLine(parts: {
  title: string;
  description: string;
  primary: string;
}): string {
  const title = parts.title.trim();
  const description = parts.description.trim();
  const primary = parts.primary.trim();

  const nDesc = normalizePanelText(description);
  const nPrimary = normalizePanelText(primary);

  let secondary = '';
  if (nPrimary && nDesc) {
    if (nPrimary === nDesc) {
      secondary = primary.length >= description.length ? primary : description;
    } else if (nPrimary.includes(nDesc)) {
      secondary = primary;
    } else if (nDesc.includes(nPrimary)) {
      secondary = description;
    } else {
      secondary = primary;
    }
  } else {
    secondary = primary || description;
  }

  secondary = dedupeRepeatedSegments(secondary);
  const nTitle = normalizePanelText(title);
  const nSecondary = normalizePanelText(secondary);
  if (nTitle && nSecondary && (nSecondary === nTitle || nSecondary.startsWith(`${nTitle} -`) || nSecondary.includes(nTitle))) {
    secondary = dedupeRepeatedSegments(
      secondary
        .replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i'), '')
        .trim()
    );
  }

  return title && secondary ? `${title} - ${secondary}` : title || secondary;
}

function dedupeOpportunityLine(parts: {
  branchId: string;
  title: string;
  description: string;
  opportunityText: string;
}): string {
  const finalText = composeDedupedPanelLine({
    title: parts.title,
    description: parts.description,
    primary: parts.opportunityText,
  });
  const nDesc = normalizePanelText(parts.description);
  const nOpp = normalizePanelText(parts.opportunityText);
  if (process.env.NODE_ENV === 'development' && nOpp && nDesc && (nOpp === nDesc || nOpp.includes(nDesc) || nDesc.includes(nOpp))) {
    console.log('[branch-opportunity-text-dedup]', {
      branch_id: parts.branchId,
      title: parts.title || null,
      description: parts.description || null,
      opportunity_text: parts.opportunityText || null,
      final_rendered_text: finalText || null,
    });
  }
  return finalText;
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
 * When org-scoped SQL priorities are empty, mirror branch Today: per-branch `today_priorities_view`,
 * then the same synthetic + default fallbacks as branch overview.
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

  const fromPerBranchView = (
    await Promise.all(
      bids.map(async (bid) => {
        const { branchType, name } = branchMetaFromBundle(bundle, bid);
        const rows = await fetchTodayBranchPriorities(bid, branchType, 4, locale);
        return rows.map((br) => branchPriorityRowToCompanyRow(organizationId, br, name));
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
    syntheticFlat.push(...brRows.map((br) => branchPriorityRowToCompanyRow(organizationId, br, name)));
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
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.today_company_dashboard)) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('today_company_dashboard')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.today_company_dashboard);
      return null;
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[today_company_dashboard]', error.message);
    }
    return null;
  }

  const root = asRecord(data);
  if (!root) {
    return {
      priorities: [],
      whatsWorking: [],
      opportunities: [],
      watchlist: [],
      dataConfidence: null,
    };
  }

  const priorities = asRecordArray(root.priorities)
    .slice(0, Math.max(1, Math.min(5, prioritiesLimit)))
    .map((r): TodayPrioritiesRow => ({
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      business_type: pickStr(r, 'business_type', 'businessType') || null,
      organization_id: organizationId,
      branch_name: pickStr(r, 'branch_name', 'branchName') || null,
      alert_type: pickStr(r, 'alert_type', 'alertType') || null,
      title: pickStr(r, 'title') || null,
      description: pickStr(r, 'description') || null,
      action_text: pickStr(r, 'description', 'action_text', 'actionText') || null,
      short_title: pickStr(r, 'title', 'short_title', 'shortTitle') || null,
      impact_estimate_thb: pickNum(r, 'impact_estimate_thb', 'impact_thb'),
      impact_thb: pickNum(r, 'impact_thb', 'impact_estimate_thb'),
      impact_label: pickStr(r, 'impact_label', 'impactLabel') || null,
      reason_short: pickStr(r, 'reason_short', 'reasonShort', 'cause') || null,
      sort_score: pickNum(r, 'sort_score', 'priority_score'),
      rank: pickNum(r, 'rank'),
      priority_segment: pickStr(r, 'priority_segment', 'prioritySegment') || null,
    }));

  const whatsWorking = asRecordArray(root.whats_working)
    .slice(0, Math.max(1, Math.min(10, panelLimit)))
    .map((r): WhatsWorkingTodayRow => ({
      organization_id: organizationId,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: null,
      metric_date: pickStr(r, 'metric_date') || null,
      title: pickStr(r, 'title') || null,
      description: pickStr(r, 'description') || null,
      highlight_text: pickStr(r, 'highlight_text', 'highlightText', 'title', 'description') || null,
      sort_score: pickNum(r, 'sort_score'),
    }));

  const opportunities = asRecordArray(root.opportunities)
    .slice(0, Math.max(1, Math.min(10, panelLimit)))
    .map((r): OpportunitiesTodayRow => ({
      organization_id: organizationId,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: null,
      metric_date: pickStr(r, 'metric_date') || null,
      title: pickStr(r, 'title') || null,
      description: pickStr(r, 'description') || null,
      opportunity_text: pickStr(r, 'opportunity_text', 'opportunityText', 'title', 'description') || null,
      sort_score: pickNum(r, 'sort_score'),
    }));

  const watchlist = asRecordArray(root.watchlist)
    .slice(0, Math.max(1, Math.min(3, panelLimit)))
    .map((r): WatchlistTodayRow => ({
      organization_id: organizationId,
      branch_id: pickStr(r, 'branch_id', 'branchId'),
      branch_name: null,
      metric_date: pickStr(r, 'metric_date') || null,
      title: pickStr(r, 'title') || null,
      description: pickStr(r, 'description') || null,
      warning_text: pickStr(r, 'warning_text', 'warningText', 'title', 'description') || null,
      sort_score: pickNum(r, 'sort_score'),
    }));

  const confidenceRaw = asRecord(root.confidence);
  const dataConfidence: CompanyDataConfidenceRow | null = confidenceRaw
    ? {
        organization_id: pickStr(confidenceRaw, 'organization_id') || organizationId,
        data_days: Math.max(0, Math.round(pickNum(confidenceRaw, 'data_days') ?? 0)),
        max_days: Math.max(1, Math.round(pickNum(confidenceRaw, 'max_days') ?? 30)),
        confidence_level: pickStr(confidenceRaw, 'confidence_level') || 'Low',
      }
    : null;

  return { priorities, whatsWorking, opportunities, watchlist, dataConfidence };
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
        };
      }
      const fromDashboard = await fetchCompanyPanelsFromDashboardView(orgId, prioLim, panelLim);
      if (fromDashboard) return fromDashboard;
      // Fallback path until `today_company_dashboard` is deployed.
      const [priorities, whatsWorking, opportunities, watchlist, dataConfidence] = await Promise.all([
        fetchCompanyTodayPriorities(orgId, prioLim),
        fetchWhatsWorkingToday(orgId, panelLim),
        fetchOpportunitiesToday(orgId, panelLim),
        fetchWatchlistToday(orgId, panelLim),
        fetchCompanyDataConfidence(orgId),
      ]);
      return { priorities, whatsWorking, opportunities, watchlist, dataConfidence };
    })();

    const latestStatusPromise =
      orgId && branchIds.length > 0
        ? fetchCompanyLatestBusinessStatusV3(orgId, branchIds)
        : orgId
          ? fetchCompanyLatestBusinessStatusV3(orgId, [])
          : Promise.resolve([] as CompanyLatestBusinessStatusV3Row[]);

    const [bundle, panels, latestBusinessStatus, canonicalWatchlist] = await Promise.all([
      bundlePromise,
      panelsPromise,
      latestStatusPromise,
      orgId ? fetchWatchlistToday(orgId, 20) : Promise.resolve([] as WatchlistTodayRow[]),
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
    if (orgId && priorities.length === 0 && branchIds.length > 0) {
      try {
        priorities = await fillCompanyPrioritiesFromBranchesAndUi(orgId, branchIds, bundle, locale, prioLim);
      } catch {
        priorities = panels.priorities;
      }
    }

    return {
      bundle,
      priorities,
      whatsWorking: panels.whatsWorking,
      opportunities: panels.opportunities,
      // Canonical source for company Watchlist: watchlist_today_v_next directly.
      watchlist: canonicalWatchlist,
      dataConfidence: panels.dataConfidence,
      latestBusinessStatus,
    };
  })().finally(() => {
    dashboardInFlight.delete(key);
  });

  dashboardInFlight.set(key, p);
  return p;
}

export interface BranchTodayPanels {
  workingLines: string[];
  opportunityLines: string[];
  watchlistLines: string[];
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
    watchlistMeta: { rowsReturned: 0, latestMetricDate: null, relationName: 'watchlist_today_v_next' },
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

  const [workingRes, oppRes, watchRes] = await Promise.all([
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.whats_working_today)) return [];
      const wwTable = resolvePostgrestPhase1Table('whats_working_today');
      const { data, error } = await supabase
        .from(wwTable)
        .select(SELECT_WHATS_WORKING_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('sort_score', { ascending: false })
        .limit(3);
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
      const lines = data
        .map((row) => {
          const r = row as Record<string, unknown>;
          const line = composeDedupedPanelLine({
            title: pickStr(r, 'title'),
            description: pickStr(r, 'description'),
            primary: pickStr(r, 'highlight_text', 'highlightText'),
          });
          return applyWorkingSubstitutions(line);
        })
        .filter(Boolean);
      return dedupeWhatsWorkingHighlightLines(lines).slice(0, 3);
    })(),
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.opportunities_today)) return [];
      const opTable = resolvePostgrestAlertsTable('opportunities_today');
      const { data, error } = await supabase
        .from(opTable)
        .select(SELECT_OPPORTUNITIES_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('sort_score', { ascending: false })
        .limit(3);
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
      return data
        .map((row) => {
          const r = row as Record<string, unknown>;
          const title = pickStr(r, 'title');
          const description = pickStr(r, 'description');
          const opportunityText = pickStr(r, 'opportunity_text', 'opportunityText');
          return dedupeOpportunityLine({
            branchId: bid,
            title,
            description,
            opportunityText,
          });
        })
        .filter(Boolean)
        .slice(0, 3);
    })(),
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.watchlist_today)) {
        return {
          lines: [] as string[],
          rowsReturned: 0,
          latestMetricDate: null as string | null,
          relationName: 'watchlist_today_v_next',
        };
      }
      // Runtime lock: Watchlist must read from v_next in all active UI paths.
      const wlTable = 'watchlist_today_v_next';
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
      const lines = latestRows
        .map((row) => {
          const r = row as Record<string, unknown>;
          return composeDedupedPanelLine({
            title: pickStr(r, 'title'),
            description: pickStr(r, 'description'),
            primary: pickStr(r, 'warning_text', 'warningText'),
          });
        })
        .filter(Boolean)
        .slice(0, 3);
      if (process.env.NODE_ENV === 'development') {
        console.log('[watchlist-trace-latest-date]', {
          branch_id: bid,
          latest_metric_date: latestMetricDate,
          latest_rows_count: latestRows.length,
          selected_row: latestRows[0] ?? null,
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
  ]);

  return {
    workingLines: workingRes,
    opportunityLines: oppRes,
    watchlistLines: watchRes.lines,
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
      watchlistMeta: { rowsReturned: 0, latestMetricDate: null, relationName: 'watchlist_today_v_next' },
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
