# Hospitality AI Alerts - Implementation Audit Report

**Audit Date**: 2026-01-27  
**Auditor**: AI Assistant  
**Scope**: All 7 alerts in production

---

## Audit Summary Table

| Alert Name | Status | Missing Components |
|-----------|--------|--------------------|
| Cash Runway Alert | ✅ COMPLETELY IMPLEMENTED | None |
| Demand Drop Alert | ⚠️ PARTIALLY IMPLEMENTED | D (Explainer), E (Tests) |
| Cost Pressure Alert | ⚠️ PARTIALLY IMPLEMENTED | D (Explainer), E (Tests) |
| Margin Compression Alert | ⚠️ PARTIALLY IMPLEMENTED | D (Explainer), E (Tests) |
| Seasonal Mismatch Alert | ⚠️ PARTIALLY IMPLEMENTED | D (Explainer), E (Tests), A (Conditional - requires historical data) |
| Data Confidence Risk Alert | ⚠️ PARTIALLY IMPLEMENTED | D (Explainer), E (Tests) |
| Weekend-Weekday Imbalance Alert | ⚠️ PARTIALLY IMPLEMENTED | D (Explainer), E (Tests) |

---

## Detailed Findings by Alert

### 1. Cash Runway Alert ✅ COMPLETELY IMPLEMENTED

**File**: `core/sme-os/engine/rules/cash-runway.ts`

- ✅ **A. Trigger Logic**: Deterministic 90-day projection with cash flow analysis
- ✅ **B. Severity Logic**: Clear thresholds (critical < 7 days, warning < 30 days, info < 60 days)
- ✅ **C. Confidence Calculation**: Base confidence 0.75, decay applied via `monitoring-service.ts` using industry-specific thresholds
- ✅ **D. Explainer Output**: `CashExplainer` class exists with computed values (primaryFactor, contributingFactors, dataQuality)
- ✅ **E. Tests**: `core/sme-os/tests/cash-runway.test.ts` has 2 test cases (critical negative balance, informational healthy position)

**Notes**: This is the only alert with a dedicated explainer class. All other alerts rely on generic message-based explanations.

---

### 2. Demand Drop Alert ⚠️ PARTIALLY IMPLEMENTED

**File**: `core/sme-os/engine/rules/demand-drop.ts`

- ✅ **A. Trigger Logic**: Deterministic comparison of revenue/occupancy/customer volume changes (7-day and 30-day windows)
- ✅ **B. Severity Logic**: Clear thresholds (critical: -30%/-35%/-20%, warning: -20%/-25%/-15%)
- ⚠️ **C. Confidence Calculation**: Hardcoded 0.70, decay applied externally but not computed within rule
- ❌ **D. Explainer Output**: No dedicated explainer. Uses generic explanation constructed from `alert.message` and `contributingFactors` in `use-hospitality-alert-detail.ts` (lines 79-91)
- ❌ **E. Tests**: No test file found

**Missing**: Dedicated explainer class, test suite

---

### 3. Cost Pressure Alert ⚠️ PARTIALLY IMPLEMENTED

**File**: `core/sme-os/engine/rules/cost-pressure.ts`

- ✅ **A. Trigger Logic**: Deterministic comparison of cost vs revenue changes, staff count analysis
- ✅ **B. Severity Logic**: Clear thresholds based on cost-revenue gap (critical: >25%, warning: >15%)
- ⚠️ **C. Confidence Calculation**: Hardcoded 0.75, decay applied externally but not computed within rule
- ❌ **D. Explainer Output**: No dedicated explainer. Uses generic explanation from alert message
- ❌ **E. Tests**: No test file found

**Missing**: Dedicated explainer class, test suite

---

### 4. Margin Compression Alert ⚠️ PARTIALLY IMPLEMENTED

**File**: `core/sme-os/engine/rules/margin-compression.ts`

- ✅ **A. Trigger Logic**: Deterministic margin calculation (7-day and 30-day), detects compression while revenue stable
- ✅ **B. Severity Logic**: Clear thresholds (critical: <-8%/-10% or negative margin, warning: <-5%/-7%)
- ⚠️ **C. Confidence Calculation**: Hardcoded 0.72, decay applied externally but not computed within rule
- ❌ **D. Explainer Output**: No dedicated explainer. Uses generic explanation from alert message
- ❌ **E. Tests**: No test file found

**Missing**: Dedicated explainer class, test suite

---

### 5. Seasonal Mismatch Alert ⚠️ PARTIALLY IMPLEMENTED

**File**: `core/sme-os/engine/rules/seasonal-mismatch.ts`

- ⚠️ **A. Trigger Logic**: Logic exists but **conditionally returns null** if no historical data (line 110). Falls back to simplified heuristic that also returns null. Requires year-over-year comparison data.
- ✅ **B. Severity Logic**: Clear thresholds when historical data available (critical: >35% deviation, warning: >25%)
- ⚠️ **C. Confidence Calculation**: Hardcoded 0.65 (lower due to seasonal variability), decay applied externally
- ❌ **D. Explainer Output**: No dedicated explainer. Uses generic explanation from alert message
- ❌ **E. Tests**: No test file found

