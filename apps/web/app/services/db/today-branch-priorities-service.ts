/**
 * Branch Today — Today's Priorities
 * GET /rest/v1/branch_priorities_current?branch_id=eq.{id}
 *   &order=rank.asc.nullslast&order=sort_score.desc.nullslast&limit={cap}
 */
import { ModuleType } from '../../models/business-group';
import { occupancyPercentFromMetric } from '../../utils/accommodation-economics';
import { formatCurrency } from '../../utils/formatting';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

/**
 * Must match SQL today_priorities_ranked.business_type (non-F&B branches → accommodation).
 * When module_type is missing/unknown in UI, prefer accommodation so PostgREST filter matches the view.
 */
export function resolveBusinessTypeForPriorities(
  moduleType: 'accommodation' | 'fnb' | undefined,
  modules?: ModuleType[]
): 'accommodation' | 'fnb' {
  if (moduleType === 'fnb' || moduleType === 'accommodation') return moduleType;
  if (modules?.includes(ModuleType.ACCOMMODATION)) return 'accommodation';
  if (modules?.includes(ModuleType.FNB)) return 'fnb';
  return 'accommodation';
}

/** Same signals as SQL `today_priorities_ranked` when the view row lacks occupancy_rate / latest-day scope. */
export type AccommodationTodayUiLike = {
  metric_date?: string | null;
  revenue?: number | null;
  revenue_delta?: number | null;
  occupancy?: number | null;
};

export function syntheticAccommodationPrioritiesFromTodayUi(
  branchId: string,
  branchName: string,
  ui: AccommodationTodayUiLike | null,
  locale: 'en' | 'th'
): TodayBranchPriorityRow[] {
  if (!ui || !branchId.trim()) return [];
  const th = locale === 'th';
  const numLoc = th ? 'th-TH' : 'en-US';
  const name = branchName.trim() || (th ? 'สาขา' : 'Branch');
  const rev = Number(ui.revenue);
  const hasRev = Number.isFinite(rev) && rev > 0;
  const out: TodayBranchPriorityRow[] = [];

  const rd = ui.revenue_delta;
  if (rd != null && Number.isFinite(Number(rd)) && Number(rd) <= -10) {
    const delta = Number(rd);
    const impact = hasRev ? Math.max(Math.round(rev * Math.min(0.35, (Math.abs(delta) / 100) * 0.45)), 1000) : null;
    const titleBase = th ? `รายได้ลดลง — ${name}` : `Revenue drop — ${name}`;
    const title = impact != null && impact > 0 ? `${titleBase} (฿${formatCurrency(impact, numLoc)})` : titleBase;
    const description = th
      ? 'รายได้ลดลงเมื่อเทียบกับเมื่อวาน ตรวจราคา ช่องทางการขาย และแพ็กเกจ; บันทึกบริบทใน Enter Data'
      : 'Revenue is down vs yesterday. Check pricing, channel mix, and packages; log context in Enter Data.';
    out.push({
      branch_id: branchId.trim(),
      business_type: 'accommodation',
      metric_date: ui.metric_date != null ? String(ui.metric_date).slice(0, 10) : null,
      title,
      description,
      short_title: title,
      action_text: description,
      impact_thb: impact,
      impact_estimate_thb: impact,
      impact_label: 'at risk',
      sort_score: impact != null ? impact * 1e12 + 5_000_000 : 4_000_000,
    });
  }

  const occPct = occupancyPercentFromMetric(ui.occupancy);
  if (occPct != null && occPct < 60) {
    const impact = hasRev ? Math.max(Math.round(rev * 0.08), 500) : null;
    const titleBase = th ? `อัตราเข้าพักต่ำ — ${name}` : `Occupancy low — ${name}`;
    const title = impact != null && impact > 0 ? `${titleBase} (฿${formatCurrency(impact, numLoc)})` : titleBase;
    const description = th
      ? 'อัตราเข้าพักระดับวันนี้ต่ำ พิจารณาโปรโมชัน OTA แพ็กเกจระยะสั้น และขอบราคา'
      : 'Occupancy level is low today. Consider OTA boosts, last-minute packages, and pricing fences.';
    out.push({
      branch_id: branchId.trim(),
      business_type: 'accommodation',
      metric_date: ui.metric_date != null ? String(ui.metric_date).slice(0, 10) : null,
      title,
      description,
      short_title: title,
      action_text: description,
      impact_thb: impact,
      impact_estimate_thb: impact,
      impact_label: 'at risk',
      sort_score: impact != null ? impact * 1e12 + 3_000_000 : 3_500_000,
    });
  }

  return out.sort((a, b) => (b.sort_score ?? 0) - (a.sort_score ?? 0)).slice(0, 4);
}

