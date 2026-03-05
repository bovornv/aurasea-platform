# Alert Implementation Status

## Currently Implemented (7 alerts)

### ✅ 1. Cash Runway Alert (`cash-runway.ts`)
- **Type**: Risk
- **Domain**: Cash
- **Purpose**: Detects when cash balance is insufficient for projected expenses
- **Status**: ✅ Implemented
- **File**: `core/sme-os/engine/rules/cash-runway.ts`

### ✅ 2. Demand Drop Alert (`demand-drop.ts`)
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects significant drops in revenue/bookings/demand vs baseline
- **Status**: ✅ Implemented
- **File**: `core/sme-os/engine/rules/demand-drop.ts`

### ✅ 3. Cost Pressure Alert (`cost-pressure.ts`)
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects when operating costs rise faster than revenue or staffing increases without demand growth
- **Status**: ✅ Implemented
- **File**: `core/sme-os/engine/rules/cost-pressure.ts`

### ✅ 4. Margin Compression Alert (`margin-compression.ts`)
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects shrinking profit margins despite stable revenue
- **Status**: ✅ Implemented
- **File**: `core/sme-os/engine/rules/margin-compression.ts`

### ✅ 5. Seasonal Mismatch Alert (`seasonal-mismatch.ts`)
- **Type**: Anomaly
- **Domain**: Risk
- **Purpose**: Compares current demand trends to same period last year (Thailand-specific seasonality)
- **Status**: ✅ Implemented
- **File**: `core/sme-os/engine/rules/seasonal-mismatch.ts`

### ✅ 6. Data Confidence Risk Alert (`data-confidence-risk.ts`)
- **Type**: Threshold
- **Domain**: Risk
- **Purpose**: Triggers when confidence falls below threshold or data freshness degrades
- **Status**: ✅ Implemented
- **File**: `core/sme-os/engine/rules/data-confidence-risk.ts`

### ✅ 7. Weekend-Weekday Imbalance Alert (`weekend-weekday-imbalance.ts`)
- **Type**: Opportunity
- **Domain**: Forecast
- **Purpose**: Detects revenue opportunities for hotels/resorts with strong weekend but weak weekday occupancy
- **Status**: ✅ Implemented (Paid Feature)
- **File**: `core/sme-os/engine/rules/weekend-weekday-imbalance.ts`

---

## Potential Additional Alerts (Not Yet Implemented)

### 🔲 8. Revenue Concentration Risk Alert
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects over-reliance on a single revenue source or customer segment
- **Triggers**: 
  - Single revenue source > 70% of total revenue
  - Top 3 customers > 50% of revenue
- **Severity**: Warning/Informational
- **Confidence**: 0.65-0.75
- **File**: `core/sme-os/engine/rules/revenue-concentration.ts`

### 🔲 9. Capacity Utilization Alert
- **Type**: Risk/Opportunity
- **Domain**: Risk/Forecast
- **Purpose**: Detects underutilized capacity (opportunity) or overcapacity (risk)
- **Triggers**:
  - Occupancy rate consistently < 40% (opportunity)
  - Occupancy rate consistently > 95% (risk - potential burnout)
- **Severity**: Warning/Informational
- **Confidence**: 0.70-0.80
- **File**: `core/sme-os/engine/rules/capacity-utilization.ts`

### 🔲 10. Payment Terms Risk Alert
- **Type**: Risk
- **Domain**: Cash
- **Purpose**: Detects when accounts receivable aging exceeds thresholds
- **Triggers**:
  - Average payment terms > 45 days
  - >30% of receivables > 60 days old
- **Severity**: Warning/Critical
- **Confidence**: 0.75-0.85
- **File**: `core/sme-os/engine/rules/payment-terms-risk.ts`
- **Note**: Requires AR data in OperationalSignal

### 🔲 11. Staff Turnover Alert
- **Type**: Risk
- **Domain**: Labor
- **Purpose**: Detects high staff turnover or staffing instability
- **Triggers**:
  - Staff count changes >20% month-over-month
  - Multiple rapid staff changes
- **Severity**: Warning/Informational
- **Confidence**: 0.65-0.75
- **File**: `core/sme-os/engine/rules/staff-turnover.ts`
- **Note**: Requires historical staff count tracking

### 🔲 12. Price Sensitivity Alert
- **Type**: Risk/Opportunity
- **Domain**: Forecast
- **Purpose**: Detects when pricing changes correlate with demand changes
- **Triggers**:
  - Price increase >10% with demand drop >15%
  - Price decrease >10% with demand increase <5%
- **Severity**: Warning/Informational
- **Confidence**: 0.60-0.70
- **File**: `core/sme-os/engine/rules/price-sensitivity.ts`
- **Note**: Requires pricing data in OperationalSignal

### 🔲 13. Peak Season Preparation Alert
- **Type**: Opportunity
- **Domain**: Forecast
- **Purpose**: Early warning for upcoming peak seasons (Thailand-specific)
- **Triggers**:
  - 30-60 days before known peak season (Nov-Feb for resorts)
  - Current capacity/utilization below historical peak levels
