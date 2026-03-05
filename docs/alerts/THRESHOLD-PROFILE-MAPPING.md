# Threshold Profile Mapping

## Alert to Business Type Mapping

### Accommodation Alerts (8 alerts)
1. **demand-drop** → Uses: occupancyWarning, occupancyCritical
2. **cost-pressure** → Uses: costRatioWarning, costRatioCritical
3. **margin-compression** → Uses: marginCompressionWarning, marginCompressionCritical
4. **liquidity-runway-risk** → Uses: liquidityRunwayWarning, liquidityRunwayCritical
5. **cash-runway** → Uses: cashRunwayWarningDays, cashRunwayCriticalDays
6. **cash-flow-volatility** → Uses: revenueVolatilityWarning, revenueVolatilityCritical
7. **capacity-utilization** → Uses: capacityUnderutilizedWarning/Critical, capacityOverutilizedWarning/Critical
8. **seasonality-risk** → Uses: seasonalityWarning, seasonalityCritical
9. **break-even-risk** → Uses: breakEvenWarning, breakEvenCritical
10. **revenue-concentration** → Uses: weekendDependencyWarning, weekendDependencyCritical
11. **weekend-weekday-imbalance** → Uses: weekendDependencyWarning, weekendDependencyCritical

### F&B Alerts (5 alerts)
1. **demand-drop** → Uses: customerDropWarning, customerDropCritical
2. **cost-pressure** → Uses: costRatioWarning, costRatioCritical
3. **margin-compression** → Uses: marginCompressionWarning, marginCompressionCritical
4. **menu-revenue-concentration** → Uses: top3RevenueWarning, top3RevenueCritical
5. **weekend-weekday-fnb-gap** → Uses: weekendWeekdayGapWarning, weekendWeekdayGapCritical
6. **low-weekday-utilization** → Uses: weekdayUtilizationWarning, weekdayUtilizationCritical
7. **data-confidence-risk** → Uses: dataConfidenceWarning, dataConfidenceCritical

### Shared Alerts (apply to both)
- **seasonal-mismatch** → Uses accommodation thresholds (seasonality-based)
- **revenue-concentration** → Uses accommodation thresholds (weekend dependency)

## Implementation Strategy

1. Determine business type from alert scope or input context
2. Load appropriate threshold profile
3. Replace hardcoded thresholds with profile values
4. Add console logging for debugging
5. Preserve all calculation formulas