export type FnbTodayUiLike = {
  metric_date?: string | null;
  revenue?: number | null;
  customers?: number | null;
  /** Today priorities use DB views; panel metrics use `today_summary` via engines (not this service). */
  revenue_delta_day?: number | null;
};

export function syntheticFnbPrioritiesFromTodayUi(
  branchId: string,
  branchName: string,
  ui: FnbTodayUiLike | null,
  locale: 'en' | 'th'
): TodayBranchPriorityRow[] {
  if (!branchId.trim()) return [];
  const th = locale === 'th';
  const numLoc = th ? 'th-TH' : 'en-US';
  const name = branchName.trim() || (th ? 'สาขา' : 'Branch');
  const rev = ui?.revenue != null ? Number(ui.revenue) : NaN;
  const hasRev = Number.isFinite(rev) && rev > 0;
  const out: TodayBranchPriorityRow[] = [];
  const md = ui?.metric_date != null ? String(ui.metric_date).slice(0, 10) : null;

  const rd = ui?.revenue_delta_day;
  if (rd != null && Number.isFinite(Number(rd)) && Number(rd) <= -10) {
    const delta = Number(rd);
    const impact = hasRev ? Math.max(Math.round(rev * Math.min(0.35, (Math.abs(delta) / 100) * 0.45)), 1000) : null;
    const titleBase = th ? `รายได้ลดลง — ${name}` : `Revenue drop — ${name}`;
    const title = impact != null && impact > 0 ? `${titleBase} (฿${formatCurrency(impact, numLoc)})` : titleBase;
    const description = th
      ? 'รายได้ลดลงเมื่อเทียบกับเมื่อวาน ตรวจราคา ช่องทาง และเมนูขายดี; บันทึกบริบทใน Enter Data'
      : 'Revenue is down vs yesterday. Check pricing, promos, and top sellers; log context in Enter Data.';
    out.push({
      branch_id: branchId.trim(),
      business_type: 'fnb',
      metric_date: md,
      title,
      description,
      short_title: title,
      action_text: description,
      impact_thb: impact,
      impact_estimate_thb: impact,
      impact_label: 'at risk',
      sort_score: impact != null ? impact * 1e12 + 5_000_000 : 4_000_000,
    });
  }

  const cust = ui?.customers;
  if (cust != null && Number.isFinite(Number(cust)) && Number(cust) < 20) {
    const impact = hasRev ? Math.max(Math.round(rev * 0.06), 300) : null;
    const titleBase = th ? `ลูกค้าน้อยวันนี้ — ${name}` : `Customer traffic low — ${name}`;
    const title = impact != null && impact > 0 ? `${titleBase} (฿${formatCurrency(impact, numLoc)})` : titleBase;
    const description = th
      ? 'จำนวนลูกค้าต่ำวันนี้ ตรวจโปร ช่วงเวลาเปิด และเมนูขายดี; ตรวจสอบใน Trends'
      : 'Customer count is low today. Review promos, operating hours, and top-sellers; validate in Trends.';
    out.push({
      branch_id: branchId.trim(),
      business_type: 'fnb',
      metric_date: md,
      title,
      description,
      short_title: title,
      action_text: description,
      impact_thb: impact,
      impact_estimate_thb: impact,
      impact_label: 'at risk',
      sort_score: impact != null ? impact * 1e12 + 3_000_000 : 3_500_000,
    });
  }

  return out.sort((a, b) => (b.sort_score ?? 0) - (a.sort_score ?? 0)).slice(0, 4);
}

/** One neutral executive row when API + risk synthetics produce nothing (branch Today should never feel “blank”). */
export function defaultBranchPrioritiesFallback(
  branchId: string,
  branchName: string,
  businessType: 'accommodation' | 'fnb',
  locale: 'en' | 'th'
): TodayBranchPriorityRow[] {
  const th = locale === 'th';
  const name = branchName.trim() || (th ? 'สาขา' : 'Branch');
  const title = th ? `จับสัญญาณวันนี้ให้แน่น — ${name}` : `Sharpen today’s read — ${name}`;
  const description =
    businessType === 'fnb'
      ? th
        ? '→ ดู Trends หาจังหวะยอดและตะกร้า แล้วยืนยันตัวเลขใน Enter Data'
        : '→ Scan Trends for traffic and ticket patterns, then confirm numbers in Enter Data.'
      : th
        ? '→ ดู Trends เรื่องอัตราเข้าพักและรายได้ แล้วบันทึกบริบทใน Enter Data'
        : '→ Review Trends for occupancy and revenue rhythm, then log context in Enter Data.';
  return [
    {
      branch_id: branchId.trim(),
      business_type: businessType,
      metric_date: null,
      title,
      description,
      short_title: title,
      action_text: description,
      impact_thb: null,
      impact_estimate_thb: null,
      impact_label: 'at risk',
      sort_score: 1,
    },
  ];
}