**Missing**: Dedicated explainer class, test suite, reliable trigger logic (currently requires historical data that may not exist)

**Note**: This alert may not fire in MVP scenarios where historical year-over-year data is unavailable.

---

### 6. Data Confidence Risk Alert ⚠️ PARTIALLY IMPLEMENTED

**File**: `core/sme-os/engine/rules/data-confidence-risk.ts`

- ✅ **A. Trigger Logic**: Deterministic assessment of data age and confidence thresholds (industry-specific: café 7/14 days, resort 14/30 days)
- ✅ **B. Severity Logic**: Clear thresholds (critical: confidence <0.4 or data age >critical threshold, warning: <0.5 or >warning threshold)
- ✅ **C. Confidence Calculation**: Base confidence 0.85 (high confidence in assessment itself), decay logic is part of the alert's purpose
- ❌ **D. Explainer Output**: No dedicated explainer. Uses generic explanation from alert message
- ❌ **E. Tests**: No test file found

**Missing**: Dedicated explainer class, test suite

**Note**: This alert has higher confidence (0.85) because it's assessing data quality itself.

---

### 7. Weekend-Weekday Imbalance Alert ⚠️ PARTIALLY IMPLEMENTED

**File**: `core/sme-os/engine/rules/weekend-weekday-imbalance.ts`

- ✅ **A. Trigger Logic**: Deterministic heuristic using occupancy rate, revenue efficiency, and revenue variance (applies only to hotel/resort)
- ✅ **B. Severity Logic**: Clear thresholds (warning: occupancy ≥70% with low efficiency, informational: ≥60%)
- ⚠️ **C. Confidence Calculation**: Hardcoded 0.68 (moderate - pattern detection), decay applied externally
- ❌ **D. Explainer Output**: No dedicated explainer. Uses generic explanation from alert message
- ❌ **E. Tests**: No test file found

**Missing**: Dedicated explainer class, test suite

**Note**: This is a paid opportunity alert (type: 'opportunity'), not a risk alert.

---

## Cross-Cutting Observations

### Confidence Calculation Pattern
- **All alerts** have hardcoded base confidence values (0.65-0.85)
- **All alerts** receive confidence decay via `monitoring-service.ts.applyConfidenceDecay()` using industry-specific thresholds
- **No alert** computes confidence dynamically based on data quality/completeness within the rule itself
- **Cash Runway** is the only alert that could benefit from dynamic confidence based on historical variance (which exists in `CashEvaluation`)

### Explainer Pattern
- **Only Cash Runway** has a dedicated `CashExplainer` class with computed explanations
- **All other alerts** rely on generic explanation construction in `use-hospitality-alert-detail.ts` (lines 79-91) that:
  - Uses `alert.message` as `primaryFactor`
  - Extracts `contributingFactors` from alert's `contributingFactors` array
  - Generates static `dataQuality` strings based on `alert.confidence`
- **This is functional but not ideal** - explanations don't use computed values from the evaluation, only from the alert contract

### Test Coverage
- **Only Cash Runway** has tests (`cash-runway.test.ts` with 2 cases)
- **No other alerts** have test files
- **No boundary/edge case tests** exist for any alert (e.g., zero values, missing data, extreme values)

### Integration Status
- **All 7 alerts** are integrated into `monitoring-service.ts` (lines 63-68, 444-473)
- **All alerts** receive confidence decay and suppression logic
- **All alerts** are translated via `hospitality-adapter.ts`

---

## Summary

**Completely Implemented**: 1 alert (Cash Runway)  
**Partially Implemented**: 6 alerts (all others)

**Common Missing Components**:
- Dedicated explainer classes (6 alerts missing)
- Test suites (6 alerts missing)
- Dynamic confidence calculation within rules (all 7 alerts use hardcoded values, though decay is applied externally)

**Priority for Hardening**:
1. **Cash Runway Alert** is production-ready but could benefit from:
   - More edge case tests (zero balance, missing cash flows, extreme projections)
   - Dynamic confidence calculation based on historical variance

2. **Demand Drop Alert** should be hardened first among the partial implementations because:
   - It's a core risk alert (high revenue impact)
   - Logic is deterministic and testable
   - Missing explainer and tests are straightforward to add
   - High user trust requirement (false positives/negatives affect credibility)

3. **Weekend-Weekday Imbalance Alert** (paid feature) should be hardened second because:
   - Revenue opportunity alert (direct monetization)
   - Requires high confidence to justify paid tier
   - Currently has lowest confidence (0.68) among all alerts

**Recommendation for Aider**:
Focus on implementing explainers and tests for Demand Drop Alert first, then Weekend-Weekday Imbalance Alert, as these have the highest correctness and revenue impact.
