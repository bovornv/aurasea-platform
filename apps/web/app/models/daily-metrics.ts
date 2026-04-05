/**
 * Unified Daily Metrics Model
 * 
 * Writes: accommodation_daily_metrics / fnb_daily_metrics. Reads (analytics): public.branch_daily_metrics.
 * Supports both Accommodation and F&B modules
 */

export interface DailyMetric {
  id: string;
  branchId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  
  // Shared Financial Fields (FINAL PRODUCTION SCHEMA)
  revenue: number; // THB - required
  cost?: number; // THB - optional (can be estimated)
  additionalCostToday?: number; // THB - optional daily extra cost
  cashBalance?: number; // THB - optional (owner can update weekly)
  
  // Accommodation Fields (nullable)
  roomsSold?: number;
  roomsAvailable?: number;
  adr?: number; // Average Daily Rate (THB)
  accommodationStaff?: number;
  monthlyFixedCost?: number;
  roomsOnBooks7?: number; // Confirmed reservations 7 days ahead
  roomsOnBooks14?: number; // Confirmed reservations 14 days ahead
  variableCostPerRoom?: number; // Per-room variable cost (housekeeping, laundry, breakfast, supplies)
  
  // F&B Fields (nullable)
  customers?: number;
  avgTicket?: number; // THB
  top3MenuRevenue?: number; // Revenue from top 3 menu items (THB)
  fnbStaff?: number; // From branches setup
  promoSpend?: number; // THB
  
  createdAt: string; // ISO timestamp
}

/** Branch type for routing writes to accommodation_daily_metrics vs fnb_daily_metrics. */
export type DailyMetricBranchType = 'accommodation' | 'fnb';

/**
 * Daily metric input (for creating/updating)
 */
export interface DailyMetricInput {
  branchId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  /** Branch type: hotel/accommodation → accommodation_daily_metrics, restaurant/fnb → fnb_daily_metrics. Omit to infer from metric fields. */
  branchType?: DailyMetricBranchType;

  // Shared Financial Fields (FINAL PRODUCTION SCHEMA)
  revenue: number; // Required
  cost?: number; // Optional (will be estimated if not provided)
  additionalCostToday?: number; // Optional THB - increases daily cost
  cashBalance?: number; // Optional (owner can update weekly)

  // Accommodation Fields (optional)
  roomsSold?: number;
  roomsAvailable?: number; // จำนวนห้องทั้งหมด
  adr?: number;
  accommodationStaff?: number; // จำนวนพนักงานที่พัก (staff_count)
  monthlyFixedCost?: number; // อัปเดตต้นทุนคงที่รายเดือน
  roomsOnBooks7?: number; // Confirmed reservations 7 days ahead
  roomsOnBooks14?: number; // Confirmed reservations 14 days ahead
  variableCostPerRoom?: number; // Per-room variable cost

  // F&B Fields (optional)
  customers?: number;
  avgTicket?: number;
  top3MenuRevenue?: number; // Revenue from top 3 menu items (THB, optional)
  fnbStaff?: number; // From branches setup, not daily input
  promoSpend?: number;
}

/**
 * Computed daily revenue
 * For accommodation: revenue = rooms_sold * adr (if not provided)
 * For F&B: revenue = customers * avg_ticket (if not provided)
 * Otherwise: use provided revenue field
 */
export function calculateDailyRevenue(metric: DailyMetric | DailyMetricInput): number {
  // If revenue is explicitly provided, use it
  if (metric.revenue !== undefined && metric.revenue > 0) {
    return metric.revenue;
  }
  
  // Calculate from accommodation fields
  if (metric.roomsSold && metric.adr) {
    return metric.roomsSold * metric.adr;
  }
  
  // Calculate from F&B fields
  if (metric.customers && metric.avgTicket) {
    return metric.customers * metric.avgTicket;
  }
  
  return 0;
}

/**
 * Calculate Top 3 Menu Revenue Share Percentage
 * Converts revenue amount to percentage for alert engine compatibility
 */
export function calculateTop3MenuSharePct(metric: DailyMetric | DailyMetricInput): number | undefined {
  if (!metric.top3MenuRevenue || metric.top3MenuRevenue <= 0) {
    return undefined;
  }
  
  const totalRevenue = calculateDailyRevenue(metric);
  if (!totalRevenue || totalRevenue <= 0) {
    return undefined;
  }
  
  return (metric.top3MenuRevenue / totalRevenue) * 100;
}

/**
 * Database format (for Supabase)
 * Row shape from public.branch_daily_metrics (read) / split write tables
 */
export interface DailyMetricDb {
  id: string;
  branch_id: string;
  metric_date: string; // Database column name
  
