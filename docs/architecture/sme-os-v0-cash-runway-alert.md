# SME OS v0: Cash Runway Risk Alert Design

## Objective
Design a rule-based alert system that detects when a business is at risk of running out of cash within a specified time horizon.

## Alert Selection
**Cash Runway Risk** - Detects when projected cash balance will fall below a critical threshold.

---

## 1. Required Normalized Inputs

### Financial Inputs
```
financial: {
  currentBalance: number          // Current cash balance
  projectedBalance: number         // Projected balance at end of time period
  cashFlows: Array<{
    amount: number                 // Positive for inflow, negative for outflow
    direction: 'inflow' | 'outflow'
    date: Date
    category: string               // Generic category (e.g., "revenue", "operational_expense")
  }>
}
```

### Time Context
```
timePeriod: {
  start: Date
  end: Date
  granularity: 'day' | 'week' | 'month'
}
```

### Historical Context (Optional but Recommended)
```
historical: {
  patterns: Array<{
    metric: string                 // e.g., "cash_balance"
    values: Array<{ date: Date, value: number }>
    trend: 'increasing' | 'decreasing' | 'stable' | 'volatile'
  }>
}
```

### Business Context
```
context: {
  businessMaturity: 'early' | 'growth' | 'mature'
  marketConditions: 'favorable' | 'neutral' | 'challenging'
}
```

---

## 2. Decision Rules (Plain Language)

### Rule 1: Critical Threshold Detection
**IF** projected balance at end of time period < critical threshold (e.g., 0 or negative)
**THEN** generate alert

**Critical Threshold Calculation:**
- Base threshold: 0 (zero balance)
- For early-stage businesses: threshold = 1 month of average monthly expenses
- For mature businesses: threshold = 2 weeks of average monthly expenses

### Rule 2: Severity Classification

**Critical Severity:**
- Projected balance < 0 within 7 days
- OR projected balance < critical threshold AND trend is decreasing rapidly (rate of decline > 20% per week)

**Warning Severity:**
- Projected balance < critical threshold within 14-30 days
- OR projected balance < 2x critical threshold AND trend is decreasing (rate of decline 10-20% per week)

**Informational Severity:**
- Projected balance < 3x critical threshold within 30-60 days
- OR trend shows decreasing pattern but not yet critical

### Rule 3: Time Horizon Assignment

**Immediate:**
- Risk materializes within 0-7 days

**Near-term:**
- Risk materializes within 8-30 days

**Medium-term:**
- Risk materializes within 31-90 days

**Long-term:**
- Risk materializes beyond 90 days

### Rule 4: Confidence Calculation

**High Confidence (0.8-1.0):**
- Historical data shows consistent patterns
- Cash flow projections based on recent actuals (last 30 days)
- Low variance in historical cash flows

**Medium Confidence (0.5-0.8):**
- Some historical data available but patterns are variable
- Cash flow projections include some estimates
- Moderate variance in historical cash flows

**Low Confidence (0.3-0.5):**
- Limited historical data
- Cash flow projections heavily estimated
- High variance in historical cash flows

**Very Low Confidence (<0.3):**
- Insufficient data for reliable projection
- Alert generated but marked as low confidence

### Rule 5: Contributing Factors Identification

Identify factors contributing to the risk:
1. **Negative cash flow trend** - Outflows exceed inflows
2. **Large upcoming outflows** - Significant expenses scheduled
3. **Reduced inflows** - Revenue decline or delayed payments
4. **Historical pattern** - Past behavior indicates risk
5. **Market conditions** - External factors affecting cash position

---

## 3. Alert Output Shape

### Alert Structure
```typescript
{
  id: string                    // Unique alert identifier
  timestamp: Date               // When alert was generated
  type: 'risk'                  // Alert type
  severity: 'critical' | 'warning' | 'informational'
  domain: 'cash'                // Domain this alert belongs to
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term'
  
  // Core alert data
  message: string               // Generic explanation (no vertical terms)
  confidence: number            // 0-1 scale
  
  // Temporal context
  relevanceWindow: {
    start: Date                 // When risk period begins
    end: Date                   // When risk period ends
  }
  
  // Explanation (causal chain)
  contributingFactors: Array<{
    factor: string              // Generic factor name
    weight: number              // 0-1, how much this contributes
  }>
  
  conditions: string[]          // Conditions that apply
  
  // Metadata
  relatedAlerts?: string[]     // IDs of related alerts
}
```

