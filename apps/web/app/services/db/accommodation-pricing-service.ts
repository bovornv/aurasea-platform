import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';

export type PricingQuadrant = 'optimal' | 'underpriced' | 'overpriced' | 'weak' | 'unknown';

export interface AccommodationPricingPoint {
  metric_date: string;
  occupancy_pct: number;
  adr_thb: number;
  revenue_thb: number;
  quadrant: PricingQuadrant;
  avg_occ: number | null;
  avg_adr: number | null;
}

export interface AccommodationPricingInsight {
  title: string | null;
  insight_text: string | null;
}

function pickNum(r: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function normalizeQuadrant(v: string | null): PricingQuadrant {
  const s = (v ?? '').toLowerCase();
  if (s.includes('optimal')) return 'optimal';
  if (s.includes('under')) return 'underpriced';
  if (s.includes('over')) return 'overpriced';
  if (s.includes('weak')) return 'weak';
  return 'unknown';
}

export async function fetchAccommodationPricingPosition(branchId: string, days: number = 30): Promise<AccommodationPricingPoint[]> {
  if (!branchId || !isSupabaseAvailable()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const start = new Date();
  start.setDate(start.getDate() - Math.max(2, days));
  const startStr = start.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('accommodation_pricing_position')
    .select('*')
    .eq('branch_id', branchId)
    .gte('metric_date', startStr)
    .order('metric_date', { ascending: true });

  if (error || !Array.isArray(data)) return [];

  return data
    .map((row) => {
      const r = row as Record<string, unknown>;
      const date = pickStr(r, 'metric_date');
      const occ = pickNum(r, 'occupancy_pct', 'occupancy_rate', 'occupancy');
      const adr = pickNum(r, 'adr_thb', 'adr');
      const rev = pickNum(r, 'revenue_thb', 'revenue');
      if (!date || occ == null || adr == null || rev == null) return null;
      return {
        metric_date: date.slice(0, 10),
        occupancy_pct: occ > 1 ? occ : occ * 100,
        adr_thb: adr,
        revenue_thb: rev,
        quadrant: normalizeQuadrant(pickStr(r, 'quadrant', 'pricing_quadrant')),
        avg_occ: pickNum(r, 'avg_occ', 'avg_occupancy', 'avg_occupancy_pct'),
        avg_adr: pickNum(r, 'avg_adr', 'avg_adr_thb'),
      } as AccommodationPricingPoint;
    })
    .filter((x): x is AccommodationPricingPoint => x != null);
}

export async function fetchAccommodationPricingInsight(branchId: string): Promise<AccommodationPricingInsight | null> {
  if (!branchId || !isSupabaseAvailable()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('accommodation_pricing_insight')
    .select('*')
    .eq('branch_id', branchId)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    title: pickStr(r, 'title', 'insight_title'),
    insight_text: pickStr(r, 'insight_text', 'insight', 'description'),
  };
}