export interface TodayBranchPriorityRow {
  branch_id: string;
  business_type: 'accommodation' | 'fnb' | string;
  metric_date: string | null;
  /** From branch_priorities_current.alert_type when present */
  alert_type?: string | null;
  rank?: number | null;
  title: string | null;
  description: string | null;
  short_title: string | null;
  action_text: string | null;
  impact_thb: number | null;
  impact_estimate_thb: number | null;
  impact_label: string | null;
  sort_score: number | null;
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

const NEGATIVE_ALERT_KEYWORDS = ['drop', 'low', 'pressure', 'worsening', 'down', 'compression'];

function isNegativeAlertType(alertType: string | null | undefined): boolean {
  const lower = (alertType ?? '').toLowerCase();
  return NEGATIVE_ALERT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Same rules as branch overview "Today's Priorities" — keeps company Today aligned with each branch page.
 * Suppresses contradictory Revenue Drop when live F&B delta is not down; drops negative alerts with ฿0 impact.
 */
export function filterTodayBranchPriorityRows(
  rows: TodayBranchPriorityRow[],
  options: { isFnb: boolean; fnbRevenueDeltaPct?: number | null }
): TodayBranchPriorityRow[] {
  if (!rows.length) return rows;
  const { isFnb, fnbRevenueDeltaPct } = options;
  return rows.filter((row) => {
    if (isNegativeAlertType(row.alert_type)) {
      const impact = row.impact_thb ?? row.impact_estimate_thb;
      if (impact === null || impact === undefined || impact === 0) return false;
    }
    if (isFnb) {
      const alertLower = (row.alert_type ?? '').toLowerCase();
      const isRevDrop = alertLower.includes('revenue') && alertLower.includes('drop');
      if (isRevDrop && fnbRevenueDeltaPct !== undefined) {
        if (fnbRevenueDeltaPct !== null && fnbRevenueDeltaPct > -10) return false;
      }
    }
    return true;
  });
}

function mapRow(row: Record<string, unknown>, branchId: string): TodayBranchPriorityRow {
  const title = pickStr(row, 'title', 'short_title', 'shortTitle');
  const description = pickStr(row, 'description', 'action_text', 'actionText');
  const impact = pickNum(row, 'impact_thb', 'impact_estimate_thb', 'impact');
  const rankVal = pickNum(row, 'rank', 'priority_rank');
  return {
    branch_id: pickStr(row, 'branch_id', 'branchId') || branchId,
    business_type: pickStr(row, 'business_type', 'businessType') || 'unknown',
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
    alert_type: pickStr(row, 'alert_type', 'alertType') || null,
    rank: rankVal,
    title: title || null,
    description: description || null,
    short_title: title || pickStr(row, 'short_title', 'shortTitle') || null,
    action_text: description || pickStr(row, 'action_text', 'actionText') || null,
    impact_thb: impact,
    impact_estimate_thb: impact,
    impact_label: pickStr(row, 'impact_label', 'impactLabel') || null,
    sort_score: pickNum(row, 'sort_score', 'priority_score'),
  };
}

export async function fetchTodayBranchPriorities(
  branchId: string | null,
  _businessType: 'accommodation' | 'fnb' | null | undefined,
  limit: number = 100,
  _locale: 'en' | 'th' = 'en'
): Promise<TodayBranchPriorityRow[]> {
  if (!branchId?.trim() || !isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.branch_priorities_current)) {
    return [];
  }
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const cap = Math.min(500, Math.max(1, limit));
  const table = 'branch_priorities_current';
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('branch_id', branchId.trim())
    .order('rank', { ascending: true, nullsFirst: false })
    .order('sort_score', { ascending: false, nullsFirst: false })
    .limit(cap);

  const rawForLog = Array.isArray(data) ? data : [];
  if (process.env.NODE_ENV === 'development') {
    console.log('[branch_priorities_current]', {
      branchId: branchId.trim(),
      rowCount: rawForLog.length,
      error: error ? { message: error.message, code: String(error.code ?? '') } : null,
    });
  }

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.branch_priorities_current);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[branch_priorities_current]', error.message);
    }
    return [];
  }

  const raw = Array.isArray(data) ? data : [];
  if (raw.length === 0) return [];
  return raw.map((row) => mapRow(row as Record<string, unknown>, branchId.trim()));
}
