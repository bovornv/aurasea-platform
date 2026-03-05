# Thai SME Threshold Calibration Guide

**Purpose**: Calibrate all alert thresholds for Thai SME business context  
**Date**: 2026-01-24  
**Scope**: All 16 alerts

---

## Thai SME Business Context

### Typical Thai SME Characteristics:
- **Revenue Range**: 50,000 - 2,000,000 THB/month
- **Cash Reserves**: Typically 1-3 months operating expenses
- **Seasonality**: Strong (tourism peaks Nov-Feb, low season May-Oct)
- **Volatility**: Higher than Western SMEs due to tourism dependency
- **Operating Margins**: 10-25% typical (lower than Western SMEs)
- **Break-even Sensitivity**: More sensitive due to lower margins

### Key Calibration Principles:
1. **More Sensitive**: Thai SMEs operate with thinner margins → alerts should trigger earlier
2. **Seasonality Aware**: Account for strong seasonal patterns
3. **Cash Flow Critical**: Cash reserves are typically lower → cash alerts more critical
4. **Tourism Dependent**: Revenue volatility is normal → adjust volatility thresholds

---

## Alert Threshold Calibration Matrix

### 1. Demand Drop Alert
**Current Thresholds:**
- Critical: -30% (7-day) / -35% (30-day)
- Warning: -20% (7-day) / -25% (30-day)

**Thai SME Calibration:**
- **Critical**: -25% (7-day) / -30% (30-day) ← More sensitive
- **Warning**: -15% (7-day) / -20% (30-day) ← More sensitive

**Rationale**: Thai SMEs have less buffer, need earlier warning

---

### 2. Cost Pressure Alert
**Current Thresholds:**
- Critical: Cost rise > Revenue rise + 25% OR Staff +20% with revenue < 0%
- Warning: Cost rise > Revenue rise + 15% OR Staff +15% with revenue < 5%

**Thai SME Calibration:**
- **Critical**: Cost rise > Revenue rise + 20% OR Staff +15% with revenue < 0% ← More sensitive
- **Warning**: Cost rise > Revenue rise + 10% OR Staff +10% with revenue < 5% ← More sensitive

**Rationale**: Lower margins mean cost increases are more dangerous

---

### 3. Margin Compression Alert
**Current Thresholds:**
- Critical: Margin change < -8% (7-day) / -10% (30-day) OR negative margin
- Warning: Margin change < -5% (7-day) / -7% (30-day)

**Thai SME Calibration:**
- **Critical**: Margin change < -6% (7-day) / -8% (30-day) OR negative margin ← More sensitive
- **Warning**: Margin change < -3% (7-day) / -5% (30-day) ← More sensitive

**Rationale**: Typical margins are 10-25%, so smaller compressions are significant

---

### 4. Seasonal Mismatch Alert
**Current Thresholds:**
- Critical: Deviation > 35%
- Warning: Deviation > 25%
- Trigger: Peak season < -20% OR Low season > +30%

**Thai SME Calibration:**
- **Critical**: Deviation > 30% ← More sensitive
- **Warning**: Deviation > 20% ← More sensitive
- **Trigger**: Peak season < -15% OR Low season > +25% ← More sensitive

**Rationale**: Strong seasonality means deviations are more significant

---

### 5. Data Confidence Risk Alert
**Current Thresholds:**
- Critical: Confidence < 0.4 OR Data age > 14 days (cafe) / 30 days (resort)
- Warning: Confidence < 0.5 OR Data age > 7 days (cafe) / 14 days (resort)

**Thai SME Calibration:**
- **Critical**: Confidence < 0.45 OR Data age > 10 days (cafe) / 21 days (resort) ← More sensitive
- **Warning**: Confidence < 0.55 OR Data age > 5 days (cafe) / 10 days (resort) ← More sensitive

**Rationale**: Daily updates are critical for Thai SMEs with volatile cash flow

---

### 6. Weekend-Weekday Imbalance Alert
**Current Thresholds:**
- Critical: Weekend occupancy > 90% AND Premium < 1.1x OR Occupancy < 50% AND Premium > 2.5x
- Warning: Weekend occupancy > 85% AND Premium < 1.2x OR Occupancy < 60% AND Premium > 2.0x

**Thai SME Calibration:**
- **Critical**: Weekend occupancy > 85% AND Premium < 1.15x OR Occupancy < 55% AND Premium > 2.3x ← More sensitive
- **Warning**: Weekend occupancy > 80% AND Premium < 1.25x OR Occupancy < 65% AND Premium > 1.8x ← More sensitive

**Rationale**: Pricing optimization is critical for Thai SMEs

---

### 7. Low Weekday Utilization Alert
**Current Thresholds:**
- Critical: Utilization < 30%
- Warning: Utilization 30-49.9%
- Informational: Utilization 50-69.9%

**Thai SME Calibration:**
- **Critical**: Utilization < 35% ← More sensitive
- **Warning**: Utilization 35-54.9% ← More sensitive
- **Informational**: Utilization 55-74.9% ← More sensitive

**Rationale**: Weekday revenue opportunities are critical for Thai SMEs

---

### 8. Capacity Utilization Alert
**Current Thresholds:**
- Critical: Avg occupancy < 40% OR > 90% OR Peak days >= 7
- Warning: Avg occupancy < 50% OR > 85% OR Peak days >= 5

**Thai SME Calibration:**
- **Critical**: Avg occupancy < 45% OR > 85% OR Peak days >= 5 ← More sensitive
- **Warning**: Avg occupancy < 55% OR > 80% OR Peak days >= 3 ← More sensitive

**Rationale**: Capacity optimization is critical for Thai SMEs

