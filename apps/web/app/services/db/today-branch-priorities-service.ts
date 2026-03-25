/**
 * Branch Today — Today's Priorities
 * GET /rest/v1/today_priorities_view?branch_id=eq.{id}&business_type=eq.{type}
 *   &order=sort_score.desc&limit=3
 */
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import {
  isPostgrestObjectMissingError,
  isPostgrestResourceKnownMissing,
  markPostgrestResourceMissing,
  POSTGREST_RESOURCE_KEYS,
} from '../../lib/supabase/postgrest-missing-resource';

export interface TodayBranchPriorityRow {
  branch_id: string;
  business_type: 'accommodation' | 'fnb' | string;
  metric_date: string | null;
  title: string | null;
  description: string | null;
  short_title: string | null;
  action_text: string | null;
  impact_estimate_thb: number | null;
  impact_label: string | null;
  sort_score: number | null;
  rank: number | null;
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

function fallbackPriorities(
  branchId: string,
  businessType: 'accommodation' | 'fnb',
  locale: 'en' | 'th'
): TodayBranchPriorityRow[] {
  const th = locale === 'th';
  const rows: Omit<TodayBranchPriorityRow, 'branch_id' | 'business_type'>[] =
    businessType === 'fnb'
      ? [
          {
            metric_date: null,
            title: th ? 'บันทึกยอดวันนี้' : "Log today's sales",
            description: th
              ? 'กรอกรายได้ ลูกค้า และต้นทุนวันนี้ใน Enter Data เพื่อให้สัญญาณแม่นยำ'
              : 'Enter revenue, customers, and costs in Enter Data so signals stay accurate.',
            short_title: th ? 'บันทึกยอดวันนี้' : "Log today's sales",
            action_text: th
              ? 'กรอกรายได้ ลูกค้า และต้นทุนวันนี้ใน Enter Data เพื่อให้สัญญาณแม่นยำ'
              : 'Enter revenue, customers, and costs in Enter Data so signals stay accurate.',
            impact_estimate_thb: null,
            impact_label: 'at risk',
            sort_score: 100,
            rank: 1,
          },
          {
            metric_date: null,
            title: th ? 'เช็กแนวโน้ม' : 'Check Trends',
            description: th
              ? 'เปรียบเทียบสัปดาห์นี้กับสัปดาห์ก่อนเพื่อจับการเปลี่ยนแปลงเร็ว'
              : 'Compare this week vs last week to catch drift early.',
            short_title: th ? 'เช็กแนวโน้ม' : 'Check Trends',
            action_text: th
              ? 'เปรียบเทียบสัปดาห์นี้กับสัปดาห์ก่อนเพื่อจับการเปลี่ยนแปลงเร็ว'
              : 'Compare this week vs last week to catch drift early.',
            impact_estimate_thb: null,
            impact_label: 'at risk',
            sort_score: 99,
            rank: 2,
          },
          {
            metric_date: null,
            title: th ? 'ปรับเมนูและราคา' : 'Tune menu & pricing',
            description: th
              ? 'ทบทวนเมนูขายดีและต้นทุนต่อจานเพื่อรักษามาร์จิ้น'
              : 'Review top sellers and plate cost to protect margin.',
            short_title: th ? 'ปรับเมนูและราคา' : 'Tune menu & pricing',
            action_text: th
              ? 'ทบทวนเมนูขายดีและต้นทุนต่อจานเพื่อรักษามาร์จิ้น'
              : 'Review top sellers and plate cost to protect margin.',
            impact_estimate_thb: null,
            impact_label: 'opportunity',
            sort_score: 98,
            rank: 3,
          },
        ]
      : [
          {
            metric_date: null,
            title: th ? 'บันทึกข้อมูลวันนี้' : "Log today's performance",
            description: th
              ? 'กรอกรายได้ ห้องขาย และต้นทุนใน Enter Data เพื่อให้สัญญาณแม่นยำ'
              : 'Capture revenue, rooms, and costs in Enter Data so signals stay accurate.',
            short_title: th ? 'บันทึกข้อมูลวันนี้' : "Log today's performance",
            action_text: th
              ? 'กรอกรายได้ ห้องขาย และต้นทุนใน Enter Data เพื่อให้สัญญาณแม่นยำ'
              : 'Capture revenue, rooms, and costs in Enter Data so signals stay accurate.',
            impact_estimate_thb: null,
            impact_label: 'at risk',
            sort_score: 100,
            rank: 1,
          },
          {
            metric_date: null,
            title: th ? 'เช็กแนวโน้ม' : 'Check Trends',
            description: th
              ? 'เปรียบเทียบสัปดาห์นี้กับสัปดาห์ก่อนเพื่อจับการเปลี่ยนแปลงเร็ว'
              : 'Compare this week vs last week to catch drift early.',
            short_title: th ? 'เช็กแนวโน้ม' : 'Check Trends',
            action_text: th
              ? 'เปรียบเทียบสัปดาห์นี้กับสัปดาห์ก่อนเพื่อจับการเปลี่ยนแปลงเร็ว'
              : 'Compare this week vs last week to catch drift early.',
            impact_estimate_thb: null,
            impact_label: 'at risk',
            sort_score: 99,
            rank: 2,
          },
          {
            metric_date: null,
            title: th ? 'รีวิวราคาและช่องทาง' : 'Review pricing & channels',
            description: th
              ? 'ปรับ OTA และราคาเดินทางหากอัตราเข้าพักหรือ ADR เปลี่ยน'
              : 'Adjust OTAs and walk-in strategy if occupancy or ADR moved.',
            short_title: th ? 'รีวิวราคาและช่องทาง' : 'Review pricing & channels',
            action_text: th
              ? 'ปรับ OTA และราคาเดินทางหากอัตราเข้าพักหรือ ADR เปลี่ยน'
              : 'Adjust OTAs and walk-in strategy if occupancy or ADR moved.',
            impact_estimate_thb: null,
            impact_label: 'opportunity',
            sort_score: 98,
            rank: 3,
          },
        ];
  return rows.map((r) => ({
    branch_id: branchId,
    business_type: businessType,
    ...r,
  }));
}

function mapRow(row: Record<string, unknown>, branchId: string): TodayBranchPriorityRow {
  const title = pickStr(row, 'title', 'short_title', 'shortTitle');
  const description = pickStr(row, 'description', 'action_text', 'actionText');
  return {
    branch_id: pickStr(row, 'branch_id', 'branchId') || branchId,
    business_type: pickStr(row, 'business_type', 'businessType') || 'unknown',
    metric_date: row.metric_date != null ? String(row.metric_date).slice(0, 10) : null,
    title: title || null,
    description: description || null,
    short_title: title || pickStr(row, 'short_title', 'shortTitle') || null,
    action_text: description || pickStr(row, 'action_text', 'actionText') || null,
    impact_estimate_thb: pickNum(row, 'impact_estimate_thb', 'impact'),
    impact_label: pickStr(row, 'impact_label', 'impactLabel') || null,
    sort_score: pickNum(row, 'sort_score', 'priority_score'),
    rank: pickNum(row, 'rank'),
  };
}

export async function fetchTodayBranchPriorities(
  branchId: string | null,
  businessType: 'accommodation' | 'fnb' | null | undefined,
  limit: number = 3,
  locale: 'en' | 'th' = 'en'
): Promise<TodayBranchPriorityRow[]> {
  if (!branchId?.trim() || !businessType || !isSupabaseAvailable()) {
    return branchId?.trim() && businessType
      ? fallbackPriorities(branchId.trim(), businessType, locale)
      : [];
  }
  if (isPostgrestResourceKnownMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view)) {
    return fallbackPriorities(branchId.trim(), businessType, locale);
  }
  const supabase = getSupabaseClient();
  if (!supabase) return fallbackPriorities(branchId.trim(), businessType, locale);

  const cap = Math.min(3, Math.max(1, limit));
  const { data, error } = await supabase
    .from('today_priorities_view')
    .select('*')
    .eq('branch_id', branchId.trim())
    .eq('business_type', businessType)
    .order('sort_score', { ascending: false })
    .limit(cap);

  if (error) {
    if (isPostgrestObjectMissingError(error)) {
      markPostgrestResourceMissing(POSTGREST_RESOURCE_KEYS.today_priorities_view);
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[today_priorities_view branch]', error.message);
    }
    return fallbackPriorities(branchId.trim(), businessType, locale);
  }

  const raw = Array.isArray(data) ? data : [];
  if (raw.length === 0) {
    return fallbackPriorities(branchId.trim(), businessType, locale);
  }
  return raw.map((row) => mapRow(row as Record<string, unknown>, branchId.trim()));
}
