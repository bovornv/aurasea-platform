# F&B views – next steps

## What’s in place

- **Operating Status (F&B)**  
  Reads from `fnb_operating_status`; fallback to `fnb_latest_metrics` if the view is missing or empty.

- **Alerts (Accommodation + F&B)**  
  Alerts from **`branch_alerts_display`** only (filtered by `business_type`: `accommodation` or `fnb`). Financial impact for F&B from `fnb_daily_metrics` (select branch_id, metric_date, revenue). See `branch-alerts-display-next-steps.md`.

- **Log Today (F&B)**  
  Saves to `fnb_daily_metrics` with `revenue`, `total_customers`, `staff_count`, etc.

## 1. Create the views in Supabase

Run the migration that defines the F&B views:

```bash
# In Supabase SQL Editor, run:
# apps/web/app/lib/supabase/add-fnb-views.sql
```

That script creates (or replaces):

- `fnb_latest_metrics` – latest row per branch (fallback for Operating Status).
- `fnb_operating_status` – one row per branch for the Operating Status page.
- `fnb_alerts_today` – placeholder returning no rows until you have alert data.
- F&B financial impact: app reads latest row from `fnb_daily_metrics` (branch_id, metric_date, revenue).

If your `fnb_daily_metrics` uses different column names (e.g. `date` instead of `metric_date`, `total_sales` instead of `revenue`), edit the `COALESCE(...)` and column names in `add-fnb-views.sql` to match.

## 2. Optional: wire real alerts and impact

- **fnb_alerts_today**  
  Right now it’s a stub that returns no rows. When you have an F&B alert source (table or view), change the view definition to select from it and expose: `branch_id`, `metric_date`, `alert_name`, `alert_message`, `recommendation`, `confidence`, `estimated_revenue_impact`.

- **F&B financial impact**  
  App reads from `fnb_daily_metrics` (branch_id, metric_date, revenue). Impact metrics (total_revenue_at_risk, etc.) are shown as 0 unless you add a separate impact view.

## 3. Verify in the app

- **F&B Operating Status**  
  Open an F&B branch → Operating Status. Cards should show values from `fnb_operating_status` (or from `fnb_latest_metrics` if the view is missing).

- **F&B Alerts**  
  Open an F&B branch → Alerts. You should see “System stable — no alerts detected.” and the financial impact section (from latest `fnb_daily_metrics` row; impact totals show 0).

- **F&B Log Today**  
  Enter and save metrics; they should persist in `fnb_daily_metrics` and appear on Operating Status after refresh.