- **Severity**: Informational
- **Confidence**: 0.80-0.90
- **File**: `core/sme-os/engine/rules/peak-season-prep.ts`

### 🔲 14. Fixed Cost Ratio Alert
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects when fixed costs become too high relative to revenue
- **Triggers**:
  - Fixed costs > 60% of revenue (warning)
  - Fixed costs > 75% of revenue (critical)
- **Severity**: Warning/Critical
- **Confidence**: 0.70-0.80
- **File**: `core/sme-os/engine/rules/fixed-cost-ratio.ts`

### 🔲 15. Revenue Growth Rate Alert
- **Type**: Risk/Opportunity
- **Domain**: Forecast
- **Purpose**: Detects declining growth rates or accelerating growth
- **Triggers**:
  - Revenue growth rate declining for 2+ consecutive periods (risk)
  - Revenue growth rate accelerating (opportunity)
- **Severity**: Warning/Informational
- **Confidence**: 0.65-0.75
- **File**: `core/sme-os/engine/rules/revenue-growth-rate.ts`

### 🔲 16. Break-Even Analysis Alert
- **Type**: Risk
- **Domain**: Cash
- **Purpose**: Detects when business is approaching or below break-even point
- **Triggers**:
  - Revenue approaching break-even threshold (<10% margin)
  - Revenue below break-even for 2+ consecutive periods
- **Severity**: Critical/Warning
- **Confidence**: 0.75-0.85
- **File**: `core/sme-os/engine/rules/break-even-analysis.ts`

### 🔲 17. Customer Acquisition Cost Alert
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects when customer acquisition costs are rising relative to customer lifetime value
- **Triggers**:
  - CAC increasing >20% while revenue per customer stable/declining
  - CAC > 30% of average customer value
- **Severity**: Warning/Informational
- **Confidence**: 0.60-0.70
- **File**: `core/sme-os/engine/rules/customer-acquisition-cost.ts`
- **Note**: Requires marketing spend and customer metrics

### 🔲 18. Inventory Turnover Alert (for restaurants/cafés)
- **Type**: Risk
- **Domain**: Risk
- **Purpose**: Detects slow-moving inventory or stockouts
- **Triggers**:
  - Inventory turnover < 12x per year (slow-moving)
  - Frequent stockouts detected
- **Severity**: Warning/Informational
- **Confidence**: 0.65-0.75
- **File**: `core/sme-os/engine/rules/inventory-turnover.ts`
- **Note**: Requires inventory data

---

## Implementation Checklist Template

For each alert to implement:

- [ ] Create rule file: `core/sme-os/engine/rules/{alert-name}.ts`
- [ ] Implement `evaluate()` method that returns `AlertContract | null`
- [ ] Add rule instantiation in `monitoring-service.ts`
- [ ] Call rule evaluation in `monitoring-service.evaluate()`
- [ ] Add translations in `hospitality-adapter.ts` (en/th)
- [ ] Update alert categorization logic if needed
- [ ] Test with mock data
- [ ] Update UI to display new alert type (if needed)
- [ ] Document alert in this file

---

## Alert Rule Template

```typescript
// core/sme-os/engine/rules/{alert-name}.ts
import type { InputContract } from '../../contracts/inputs';
import type { AlertContract } from '../../contracts/alerts';
import type { OperationalSignal } from '../../../apps/hospitality-ai/app/services/operational-signals-service';

export class {AlertName}Rule {
  evaluate(
    input: InputContract,
    operationalSignals: OperationalSignal[],
    businessType?: 'cafe' | 'restaurant' | 'hotel' | 'resort'
  ): AlertContract | null {
    // Implementation
    // Return AlertContract or null if no alert
  }
}
```

---

## Integration Points

1. **Monitoring Service** (`apps/hospitality-ai/app/services/monitoring-service.ts`)
   - Add rule instance as private member
   - Call `evaluate()` in `evaluate()` method
   - Collect alerts into `trendAlerts` array

2. **Hospitality Adapter** (`apps/hospitality-ai/app/adapters/hospitality-adapter.ts`)
   - Add alert ID/message patterns to translation maps
   - Add category mapping if needed
   - Add title/context translations (en/th)

3. **UI Components**
   - Alerts page automatically shows new alerts
   - Alert detail page handles new alert types generically
   - May need badge/color updates for new alert types

---

## Priority Recommendations

**High Priority** (Most valuable for hospitality owners):
1. Revenue Concentration Risk (#8)
2. Capacity Utilization (#9)
3. Peak Season Preparation (#13)
4. Fixed Cost Ratio (#14)

**Medium Priority**:
5. Break-Even Analysis (#16)
6. Revenue Growth Rate (#15)
7. Payment Terms Risk (#10) - if AR data available

**Lower Priority** (Requires additional data):
8. Staff Turnover (#11)
9. Price Sensitivity (#12)
10. Customer Acquisition Cost (#17)
11. Inventory Turnover (#18)
