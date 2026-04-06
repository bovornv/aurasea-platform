/**
 * F&B Purchase Log service — CRUD for fnb_purchase_log table.
 * Pattern mirrors daily-metrics-service.ts.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

export type PurchaseType = 'food_beverage' | 'non_food_supplies';

export interface FnbPurchaseRow {
  id: string;
  branch_id: string;
  purchase_date: string; // YYYY-MM-DD
  purchase_type: PurchaseType;
  amount: number;       // integer THB
  note: string | null;
  created_at: string;
}

export interface FnbPurchaseSummary {
  rows: FnbPurchaseRow[];
  foodBevTotal: number;
  nonFoodTotal: number;
}

/** Get current week's Monday as YYYY-MM-DD string (Bangkok-safe: uses local noon). */
export function getMondayOfCurrentWeek(): string {
  const now = new Date();
  // ISO weekday: Mon=1..Sun=7; JS getDay: Sun=0..Sat=6
  const jsDay = now.getDay(); // 0=Sun..6=Sat
  const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
  const offsetToMonday = isoDay - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offsetToMonday);
  return monday.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for today (local time). */
export function getTodayIso(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

/**
 * Insert a purchase into fnb_purchase_log.
 * Returns { ok: true, id } on success, { ok: false, error } on failure.
 */
export async function saveFnbPurchase(
  branchId: string,
  purchase: {
    purchase_date: string; // YYYY-MM-DD
    purchase_type: PurchaseType;
    amount: number;
    note?: string | null;
  }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!branchId) return { ok: false, error: 'branchId required' };
  if (!isSupabaseAvailable()) return { ok: false, error: 'Supabase not available' };
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.fnb_purchase_log)) {
    return { ok: false, error: 'Purchase log table is not set up yet.' };
  }
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'No client' };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, status } = await (supabase as any)
      .from('fnb_purchase_log')
      .insert({
        branch_id: branchId,
        purchase_date: purchase.purchase_date,
        purchase_type: purchase.purchase_type,
        amount: Math.round(purchase.amount),
        note: purchase.note ?? null,
      })
      .select('id')
      .single();

    if (error) {
      if (isPostgrestObjectMissingError(error, status)) {
        markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.fnb_purchase_log);
        if (process.env.NODE_ENV === 'development') {
          console.warn('[FnbPurchaseService] fnb_purchase_log missing — run add-fnb-purchase-log.sql');
        }
        return { ok: false, error: 'Purchase log table is not set up yet.' };
      }
      console.error('[FnbPurchaseService] saveFnbPurchase error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[FnbPurchaseService] saveFnbPurchase exception:', e);
    return { ok: false, error: msg };
  }
}

/**
 * Fetch purchase rows for a branch between fromDate and toDate (inclusive).
 * Returns rows ordered by purchase_date DESC, created_at DESC.
 */
export async function getFnbPurchases(
  branchId: string,
  fromDate: string,
  toDate: string
): Promise<FnbPurchaseRow[]> {
  if (!branchId) return [];
  if (!isSupabaseAvailable()) return [];
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.fnb_purchase_log)) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, status } = await (supabase as any)
      .from('fnb_purchase_log')
      .select('id, branch_id, purchase_date, purchase_type, amount, note, created_at')
      .eq('branch_id', branchId)
      .gte('purchase_date', fromDate)
      .lte('purchase_date', toDate)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isPostgrestObjectMissingError(error, status)) {
        markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.fnb_purchase_log);
        if (process.env.NODE_ENV === 'development') {
          console.warn('[FnbPurchaseService] fnb_purchase_log missing — run add-fnb-purchase-log.sql');
        }
        return [];
      }
      console.error('[FnbPurchaseService] getFnbPurchases error:', error);
      return [];
    }
    return (data ?? []) as FnbPurchaseRow[];
  } catch (e) {
    console.error('[FnbPurchaseService] getFnbPurchases exception:', e);
    return [];
  }
}

/**
 * Fetch this week's purchases (Monday to today) and compute totals.
 */
export async function getFnbWeeklyPurchases(branchId: string): Promise<FnbPurchaseSummary> {
  const monday = getMondayOfCurrentWeek();
  const today = getTodayIso();
  const rows = await getFnbPurchases(branchId, monday, today);
  const foodBevTotal = rows
    .filter((r) => r.purchase_type === 'food_beverage')
    .reduce((s, r) => s + r.amount, 0);
  const nonFoodTotal = rows
    .filter((r) => r.purchase_type === 'non_food_supplies')
    .reduce((s, r) => s + r.amount, 0);
  return { rows, foodBevTotal, nonFoodTotal };
}

/**
 * Fetch last week's purchases (Mon–Sun of the previous calendar week).
 */
export async function getFnbLastWeekPurchases(branchId: string): Promise<FnbPurchaseSummary> {
  const currentMonday = getMondayOfCurrentWeek();
  const mondayDate = new Date(`${currentMonday}T12:00:00`);
  const lastMondayDate = new Date(mondayDate);
  lastMondayDate.setDate(lastMondayDate.getDate() - 7);
  const lastSundayDate = new Date(mondayDate);
  lastSundayDate.setDate(lastSundayDate.getDate() - 1);
  const lastMonday = lastMondayDate.toISOString().slice(0, 10);
  const lastSunday = lastSundayDate.toISOString().slice(0, 10);
  const rows = await getFnbPurchases(branchId, lastMonday, lastSunday);
  const foodBevTotal = rows.filter((r) => r.purchase_type === 'food_beverage').reduce((s, r) => s + r.amount, 0);
  const nonFoodTotal = rows.filter((r) => r.purchase_type === 'non_food_supplies').reduce((s, r) => s + r.amount, 0);
  return { rows, foodBevTotal, nonFoodTotal };
}

/**
 * Fetch rolling 7-day purchases (today-6 through today inclusive).
 */
export async function getFnbRolling7DayPurchases(branchId: string): Promise<FnbPurchaseSummary> {
  const today = getTodayIso();
  const fromDate = new Date(`${today}T12:00:00`);
  fromDate.setDate(fromDate.getDate() - 6);
  const from = fromDate.toISOString().slice(0, 10);
  const rows = await getFnbPurchases(branchId, from, today);
  const foodBevTotal = rows.filter((r) => r.purchase_type === 'food_beverage').reduce((s, r) => s + r.amount, 0);
  const nonFoodTotal = rows.filter((r) => r.purchase_type === 'non_food_supplies').reduce((s, r) => s + r.amount, 0);
  return { rows, foodBevTotal, nonFoodTotal };
}

/**
 * Fetch purchases grouped by week for the last N complete weeks.
 * Returns one entry per week+type combination.
 */
export async function getFnbPurchasesByWeek(
  branchId: string,
  weeksBack: number = 8
): Promise<FnbPurchaseRow[]> {
  if (!branchId) return [];
  const today = new Date();
  // go back weeksBack full weeks from Monday of current week
  const monday = new Date(getMondayOfCurrentWeek());
  const fromDate = new Date(monday);
  fromDate.setDate(fromDate.getDate() - weeksBack * 7);
  return getFnbPurchases(branchId, fromDate.toISOString().slice(0, 10), today.toISOString().slice(0, 10));
}