  // Shared Financial Fields (FINAL PRODUCTION SCHEMA)
  revenue: number; // Required
  cost?: number | null; // Optional (can be estimated)
  additional_cost_today?: number | null; // Optional THB
  cash_balance?: number | null; // Optional (owner can update weekly)
  
  // Accommodation Fields (nullable)
  rooms_sold?: number | null;
  rooms_available?: number | null;
  adr?: number | null;
  staff_count?: number | null;
  monthly_fixed_cost?: number | null;
  rooms_on_books_7?: number | null;
  rooms_on_books_14?: number | null;
  variable_cost_per_room?: number | null;
  
  // F&B Fields (nullable)
  customers?: number | null;
  avg_ticket?: number | null;
  top3_menu_revenue?: number | null; // Revenue from top 3 menu items (THB)
  fnb_staff?: number | null; // From branches setup
  promo_spend?: number | null;
  
  created_at: string;
}

/**
 * Convert from database format to app format
 */
function toDateOnly(value: string | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  return s.slice(0, 10);
}

export function dailyMetricFromDb(db: DailyMetricDb): DailyMetric {
  const dbAny = db as DailyMetricDb & { total_revenue_thb?: number | null; total_customers?: number | null };
  const revenue = db.revenue ?? dbAny.total_revenue_thb;
  const customers = db.customers ?? dbAny.total_customers;
  return {
    id: (db as any).id ?? `daily_${db.branch_id}_${toDateOnly(db.metric_date)}`,
    branchId: db.branch_id,
    date: (toDateOnly(db.metric_date) || db.metric_date) as string,
    revenue: Number(revenue ?? 0),
    cost: db.cost !== null && db.cost !== undefined ? Number(db.cost) : undefined,
    additionalCostToday: db.additional_cost_today != null ? Number(db.additional_cost_today) : undefined,
    cashBalance: db.cash_balance !== null && db.cash_balance !== undefined ? Number(db.cash_balance) : undefined,
    roomsSold: db.rooms_sold != null ? Number(db.rooms_sold) : undefined,
    roomsAvailable: db.rooms_available != null ? Number(db.rooms_available) : undefined,
    adr: db.adr != null ? Number(db.adr) : (Number(revenue ?? 0) > 0 && Number(db.rooms_sold ?? 0) > 0 ? Number(revenue ?? 0) / Number(db.rooms_sold ?? 0) : undefined),
    accommodationStaff: db.staff_count != null ? Number(db.staff_count) : undefined,
    monthlyFixedCost: db.monthly_fixed_cost != null ? Number(db.monthly_fixed_cost) : undefined,
    customers: customers != null ? Number(customers) : undefined,
    avgTicket: db.avg_ticket ? Number(db.avg_ticket) : undefined,
    top3MenuRevenue: db.top3_menu_revenue !== null && db.top3_menu_revenue !== undefined ? Number(db.top3_menu_revenue) : undefined,
    fnbStaff: db.fnb_staff != null ? Number(db.fnb_staff) : undefined,
    promoSpend: db.promo_spend != null ? Number(db.promo_spend) : undefined,
    roomsOnBooks7: db.rooms_on_books_7 != null ? Number(db.rooms_on_books_7) : undefined,
    roomsOnBooks14: db.rooms_on_books_14 != null ? Number(db.rooms_on_books_14) : undefined,
    variableCostPerRoom: db.variable_cost_per_room != null ? Number(db.variable_cost_per_room) : undefined,
    createdAt: (db as any).created_at ?? new Date().toISOString(),
  };
}

/**
 * Convert from app format to database format
 */
export function dailyMetricToDb(metric: DailyMetricInput): Omit<DailyMetricDb, 'id' | 'created_at'> {
  return {
    branch_id: metric.branchId,
    metric_date: metric.date,
    revenue: metric.revenue,
    cost: metric.cost ?? null, // Optional - will be estimated if null
    additional_cost_today: metric.additionalCostToday != null ? metric.additionalCostToday : null,
    cash_balance: metric.cashBalance ?? null, // Optional - owner can update weekly
    rooms_sold: metric.roomsSold ?? null,
    rooms_available: metric.roomsAvailable ?? null,
    adr: metric.adr ?? null,
    staff_count: metric.accommodationStaff ?? null,
    monthly_fixed_cost: metric.monthlyFixedCost ?? null,
    customers: metric.customers ?? null,
    avg_ticket: metric.avgTicket ?? null,
    top3_menu_revenue: metric.top3MenuRevenue !== undefined ? metric.top3MenuRevenue : null,
    fnb_staff: metric.fnbStaff ?? null, // From branches setup
    promo_spend: metric.promoSpend ?? null,
    rooms_on_books_7: metric.roomsOnBooks7 ?? null,
    rooms_on_books_14: metric.roomsOnBooks14 ?? null,
    variable_cost_per_room: metric.variableCostPerRoom ?? null,
  };
}
