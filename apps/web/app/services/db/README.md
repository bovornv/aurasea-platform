# Database Layer - Metrics Service

## Overview

The database layer provides persistent storage for user-entered metrics using Supabase Postgres.

## Architecture Rules

1. **Store ONLY user-entered metrics** - No computed values (health score, alerts, exposure)
2. **NEVER store simulation data** - Simulation mode writes are blocked at the service level
3. **All computed values are generated dynamically** - Health scores, alerts, and exposure are calculated on-demand from raw metrics

## Database Schema

See `apps/web/app/lib/supabase/schema.sql` for the complete schema definition.

### Tables

- `organizations` - Organization/company records
- `branches` - Branch/location records
- `daily_metrics` - User-entered daily metrics (unified table for all business types)

## Usage

### Save Daily Metrics

```typescript
import { saveDailyMetric } from './services/db/daily-metrics-service';

await saveDailyMetric({
  branchId: 'branch-id',
  date: '2024-01-15',
  revenue: 50000,
  cost: 30000,
  cashBalance: 100000,
  // ... other fields
});
```

### Get Latest Metrics

```typescript
import { getLatestMetrics } from './services/db/metrics-service';

const metrics = await getLatestMetrics(branchId, groupId);
```

### Get Metrics History

```typescript
import { getMetricsHistory } from './services/db/metrics-service';

const history = await getMetricsHistory(branchId, groupId, 90); // Last 90 days
```

## Fallback Behavior

If Supabase is not configured or unavailable:
- Falls back to localStorage automatically
- No errors thrown - graceful degradation
- Logs warnings in development mode

## Simulation Mode Protection

The service automatically checks for simulation mode and:
- **Skips database writes** when simulation is active
- **Returns null** from database reads when simulation is active
- Logs a message indicating simulation mode is active

## Environment Variables

Required for Supabase:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Installation

Add Supabase client library:

```bash
npm install @supabase/supabase-js
```

## Migration Notes

- Existing localStorage data continues to work as fallback
- Database writes are opt-in (only when Supabase is configured)
- No breaking changes to existing code
