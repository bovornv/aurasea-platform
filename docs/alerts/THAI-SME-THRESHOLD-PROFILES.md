# Thai SME Threshold Profiles Implementation

## Overview

This document describes the implementation of business-type-based threshold profiles for Thai SME calibration across all 16 alerts.

## Structure

### Threshold Profiles (`core/sme-os/config/threshold-profiles.ts`)

Thresholds are organized by business type (accommodation vs fnb) rather than by alert name:

```typescript
export const THAI_SME_THRESHOLDS = {
  accommodation: {
    costRatioWarning: 0.70,
    costRatioCritical: 0.80,
    occupancyWarning: 0.45,
    occupancyCritical: 0.35,
    weekendDependencyWarning: 0.60,
    weekendDependencyCritical: 0.70,
    cashRunwayWarningDays: 45,
    cashRunwayCriticalDays: 20,
    revenueVolatilityWarning: 0.25,
    revenueVolatilityCritical: 0.40,
    marginCompressionWarning: 0.08,
    marginCompressionCritical: 0.15,
  },
  fnb: {
    costRatioWarning: 0.78,
    costRatioCritical: 0.88,
    top3RevenueWarning: 0.65,
    top3RevenueCritical: 0.75,
    customerDropWarning: 0.20,
    customerDropCritical: 0.35,
    promoInefficiencyWarning: 0.18,
    promoInefficiencyCritical: 0.30,
    revenueDeclineWarning: 0.15,
    revenueDeclineCritical: 0.30,
  }
};
```

## Alert Mapping

The threshold profile mapper (`core/sme-os/utils/threshold-profile-mapper.ts`) maps business-type thresholds to specific alerts:

### Accommodation Alerts
- `cost-pressure` → `costRatioWarning/Critical`
- `capacity-utilization` → `occupancyWarning/Critical`
- `revenue-concentration` → `weekendDependencyWarning/Critical`
- `cash-runway` → `cashRunwayWarningDays/CriticalDays`
- `cash-flow-volatility` → `revenueVolatilityWarning/Critical`
- `margin-compression` → `marginCompressionWarning/Critical`

### F&B Alerts
- `cost-pressure` → `costRatioWarning/Critical`
- `menu-revenue-concentration` → `top3RevenueWarning/Critical`
- `demand-drop` → `customerDropWarning/Critical`
- `weekend-weekday-fnb-gap` → `promoInefficiencyWarning/Critical`
- `low-weekday-utilization` → `revenueDeclineWarning/Critical`

## Usage in Alert Rules

### Pattern for Non-Frozen Alerts

```typescript
import { getThreshold } from '../../utils/threshold-profile-mapper';

// In evaluate method:
const thresholds = getAlertThresholds('cost-pressure', input);
const warningThreshold = thresholds?.warning ?? 0.70; // default
const criticalThreshold = thresholds?.critical ?? 0.80; // default

// Use thresholds in severity determination
if (costRatio > criticalThreshold) {
  severity = 'critical';
} else if (costRatio > warningThreshold) {
  severity = 'warning';
}
```

### Pattern for Frozen Alerts (V2 Versions)

Frozen alerts cannot be modified directly. Use V2 versions:
- `cost-pressure.ts` → Already updated (non-frozen)
- `menu-revenue-concentration-v2.ts` → Use V2 version
- `cash-runway-v2.ts` → Use V2 version
- etc.

## Console Audit

The mapper automatically logs threshold usage:

```typescript
console.log(`Using THAI SME thresholds for: ${businessType} (alert: ${alertName})`);
```

This appears when:
1. Thai SME mode is enabled (`THAI_SME_MODE=true`)
2. OR `businessContext: { region: 'thailand', businessSize: 'sme' }` is provided
3. AND the alert is mapped in the threshold profile

## Activation

### Option 1: Environment Variable
```bash
export THAI_SME_MODE=true
```

### Option 2: Business Context
```typescript
const input: InputContract = {
  // ... other fields
  businessContext: {
    region: 'thailand',
    businessSize: 'sme',
  }
};
```

## Status

### ✅ Completed
- Created `threshold-profiles.ts` with accommodation/fnb structure
- Created `threshold-profile-mapper.ts` utility
- Integrated with existing threshold resolver
- Console logging implemented
- V2 versions created for all 11 frozen alerts

### ⚠️ Notes
- **Frozen Alerts**: Cannot be modified directly. Use V2 versions.
- **Partial Coverage**: The profile structure covers 10 threshold types, but we have 16 alerts. Unmapped alerts fall back to the alert-based system (`thai-sme-thresholds.ts`).
- **Dual System**: Both systems coexist - profile-based (simpler) and alert-based (comprehensive).

## Next Steps

1. **Complete Mapping**: Add remaining 6 alerts to profile mapper
2. **Testing**: Validate thresholds with Thai SME data
3. **Rollout**: Enable for test branches, then production
4. **Monitoring**: Track alert frequency and adjust thresholds as needed
