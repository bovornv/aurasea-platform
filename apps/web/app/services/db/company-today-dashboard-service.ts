/**
 * Single entry point for Owner / Company Today dashboard data.
 * Coalesces bundle + secondary panels in one in-flight promise per org+branches key.
 */
import { fetchCompanyTodayBundle, type CompanyTodayBundle } from './company-today-data-service';
import { fetchCompanyDataConfidence, type CompanyDataConfidenceRow } from './company-data-confidence-service';
import { fetchCompanyTodayPriorities, type TodayPrioritiesRow } from './today-priorities-service';
import { fetchWhatsWorkingToday, type WhatsWorkingTodayRow } from './whats-working-today-service';
import { fetchOpportunitiesToday, type OpportunitiesTodayRow } from './opportunities-today-service';
import { fetchWatchlistToday, type WatchlistTodayRow } from './watchlist-today-service';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';
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
  options?: { prioritiesLimit?: number; panelLimit?: number }
): Promise<CompanyTodayDashboardData> {
  const key = dashboardKey(organizationId, branchIds);
  const existing = dashboardInFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const prioLim = options?.prioritiesLimit ?? 5;
    const panelLim = options?.panelLimit ?? 3;
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

    const [bundle, panels] = await Promise.all([bundlePromise, panelsPromise]);

    return {
      bundle,
      priorities: panels.priorities,
      whatsWorking: panels.whatsWorking,
      opportunities: panels.opportunities,
      watchlist: panels.watchlist,
      dataConfidence: panels.dataConfidence,
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
}

async function fetchBranchTodayPanelsCore(branchId: string, branchLabel: string): Promise<BranchTodayPanels> {
  const empty: BranchTodayPanels = { workingLines: [], opportunityLines: [], watchlistLines: [] };
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
      const { data, error } = await supabase
        .from('whats_working_today')
        .select(SELECT_WHATS_WORKING_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('sort_score', { ascending: false })
        .limit(3);
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.whats_working_today);
        }
        return [];
      }
      if (!Array.isArray(data)) return [];
      const lines = data
        .map((row) =>
          applyWorkingSubstitutions(
            resolveTodayPanelDisplay(row as Record<string, unknown>, ['highlight_text', 'highlightText'])
          )
        )
        .filter(Boolean);
      return dedupeWhatsWorkingHighlightLines(lines).slice(0, 3);
    })(),
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.opportunities_today)) return [];
      const { data, error } = await supabase
        .from('opportunities_today')
        .select(SELECT_OPPORTUNITIES_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('sort_score', { ascending: false })
        .limit(3);
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.opportunities_today);
        }
        return [];
      }
      if (!Array.isArray(data)) return [];
      return data
        .map((row) =>
          resolveTodayPanelDisplay(row as Record<string, unknown>, ['opportunity_text', 'opportunityText'])
        )
        .filter(Boolean)
        .slice(0, 3);
    })(),
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.watchlist_today)) return [];
      const { data, error } = await supabase
        .from('watchlist_today')
        .select(SELECT_WATCHLIST_TODAY_BRANCH)
        .eq('branch_id', bid)
        .order('sort_score', { ascending: false })
        .limit(3);
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.watchlist_today);
        }
        return [];
      }
      if (!Array.isArray(data)) return [];
      return data
        .map((row) =>
          resolveTodayPanelDisplay(row as Record<string, unknown>, ['warning_text', 'warningText'])
        )
        .filter(Boolean)
        .slice(0, 3);
    })(),
  ]);

  return {
    workingLines: workingRes,
    opportunityLines:
      oppRes.length > 0 ? oppRes : ['No clear opportunities today'],
    watchlistLines:
      watchRes.length > 0 ? watchRes : ['No early warning signals detected'],
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
      opportunityLines: ['No clear opportunities today'],
      watchlistLines: ['No early warning signals detected'],
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
