/**
 * Single entry point for Owner / Company Today dashboard data.
 * Coalesces bundle + secondary panels in one in-flight promise per org+branches key.
 */
import { fetchCompanyTodayBundle, type CompanyTodayBundle } from './company-today-data-service';
import { fetchCompanyDataConfidence, type CompanyDataConfidenceRow } from './company-data-confidence-service';
import { fetchTodayPriorities, type TodayPrioritiesRow } from './today-priorities-service';
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

export interface CompanyTodayDashboardData {
  bundle: CompanyTodayBundle;
  priorities: TodayPrioritiesRow[];
  whatsWorking: WhatsWorkingTodayRow[];
  opportunities: OpportunitiesTodayRow[];
  watchlist: WatchlistTodayRow[];
  dataConfidence: CompanyDataConfidenceRow | null;
}

const dashboardInFlight = new Map<string, Promise<CompanyTodayDashboardData>>();

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
      orgId ? fetchTodayPriorities(orgId, null, prioLim) : Promise.resolve([]),
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

/**
 * Branch Today: three panels that use org-level views filtered by branch_id (same as legacy branch overview).
 */
export async function fetchBranchTodayPanels(branchId: string, branchLabel: string): Promise<BranchTodayPanels> {
  const empty: BranchTodayPanels = { workingLines: [], opportunityLines: [], watchlistLines: [] };
  const bid = branchId?.trim();
  if (!bid || !isSupabaseAvailable()) return empty;
  const supabase = getSupabaseClient();
  if (!supabase) return empty;

  const mapWorking = (rows: { highlight_text?: string | null }[] | null) => {
    const lines = (rows ?? [])
      .map((r) => String(r.highlight_text ?? '').trim())
      .map((txt) => {
        if (/performance stable across branches/i.test(txt)) {
          return `${branchLabel} operating normally — no major issues detected`;
        }
        if (/no major operational risks detected/i.test(txt)) {
          return `${branchLabel} operating normally — no major issues detected`;
        }
        return txt;
      })
      .filter(Boolean);
    return dedupeWhatsWorkingHighlightLines(lines).slice(0, 3);
  };

  const fetchTable = async (
    resource: (typeof POSTGREST_RESOURCE_KEYS)[keyof typeof POSTGREST_RESOURCE_KEYS],
    table: string,
    col: string
  ): Promise<string[]> => {
    if (isPostgrestResourceKnownMissing(resource)) return [];
    const { data, error } = await supabase
      .from(table)
      .select(col)
      .eq('branch_id', bid)
      .order('sort_score', { ascending: false })
      .limit(3);
    if (error) {
      if (isPostgrestObjectMissingError(error)) markPostgrestResourceMissing(resource);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data
      .map((r: Record<string, unknown>) => String(r[col] ?? '').trim())
      .filter(Boolean)
      .slice(0, 3);
  };

  const [workingRes, oppRes, watchRes] = await Promise.all([
    (async () => {
      if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.whats_working_today)) return [];
      const { data, error } = await supabase
        .from('whats_working_today')
        .select('highlight_text')
        .eq('branch_id', bid)
        .order('sort_score', { ascending: false })
        .limit(3);
      if (error) {
        if (isPostgrestObjectMissingError(error)) {
          markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.whats_working_today);
        }
        return [];
      }
      return mapWorking(data as { highlight_text?: string | null }[]);
    })(),
    fetchTable(POSTGREST_RESOURCE_KEYS.opportunities_today, 'opportunities_today', 'opportunity_text'),
    fetchTable(POSTGREST_RESOURCE_KEYS.watchlist_today, 'watchlist_today', 'warning_text'),
  ]);

  return {
    workingLines: workingRes,
    opportunityLines:
      oppRes.length > 0 ? oppRes : ['No clear opportunities today'],
    watchlistLines:
      watchRes.length > 0 ? watchRes : ['No early warning signals detected'],
  };
}