### Example Alert Output (Generic)
```json
{
  "id": "cash-runway-20240124-001",
  "timestamp": "2024-01-24T10:00:00Z",
  "type": "risk",
  "severity": "critical",
  "domain": "cash",
  "timeHorizon": "immediate",
  "message": "Projected cash balance will fall below critical threshold within 7 days based on current cash flow patterns",
  "confidence": 0.85,
  "relevanceWindow": {
    "start": "2024-01-24T00:00:00Z",
    "end": "2024-01-31T00:00:00Z"
  },
  "contributingFactors": [
    {
      "factor": "Negative cash flow trend",
      "weight": 0.7
    },
    {
      "factor": "Large scheduled outflows",
      "weight": 0.5
    },
    {
      "factor": "Reduced revenue inflows",
      "weight": 0.4
    }
  ],
  "conditions": [
    "Current balance: 50000",
    "Projected balance in 7 days: -15000",
    "Average weekly cash burn: 10000",
    "No significant inflows scheduled"
  ]
}
```

---

## 4. Explanation (Causal Chain)

The alert explanation follows this causal chain:

1. **Current State**: Current cash balance and position
2. **Trend Analysis**: Direction and rate of cash flow change
3. **Projection**: Where cash balance is heading based on patterns
4. **Threshold Comparison**: How projection compares to critical threshold
5. **Time to Threshold**: When threshold will be crossed
6. **Contributing Factors**: What's driving the risk
7. **Confidence Level**: How certain we are about the projection

**Example Explanation (Generic):**
```
Current cash balance is 50,000. Analysis of cash flows over the past 30 days 
shows a consistent negative trend with average weekly outflows of 10,000 
exceeding average weekly inflows of 3,000. Projecting this pattern forward, 
cash balance will reach -15,000 within 7 days, falling below the critical 
threshold of 0. This risk is primarily driven by: (1) negative cash flow 
trend (70% contribution), (2) large scheduled outflows (50% contribution), 
and (3) reduced revenue inflows (40% contribution). Confidence in this 
projection is 85% based on consistent historical patterns.
```

---

## 5. Hospitality AI Translation

### Translation Process

**Step 1: Domain Mapping**
- Generic "cash" domain → Hospitality "cash flow" or "financial position"

**Step 2: Message Translation**

**Generic Message:**
> "Projected cash balance will fall below critical threshold within 7 days based on current cash flow patterns"

**Thai Translation (Primary):**
> "ยอดเงินสดคาดการณ์จะต่ำกว่าระดับวิกฤตภายใน 7 วัน ตามรูปแบบกระแสเงินสดปัจจุบัน"

**English Translation (Fallback):**
> "Projected cash balance will fall below critical threshold within 7 days based on current cash flow patterns"

**Step 3: Contributing Factors Translation**

**Generic Factor:** "Negative cash flow trend"
- **Thai:** "แนวโน้มกระแสเงินสดติดลบ"
- **English:** "Negative cash flow trend"

**Generic Factor:** "Large scheduled outflows"
- **Thai:** "รายจ่ายที่วางแผนไว้จำนวนมาก"
- **English:** "Large scheduled expenses"

**Generic Factor:** "Reduced revenue inflows"
- **Thai:** "รายได้ที่ลดลง"
- **English:** "Reduced revenue"

**Step 4: Context Addition**

Hospitality AI adds hospitality-specific context without changing the core message:

**Thai Example:**
```
"การแจ้งเตือนกระแสเงินสด: ยอดเงินสดคาดการณ์จะต่ำกว่าระดับวิกฤตภายใน 7 วัน 
ตามรูปแบบกระแสเงินสดปัจจุบัน สาเหตุหลักมาจาก: (1) แนวโน้มกระแสเงินสดติดลบ 
(2) รายจ่ายที่วางแผนไว้จำนวนมาก และ (3) รายได้ที่ลดลง"
```

**English Example:**
```
"Cash Flow Alert: Projected cash balance will fall below critical threshold 
within 7 days based on current cash flow patterns. Primary causes: 
(1) Negative cash flow trend, (2) Large scheduled expenses, and 
(3) Reduced revenue"
```

**Step 5: Alert Title Generation**

