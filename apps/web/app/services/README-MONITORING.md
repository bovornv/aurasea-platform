# Continuous Monitoring System

## Overview

The platform now functions as a continuous monitoring and early-warning system, not just a static snapshot tool.

## Core Principle

**The platform does NOT forecast outcomes.** It continuously monitors key business signals over time and triggers alerts when risk drifts from normal ranges.

## Architecture

### 1. Operational Signals Service (`operational-signals-service.ts`)

Stores time-stamped operational data as records (not overwrites):
- Cash balance
- Revenue (7-day and 30-day windows)
- Operating costs (7-day and 30-day windows)
- Staff count
- Occupancy rate / Customer volume

**Key Features:**
- Maintains last 90 days of signals
- Calculates trends from recent signals
- Provides data coverage metrics

### 2. Monitoring Service (`monitoring-service.ts`)

Handles continuous evaluation and trend detection:

**Evaluation Triggers:**
- When new operational data is saved
- When user clicks "Refresh Monitoring"
- On initial setup completion (automatic)

**Trend Detection:**
- Cash runway declining for 3 consecutive evaluations
- Occupancy/demand dropping faster than normal
- Costs rising while revenue flat
- Staff count increased without demand increase

**Alert Generation:**
- Converts trend alerts to `AlertContract` format
- Combines with SME OS alerts
- Provides early warnings before problems become urgent

### 3. Monitoring Hook (`use-monitoring.ts`)

React hook for accessing monitoring status and trends:
- Loads monitoring status on mount
- Triggers initial evaluation if setup completed
- Provides refresh function

## Data Flow

```
Business Setup (Static Profile)
    ↓
Initial Signal Created
    ↓
Monitoring Evaluation Runs
    ↓
Operational Signal Saved (Time-stamped)
    ↓
Trend Detection Analyzes Recent Signals
    ↓
Alerts Generated (SME OS + Trend-based)
    ↓
Dashboard Displays Status & Trends
```

## User Experience

### Dashboard Shows:
1. **Monitoring Status Card**
   - Active/Inactive status
   - Last evaluated timestamp
   - Data coverage (days)
   - Evaluation count

2. **Signal Trends**
   - Cash trend (↑ ↓ →)
   - Demand trend (↑ ↓ →)
   - Cost trend (↑ ↓ →)

3. **What Happens Next**
   - Explains continuous monitoring
   - Sets expectation for early warnings

## Future Enhancements

For production, consider:
- Daily automated evaluations (cron job)
- Integration with POS/accounting systems for automatic data entry
- More sophisticated trend detection algorithms
- Historical baseline comparison
- Seasonal pattern recognition

## MVP Limitations

Currently:
- Signals are created from setup data and hospitality data service
- No actual daily data entry UI (would be added in production)
- Trend detection requires at least 3 evaluations
- All data stored in localStorage (would be database in production)
