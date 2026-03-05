# Seed Real Test Data Script

Production test data seeding script for Supabase validation.

## Overview

This script creates deterministic test data in Supabase for validating real database flows. It creates 3 organizations (healthy, stressed, crisis) with branches and 30 days of weekly metrics each.

## Prerequisites

1. **Supabase Setup**: Ensure you have a Supabase project with the schema applied
2. **Environment Variables**: Set the following in `apps/web/.env.local` or root `.env`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## Usage

```bash
npm run seed:real-test
```

## What It Creates

### Organizations (3)
- `healthy_hotel` - Healthy Hotel Group
- `stressed_hotel` - Stressed Hotel Group  
- `crisis_hotel` - Crisis Hotel Group

### Branches (3)
- `br-healthy-hotel-001` - Grand Healthy Hotel
- `br-stressed-hotel-001` - Struggling Hotel
- `br-crisis-hotel-001` - Crisis Hotel

### Weekly Metrics (90 entries total)
- 30 entries per branch (one per day for 30 days)
- Each entry represents a week's worth of data

## Data Patterns

### Healthy Hotel
- Revenue: Stable at 9.6M THB/month
- Costs: 70% of revenue
- Cash runway: > 6 months
- Occupancy: 75%
- ADR: 3,500 THB

### Stressed Hotel
- Revenue: Declining 15% over 30 days
- Costs: Rising 10% over 30 days
- Cash runway: 2-3 months
- Occupancy: Declining from 60%
- ADR: Declining from 3,200 THB

### Crisis Hotel
- Revenue: Down 40% (stable at low level)
- Costs: High (80% of original revenue)
- Cash runway: < 1 month
- Occupancy: 45%
- ADR: 2,800 THB

## Idempotency

The script is idempotent - running it multiple times will:
1. Upsert organizations (create or update)
2. Delete existing branches and metrics
3. Insert fresh data

This ensures clean, predictable test data.

## Fields Stored

**ONLY user-entered fields are stored:**
- `revenue_30d` - Total revenue last 30 days
- `costs_30d` - Total operating costs last 30 days
- `revenue_7d` - Revenue last 7 days
- `costs_7d` - Costs last 7 days
- `cash_balance` - Current cash balance
- `occupancy_rate_30d` - Occupancy rate (%)
- `avg_daily_room_rate_30d` - Average daily rate (ADR)
- `total_rooms` - Total rooms available
- `accommodation_staff` - Staff count

**Computed values are NOT stored:**
- Health scores
- Alerts
- Revenue exposure
- Any calculated metrics

## Troubleshooting

### Missing Environment Variables
If you see "Missing required environment variables":
1. Check `apps/web/.env.local` exists
2. Verify `NEXT_PUBLIC_SUPABASE_URL` is set
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key!)

### Database Errors
- Ensure Supabase schema is applied (`apps/web/app/lib/supabase/schema.sql`)
- Verify service role key has proper permissions
- Check RLS policies allow service role access

### TypeScript Errors
- Run `npm install` to ensure dependencies are installed
- Verify `ts-node` is installed: `npm list ts-node`

## Notes

- All numbers are deterministic (no randomness)
- Data represents realistic hospitality business patterns
- Suitable for production validation testing
- Simulation mode should be OFF when viewing this data