**Generic:** Uses domain + severity
**Hospitality Thai:** "การแจ้งเตือนกระแสเงินสด - ระดับวิกฤต"
**Hospitality English:** "Cash Flow Alert - Critical"

---

## 6. Rule-Based Logic Flow

```
1. RECEIVE INPUTS
   ├─ financial.currentBalance
   ├─ financial.projectedBalance
   ├─ financial.cashFlows[]
   └─ timePeriod

2. CALCULATE CRITICAL THRESHOLD
   ├─ IF businessMaturity === 'early': threshold = avgMonthlyExpenses
   ├─ IF businessMaturity === 'mature': threshold = avgMonthlyExpenses * 0.5
   └─ DEFAULT: threshold = 0

3. ANALYZE TREND
   ├─ Calculate rate of change from historical patterns
   ├─ Identify if trend is decreasing
   └─ Calculate rate of decline (% per week)

4. PROJECT FUTURE BALANCE
   ├─ Use current balance as starting point
   ├─ Apply cash flow patterns forward
   └─ Calculate when balance crosses threshold

5. DETERMINE SEVERITY
   ├─ IF projectedBalance < 0 AND daysToThreshold <= 7: CRITICAL
   ├─ IF projectedBalance < threshold AND daysToThreshold <= 30: WARNING
   └─ ELSE IF trend decreasing: INFORMATIONAL

6. CALCULATE CONFIDENCE
   ├─ Assess data quality (historical data availability)
   ├─ Assess pattern consistency (variance in cash flows)
   └─ Calculate confidence score (0-1)

7. IDENTIFY CONTRIBUTING FACTORS
   ├─ Analyze cash flow components
   ├─ Identify negative contributors
   └─ Weight each factor by impact

8. GENERATE ALERT
   ├─ Create alert with all calculated values
   ├─ Generate generic explanation
   └─ Return to Hospitality AI for translation
```

---

## 7. Boundary Enforcement

### SME OS Must NOT:
- ❌ Use terms like "hotel", "restaurant", "room revenue", "occupancy"
- ❌ Reference hospitality-specific metrics (ADR, RevPAR)
- ❌ Assume hospitality business model
- ❌ Include UI or presentation logic

### SME OS Must:
- ✅ Use generic terms: "cash", "balance", "inflow", "outflow"
- ✅ Work with normalized, abstract data
- ✅ Generate explainable, rule-based alerts
- ✅ Provide clear causal chains

### Hospitality AI Must:
- ✅ Translate generic alerts to hospitality language
- ✅ Add hospitality context (Thai-first)
- ✅ Present alerts in user-friendly format
- ✅ NOT modify alert logic or severity

---

## 8. Example Scenarios

### Scenario A: Critical Cash Runway Risk
**Input:**
- Current balance: 50,000
- Projected balance (7 days): -15,000
- Weekly cash burn: 10,000
- Weekly revenue: 3,000

**SME OS Output:**
- Severity: CRITICAL
- Time horizon: IMMEDIATE
- Confidence: 0.85
- Message: "Projected cash balance will fall below critical threshold within 7 days"

**Hospitality AI Translation (Thai):**
- Title: "การแจ้งเตือนกระแสเงินสด - ระดับวิกฤต"
- Message: "ยอดเงินสดคาดการณ์จะต่ำกว่าระดับวิกฤตภายใน 7 วัน"

### Scenario B: Warning Cash Runway Risk
**Input:**
- Current balance: 100,000
- Projected balance (21 days): 5,000
- Weekly cash burn: 8,000
- Weekly revenue: 6,000

**SME OS Output:**
- Severity: WARNING
- Time horizon: NEAR-TERM
- Confidence: 0.75
- Message: "Projected cash balance approaching critical threshold within 21 days"

**Hospitality AI Translation (Thai):**
- Title: "การแจ้งเตือนกระแสเงินสด - คำเตือน"
- Message: "ยอดเงินสดคาดการณ์จะเข้าใกล้ระดับวิกฤตภายใน 21 วัน"

---

## Summary

This design provides:
1. ✅ Clear rule-based logic (no ML)
2. ✅ Fully explainable decisions
3. ✅ Abstract, generic outputs
4. ✅ No hospitality terminology in SME OS
5. ✅ Clear translation path to hospitality language
6. ✅ Causal chain explanation
7. ✅ Confidence scoring
8. ✅ Time horizon classification
