# Thai SME Threshold Calibration - Implementation Status

**Last Updated**: 2026-01-24  
**Status**: Phase 1 Complete ✅

---

## ✅ Phase 1: Non-Frozen Alerts (COMPLETE)

### Updated Alert Rules

All non-frozen alerts now support Thai SME threshold calibration:

1. **`demand-drop.ts`** ✅
   - Uses `resolveDemandDropThreshold()` for all thresholds
   - Critical: -25% (7-day) / -30% (30-day) for Thai SMEs
   - Warning: -15% (7-day) / -20% (30-day) for Thai SMEs

2. **`cost-pressure.ts`** ✅
   - Uses `resolveCostPressureThreshold()` for all thresholds
   - Critical: 20% gap (default: 25%) for Thai SMEs
   - Warning: 10% gap (default: 15%) for Thai SMEs

3. **`margin-compression.ts`** ✅
   - Uses `resolveMarginCompressionThreshold()` for all thresholds
   - Critical: -6% (7-day) / -8% (30-day) for Thai SMEs
   - Warning: -3% (7-day) / -5% (30-day) for Thai SMEs

4. **`seasonal-mismatch.ts`** ✅
   - Uses `resolveSeasonalMismatchThreshold()` for all thresholds
   - Critical: 30% deviation (default: 35%) for Thai SMEs
   - Warning: 20% deviation (default: 25%) for Thai SMEs

5. **`data-confidence-risk.ts`** ✅
   - Uses `resolveDataConfidenceThreshold()` for all thresholds
   - Critical confidence: 0.45 (default: 0.4) for Thai SMEs
   - Warning confidence: 0.55 (default: 0.5) for Thai SMEs
   - Data age thresholds adjusted per business type

---

## 📋 Infrastructure Created

### 1. Configuration File
**`core/sme-os/config/thai-sme-thresholds.ts`**
- Complete threshold configuration for all 16 alerts
- Helper functions: `isThaiSMEMode()`, `getThreshold()`
- Type-safe TypeScript interfaces

### 2. Threshold Resolver Utility
**`core/sme-os/utils/threshold-resolver.ts`**
- `isThaiSMEContext()` - Checks business context
- `resolveDemandDropThreshold()` - Demand drop thresholds
- `resolveCostPressureThreshold()` - Cost pressure thresholds
- `resolveMarginCompressionThreshold()` - Margin thresholds
- `resolveSeasonalMismatchThreshold()` - Seasonal thresholds
- `resolveDataConfidenceThreshold()` - Data confidence thresholds
- `resolveThreshold()` - Generic fallback resolver

### 3. InputContract Extension
**`core/sme-os/contracts/inputs.ts`**
- Added optional `businessContext` field:
  ```typescript
  businessContext?: {
    region?: 'thailand' | 'international';
    businessSize?: 'sme' | 'enterprise';
    marketType?: 'tourism' | 'local' | 'mixed';
  };
  ```

---

## 🔄 How It Works

### Detection Logic
1. **Business Context**: Checks `input.businessContext.region === 'thailand' && businessSize === 'sme'`
2. **Environment Variable**: Falls back to `THAI_SME_MODE=true` if context not provided
3. **Threshold Resolution**: Uses Thai SME thresholds if detected, otherwise defaults

### Example Usage
```typescript
// In alert rule:
const criticalThreshold = resolveDemandDropThreshold(
  'critical',
  'sevenDay',
  -30, // Default threshold
  input  // InputContract with optional businessContext
);

// If input.businessContext = { region: 'thailand', businessSize: 'sme' }
// → Returns -25 (Thai SME threshold)

// Otherwise
// → Returns -30 (default threshold)
```

---

## 📊 Calibration Summary

**Overall Approach**: 10-20% more sensitive thresholds for Thai SMEs

| Alert Type | Adjustment | Rationale |
|------------|------------|-----------|
| Cash/Liquidity | 20-30% more sensitive | Lower cash reserves typical |
| Revenue | 15-20% more sensitive | Thinner margins, need earlier warning |
| Cost/Margin | 10-15% more sensitive | Cost increases more dangerous |
| Utilization | 10-15% more sensitive | Optimization critical |

---

## 🚧 Next Steps

### Phase 2: Frozen Alerts (IN PROGRESS - 5/11 Complete)
Create V2 versions for test-locked alerts:

**✅ Completed:**
- `menu-revenue-concentration-v2.ts` ✅
- `liquidity-runway-risk-v2.ts` ✅
- `break-even-risk-v2.ts` ✅
- `cash-flow-volatility-v2.ts` ✅
- `cash-runway-v2.ts` ✅

**⏳ Remaining:**
- `low-weekday-utilization-v2.ts`
- `capacity-utilization-v2.ts`
- `weekend-weekday-imbalance-v2.ts`
- `weekend-weekday-fnb-gap-v2.ts`
- `revenue-concentration-v2.ts`
- `seasonality-risk-v2.ts`

**Note**: These alerts are FROZEN (test-locked). Create new versions rather than modifying originals.

### Phase 3: Testing & Validation
1. Unit tests for threshold resolution
2. Integration tests with Thai SME data
3. A/B testing in production
4. Monitor alert frequency and accuracy
5. Adjust thresholds based on real data

### Phase 4: Gradual Rollout
1. Enable for test branches
2. Monitor metrics
3. Roll out to production
4. Document learnings

---

## 📝 Usage Instructions

### Option 1: Business Context (Recommended)
```typescript
const input: InputContract = {
  // ... other fields
  businessContext: {
    region: 'thailand',
    businessSize: 'sme',
    marketType: 'tourism'
  }
};

const alert = rule.evaluate(input, signals);
// Automatically uses Thai SME thresholds
```

### Option 2: Environment Variable
```bash
# .env.local
THAI_SME_MODE=true
```

```typescript
// All alerts will use Thai SME thresholds
const alert = rule.evaluate(input, signals);
```

---

## ✅ Validation Checklist

- [x] InputContract extended with businessContext
- [x] Threshold resolver utility created
- [x] Configuration file with all thresholds
- [x] Phase 1 alerts updated (5/5)
- [x] Phase 2 V2 alerts created (5/11)
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Production testing complete
- [ ] Documentation updated

---

## 📚 Related Documentation

- **Calibration Guide**: `docs/alerts/THAI-SME-THRESHOLD-CALIBRATION.md`
- **Implementation Guide**: `docs/alerts/THAI-SME-IMPLEMENTATION-GUIDE.md`
- **Configuration**: `core/sme-os/config/thai-sme-thresholds.ts`
- **Resolver Utility**: `core/sme-os/utils/threshold-resolver.ts`

---

**Status**: Ready for Phase 2 (Frozen Alert V2 Creation)
