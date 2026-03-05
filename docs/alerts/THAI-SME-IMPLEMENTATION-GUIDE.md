# Thai SME Threshold Calibration - Implementation Guide

## Overview

This guide explains how to implement Thai SME threshold calibration without breaking existing tests or frozen alert logic.

---

## Implementation Strategy

### Option 1: Environment Variable (Recommended for Testing)

**Step 1**: Set environment variable
```bash
export THAI_SME_MODE=true
# or in .env.local
THAI_SME_MODE=true
```

**Step 2**: Update alert rules to check mode
```typescript
import { isThaiSMEMode, THAI_SME_THRESHOLDS } from '../../config/thai-sme-thresholds';

// In alert rule evaluate() method:
const useThaiSME = isThaiSMEMode();
const criticalThreshold = useThaiSME 
  ? THAI_SME_THRESHOLDS.demandDrop.critical.sevenDay
  : -30; // Default threshold
```

**Pros**: 
- Easy to toggle for testing
- No code changes to frozen alerts
- Can A/B test

**Cons**:
- Requires code changes to each alert rule
- May break frozen alert tests

---

### Option 2: Business Context Parameter (Recommended for Production)

**Step 1**: Extend InputContract
```typescript
interface InputContract {
  // ... existing fields
  businessContext?: {
    region?: 'thailand' | 'international';
    businessSize?: 'sme' | 'enterprise';
    marketType?: 'tourism' | 'local' | 'mixed';
  };
}
```

**Step 2**: Update alert rules to check context
```typescript
const isThaiSME = input.businessContext?.region === 'thailand' && 
                  input.businessContext?.businessSize === 'sme';

const threshold = isThaiSME 
  ? THAI_SME_THRESHOLDS.demandDrop.critical.sevenDay
  : -30; // Default
```

**Pros**:
- Context-aware calibration
- Can support multiple regions
- More flexible

**Cons**:
- Requires InputContract changes
- All callers must provide context

---

### Option 3: Configuration Override (Recommended for Gradual Rollout)

**Step 1**: Create threshold resolver utility
```typescript
// core/sme-os/utils/threshold-resolver.ts
import { THAI_SME_THRESHOLDS } from '../config/thai-sme-thresholds';

export function resolveThreshold(
  alertName: keyof typeof THAI_SME_THRESHOLDS,
  thresholdType: 'critical' | 'warning' | 'informational',
  defaultValue: number,
  input?: InputContract
): number {
  const isThaiSME = input?.businessContext?.region === 'thailand' &&
                    input?.businessContext?.businessSize === 'sme';
  
  if (!isThaiSME) {
    return defaultValue;
  }
  
  // Map alert names to threshold paths
  const thresholdMap: Record<string, any> = {
    demandDrop: THAI_SME_THRESHOLDS.demandDrop,
    costPressure: THAI_SME_THRESHOLDS.costPressure,
    // ... etc
  };
  
  const thaiThreshold = thresholdMap[alertName]?.[thresholdType];
  return thaiThreshold ?? defaultValue;
}
```

**Step 2**: Use in alert rules
```typescript
import { resolveThreshold } from '../../utils/threshold-resolver';

const criticalThreshold = resolveThreshold(
  'demandDrop',
  'critical',
  -30, // Default
  input
);
```

**Pros**:
- Centralized threshold logic
- Easy to maintain
- Supports gradual migration

**Cons**:
- Requires refactoring alert rules
- May break frozen tests

---

## Migration Plan

### Phase 1: Non-Frozen Alerts (Low Risk)
Start with alerts that are NOT marked as FROZEN:
1. `demand-drop.ts`
2. `cost-pressure.ts`
3. `margin-compression.ts`
4. `seasonal-mismatch.ts`
5. `data-confidence-risk.ts`

**Action**: Add Thai SME threshold checks to these alerts first.

---

### Phase 2: Create V2 Versions for Frozen Alerts
For FROZEN alerts (test-locked), create new versions:
- `menu-revenue-concentration-v2.ts`
- `break-even-risk-v2.ts`
- `liquidity-runway-risk-v2.ts`
- etc.

**Action**: Copy frozen alert, apply Thai SME thresholds, create new tests.

---

### Phase 3: Gradual Rollout
1. Enable Thai SME mode for test branches
2. Monitor alert frequency and accuracy
3. Adjust thresholds based on real data
4. Roll out to production

---

## Testing Strategy

### Unit Tests
Create tests that verify:
1. Default thresholds work correctly
2. Thai SME thresholds are more sensitive
3. Threshold switching works

```typescript
describe('Thai SME Threshold Calibration', () => {
  it('should use more sensitive thresholds for Thai SMEs', () => {
    const input = {
      businessContext: { region: 'thailand', businessSize: 'sme' },
      // ... other inputs
    };
    
    // Test that alert triggers at -25% instead of -30%
    const alert = rule.evaluate(input, signalsWith25PercentDrop);
    expect(alert).not.toBeNull();
    expect(alert.severity).toBe('critical');
  });
});
```

---

## Validation Checklist

After implementation:
- [ ] All 16 alerts have Thai SME threshold support
- [ ] Default thresholds still work (backward compatible)
- [ ] Thai SME thresholds are 10-20% more sensitive
- [ ] No frozen alert tests broken
- [ ] New tests cover Thai SME calibration
- [ ] Documentation updated

---

## Rollback Plan

If issues arise:
1. Set `THAI_SME_MODE=false` to revert to defaults
2. Or remove `businessContext` from InputContract
3. All alerts will use default thresholds

---

## Next Steps

1. **Review calibration document**: `docs/alerts/THAI-SME-THRESHOLD-CALIBRATION.md`
2. **Choose implementation strategy**: Option 1, 2, or 3
3. **Start with Phase 1**: Update non-frozen alerts
4. **Test thoroughly**: Verify thresholds work correctly
5. **Monitor in production**: Adjust based on real data

---

**Note**: Many alerts are FROZEN and test-locked.  
For these, create V2 versions rather than modifying originals.