---

### 9. Weekend-Weekday F&B Gap Alert
**Current Thresholds:**
- Critical: Ratio >= 2.8x
- Warning: Ratio >= 2.0x and < 2.8x
- Informational: Ratio >= 1.5x and < 2.0x

**Thai SME Calibration:**
- **Critical**: Ratio >= 2.5x ← More sensitive
- **Warning**: Ratio >= 1.8x and < 2.5x ← More sensitive
- **Informational**: Ratio >= 1.3x and < 1.8x ← More sensitive

**Rationale**: F&B gaps indicate pricing/marketing opportunities

---

### 10. Menu Revenue Concentration Alert
**Current Thresholds:**
- Critical: Concentration >= 70%
- Warning: Concentration >= 55% and < 70%
- Informational: Concentration >= 40% and < 55%

**Thai SME Calibration:**
- **Critical**: Concentration >= 65% ← More sensitive
- **Warning**: Concentration >= 50% and < 65% ← More sensitive
- **Informational**: Concentration >= 35% and < 50% ← More sensitive

**Rationale**: Menu diversification is critical for Thai F&B SMEs

---

### 11. Liquidity Runway Risk Alert
**Current Thresholds:**
- Critical: Runway < 3 months
- Warning: Runway 3-6 months
- Informational: Runway 6-12 months
- Healthy: Runway >= 12 months (no alert)

**Thai SME Calibration:**
- **Critical**: Runway < 2 months ← More sensitive
- **Warning**: Runway 2-4 months ← More sensitive
- **Informational**: Runway 4-8 months ← More sensitive
- **Healthy**: Runway >= 8 months (no alert) ← Lower threshold

**Rationale**: Thai SMEs typically have 1-3 months cash reserves

---

### 12. Revenue Concentration Alert
**Current Thresholds:**
- Critical: Weekend share > 70% OR Top 5 days > 50%
- Warning: Weekend share > 60% OR Top 5 days > 40%

**Thai SME Calibration:**
- **Critical**: Weekend share > 65% OR Top 5 days > 45% ← More sensitive
- **Warning**: Weekend share > 55% OR Top 5 days > 35% ← More sensitive

**Rationale**: Revenue concentration is riskier for Thai SMEs

---

### 13. Cash Flow Volatility Alert
**Current Thresholds:**
- Critical: CV >= 0.75
- Warning: CV >= 0.5 and < 0.75
- Informational: CV >= 0.25 and < 0.5

**Thai SME Calibration:**
- **Critical**: CV >= 0.70 ← More sensitive
- **Warning**: CV >= 0.45 and < 0.70 ← More sensitive
- **Informational**: CV >= 0.20 and < 0.45 ← More sensitive

**Rationale**: Higher volatility is normal for Thai SMEs, but still risky

---

### 14. Break-Even Risk Alert
**Current Thresholds:**
- Critical: Ratio < 0.9
- Warning: Ratio >= 0.9 and < 1.0
- Informational: Ratio >= 1.0 and <= 1.15

**Thai SME Calibration:**
- **Critical**: Ratio < 0.95 ← More sensitive
- **Warning**: Ratio >= 0.95 and < 1.05 ← More sensitive
- **Informational**: Ratio >= 1.05 and <= 1.20 ← More sensitive

**Rationale**: Thai SMEs need buffer above break-even due to volatility

---

### 15. Seasonality Risk Alert
**Current Thresholds:**
- Critical: Ratio >= 2.0
- Warning: Ratio >= 1.5 and < 2.0
- Informational: Ratio >= 1.2 and < 1.5

**Thai SME Calibration:**
- **Critical**: Ratio >= 1.8 ← More sensitive
- **Warning**: Ratio >= 1.4 and < 1.8 ← More sensitive
- **Informational**: Ratio >= 1.1 and < 1.4 ← More sensitive

**Rationale**: Strong seasonality is expected, but extreme ratios are risky

---

### 16. Cash Runway Alert
**Current Thresholds:**
- Critical: Balance < 0 OR Coverage < 7 days
- Warning: Coverage < 30 days
- Informational: Coverage < 60 days

**Thai SME Calibration:**
- **Critical**: Balance < 0 OR Coverage < 10 days ← More sensitive
- **Warning**: Coverage < 21 days ← More sensitive
- **Informational**: Coverage < 45 days ← More sensitive

**Rationale**: Thai SMEs need more cash buffer due to volatility

---

## Implementation Strategy

### Option 1: Configuration File (Recommended)
Create `core/sme-os/config/thai-sme-thresholds.ts` with calibrated values.

### Option 2: Environment-Based
Use environment variable `THAI_SME_MODE=true` to apply calibrated thresholds.

### Option 3: Business Context Parameter
Add `businessContext: { region: 'thailand', businessSize: 'sme' }` to InputContract.

---

## Calibration Summary

**Overall Approach**: Make thresholds 10-20% more sensitive across all alerts

**Key Adjustments**:
- Cash/Liquidity alerts: 20-30% more sensitive
- Revenue alerts: 15-20% more sensitive
- Cost/Margin alerts: 10-15% more sensitive
- Utilization alerts: 10-15% more sensitive

**Rationale**: Thai SMEs operate with:
- Thinner margins
- Lower cash reserves
- Higher volatility
- Strong seasonality

---

## Next Steps

1. Create threshold configuration file
2. Update alert rules to use configurable thresholds
3. Add business context to InputContract
4. Test calibrated thresholds with Thai SME data
5. Validate alert frequency and accuracy

---

**Note**: This calibration is based on general Thai SME characteristics.  
Fine-tuning may be needed based on actual usage data.
