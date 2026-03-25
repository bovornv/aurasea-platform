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
    const prioLim = options?.prioritiesLimit ?? 3;
    const panelLim = options?.panelLimit ?? 3;
    const orgId = organizationId?.trim() ?? null;

    const [bundle, priorities, whatsWorking, opportunities, watchlist, dataConfidence] = await Promise.all([
      fetchCompanyTodayBundle(orgId, branchIds),
      orgId ? fetchCompanyTodayPriorities(orgId, prioLim) : Promise.resolve([]),
      orgId ? fetchWhatsWorkingToday(orgId, panelLim) : Promise.resolve([]),
      orgId ? fetchOpportunitiesToday(orgId, panelLim) : Promise.resolve([]),
      orgId ? fetchWatchlistToday(orgId, panelLim) : Promise.resolve([]),
      orgId ? fetchCompanyDataConfidence(orgId) : Promise.resolve(null),
    ]);

    return {
      bundle,
      priorities,
      whatsWorking,
      opportunities,
      watchlist,
      dataConfidence,
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
