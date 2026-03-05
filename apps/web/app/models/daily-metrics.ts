/**
 * Unified Daily Metrics Model
 * 
 * Standardized architecture: All business types use daily_metrics table
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
  roomsAvailable?: number; // Total rooms capacity (from branches setup)
  adr?: number; // Average Daily Rate (THB)
  accommodationStaff?: number; // From branches setup
  
  // F&B Fields (nullable)
  customers?: number;
  avgTicket?: number; // THB
  top3MenuRevenue?: number; // Revenue from top 3 menu items (THB)
  fnbStaff?: number; // From branches setup
  promoSpend?: number; // THB
  
  createdAt: string; // ISO timestamp
}

/**
 * Daily metric input (for creating/updating)
 */
export interface DailyMetricInput {
  branchId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  
  // Shared Financial Fields (FINAL PRODUCTION SCHEMA)
  revenue: number; // Required
  cost?: number; // Optional (will be estimated if not provided)
  additionalCostToday?: number; // Optional THB - increases daily cost
  cashBalance?: number; // Optional (owner can update weekly)
  
  // Accommodation Fields (optional)
  roomsSold?: number;
  roomsAvailable?: number; // From branches setup, not daily input
  adr?: number;
  accommodationStaff?: number; // From branches setup, not daily input
  
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
 * Unified daily_metrics table with all canonical fields
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
  rooms_available?: number | null; // From branches setup
  adr?: number | null; // Average Daily Rate
  accommodation_staff?: number | null; // From branches setup
  
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
  return {
    id: db.id,
    branchId: db.branch_id,
    date: (toDateOnly(db.metric_date) || db.metric_date) as string,
    revenue: Number(db.revenue || 0),
    cost: db.cost !== null && db.cost !== undefined ? Number(db.cost) : undefined,
    additionalCostToday: db.additional_cost_today != null ? Number(db.additional_cost_today) : undefined,
    cashBalance: db.cash_balance !== null && db.cash_balance !== undefined ? Number(db.cash_balance) : undefined,
    roomsSold: db.rooms_sold ? Number(db.rooms_sold) : undefined,
    roomsAvailable: db.rooms_available ? Number(db.rooms_available) : undefined,
    adr: db.adr ? Number(db.adr) : undefined,
    accommodationStaff: db.accommodation_staff ? Number(db.accommodation_staff) : undefined,
    customers: db.customers ? Number(db.customers) : undefined,
    avgTicket: db.avg_ticket ? Number(db.avg_ticket) : undefined,
    top3MenuRevenue: db.top3_menu_revenue !== null && db.top3_menu_revenue !== undefined ? Number(db.top3_menu_revenue) : undefined,
    fnbStaff: db.fnb_staff ? Number(db.fnb_staff) : undefined,
    promoSpend: db.promo_spend ? Number(db.promo_spend) : undefined,
    createdAt: db.created_at,
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
    rooms_available: metric.roomsAvailable ?? null, // From branches setup
    adr: metric.adr ?? null,
    accommodation_staff: metric.accommodationStaff ?? null, // From branches setup
    customers: metric.customers ?? null,
    avg_ticket: metric.avgTicket ?? null,
    top3_menu_revenue: metric.top3MenuRevenue !== undefined ? metric.top3MenuRevenue : null,
    fnb_staff: metric.fnbStaff ?? null, // From branches setup
    promo_spend: metric.promoSpend ?? null,
  };
}
