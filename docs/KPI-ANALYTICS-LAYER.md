# KPI Analytics Layer

Analytics pages read from the database KPI layer instead of raw tables. Averages and trend data come from the DB; the frontend no longer computes rolling averages.

## Tables / views

| Source | Purpose |
|--------|---------|
| `branch_latest_kpi` | Operating Status: one row per branch (latest metric). Columns: branch_id, metric_date, revenue/total_revenue_thb, customers, rooms_sold, occupancy_rate, health_score, confidence_score, avg_revenue_7d, avg_revenue_30d. |
| `branch_alerts` | Alerts: rows with revenue_alert, customer_alert, occupancy_alert, cost_alert, cash_alert (display where IS NOT NULL). |
| `branch_recommendations` | Recommendations: branch_id, recommendation, category, priority, metric_date. Display non-null recommendation. |
| `branch_kpi_metrics` | Trends: time series. Columns: branch_id, metric_date, revenue, avg_revenue_7d, avg_revenue_30d. Ordered by metric_date. |

## App usage

- **Operating Status (branch overview)**  
  `getLatestMetricForDashboard()` tries `getLatestKpiForDashboard(branchId)` (branch_latest_kpi) first; falls back to fnb_latest_metrics / accommodation_latest_metrics if no row.

- **Alerts page**  
  `getBranchAlertsFromKpi(branchId)` → branch_alerts. Flattened by revenue_alert, customer_alert, etc. Shown in “Alerts (from analytics)” when present; engine alerts still used for financial impact when no KPI alerts.

- **Recommendations (branch overview BLOCK 5)**  
  `getBranchRecommendationsFromKpi(branchId)` → branch_recommendations. When non-empty, “What You Should Do This Week” shows these; otherwise engine-derived recommended actions.

- **Trends page**  
  Revenue chart and sufficient-history check use `getBranchKpiMetrics(branchId, days)` → branch_kpi_metrics. No frontend average calculation.

## Service

`apps/web/app/services/db/kpi-analytics-service.ts`:

- `getLatestKpiForDashboard(branchId)` → LatestMetricForDashboard | null  
- `getBranchAlertsFromKpi(branchId)` → BranchAlertRow[]  
- `getBranchRecommendationsFromKpi(branchId)` → BranchRecommendationRow[]  
- `getBranchKpiMetrics(branchId, days?)` → BranchKpiMetricRow[]

## If tables are missing

Until these objects exist in the DB, the app falls back to existing behavior (legacy views, engine alerts, getDailyMetrics). Add migrations or views that match the column names above so the KPI layer can be used.
