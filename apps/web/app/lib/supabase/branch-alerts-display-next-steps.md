# branch_alerts_display – Alerts page (Accommodation + F&B)

## What’s in place

- **Alerts page (both Accommodation and F&B)**  
  Loads alerts only from the view **`branch_alerts_display`**:
  - Accommodation: `.eq('business_type', 'accommodation')`
  - F&B: `.eq('business_type', 'fnb')`
- **Dedupe:** One alert per `alert_code` (later rows overwrite earlier in the reduce).
- **Localization:** All alert text from Supabase — no hard-coded messages.
  - **Title:** `message_th` (if language is Thai) or `message_en` (otherwise).
  - **Suggested action:** `action_th` or `action_en` the same way.
- **Displayed fields:** Alert title (message_th/message_en), Suggested action (action_th/action_en), Confidence (confidence_score), Estimated impact (estimated_revenue_impact).

## 1. Create the view in Supabase

The app expects a view **`branch_alerts_display`** with at least:

| Column               | Type    | Description                          |
|----------------------|---------|--------------------------------------|
| branch_id            | text/uuid | Branch id                          |
| metric_date          | date    | Date of the metric                   |
| business_type        | text    | `'accommodation'` or `'fnb'`         |
| alert_code           | text    | Unique code per alert type (for dedupe) |
| message_th           | text    | Alert title / message (Thai)         |
| message_en           | text    | Alert title / message (English)      |
| action_th            | text    | Suggested action (Thai)               |
| action_en            | text    | Suggested action (English)            |
| confidence_score     | numeric | 0–1 or 0–100                         |
| estimated_revenue_impact | numeric | Daily impact (THB)               |
| alert_severity       | text    | Optional: `high`, `medium`, `low`     |

Example stub (no rows until you have alert data):

```sql
-- Stub: correct shape, no rows. Replace with real SELECT from your alert tables.
CREATE OR REPLACE VIEW branch_alerts_display AS
SELECT
  b.id AS branch_id,
  CURRENT_DATE AS metric_date,
  NULL::text AS business_type,
  NULL::text AS alert_code,
  NULL::text AS message_th,
  NULL::text AS message_en,
  NULL::text AS action_th,
  NULL::text AS action_en,
  NULL::numeric AS confidence_score,
  NULL::numeric AS estimated_revenue_impact,
  NULL::text AS alert_severity
FROM branches b
WHERE 1 = 0;
```

When you have alert data, replace the view with a `SELECT` from your alerts table(s), joining to get `message_th`, `message_en`, `action_th`, `action_en` (e.g. from a lookup or from the same table).

## 2. Verify in the app

- Open an **Accommodation** branch → Alerts. Data should come from `branch_alerts_display` with `business_type = 'accommodation'`.
- Open an **F&B** branch → Alerts. Data should come from `branch_alerts_display` with `business_type = 'fnb'`.
- Switch language: titles and suggested actions should follow `message_th`/`message_en` and `action_th`/`action_en`.
- No duplicate alerts for the same `alert_code`.
