# Cash Runway Risk Alert - Contract Specification

## Input Contract Requirements

### Minimum Required Inputs
```typescript
{
  financial: {
    currentBalance: number;        // REQUIRED
    projectedBalance: number;      // REQUIRED (or calculated from cashFlows)
    cashFlows: CashFlow[];         // REQUIRED (at least 7 days of data)
  },
  timePeriod: {
    start: Date;                   // REQUIRED
    end: Date;                     // REQUIRED
    granularity: 'day';            // REQUIRED
  }
}
```

### Optional but Recommended Inputs
```typescript
{
  historical: {
    patterns: [{
      metric: "cash_balance",
      values: Array<{ date: Date, value: number }>,
      trend: 'decreasing' | 'increasing' | 'stable' | 'volatile'
    }]
  },
  context: {
    businessMaturity: 'early' | 'growth' | 'mature';
    marketConditions: 'favorable' | 'neutral' | 'challenging';
  }
}
```

## Output Contract Shape

### Alert Output
```typescript
{
  id: string;                      // Format: "cash-runway-{timestamp}-{sequence}"
  timestamp: Date;
  type: 'risk';
  severity: 'critical' | 'warning' | 'informational';
  domain: 'cash';
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term';
  
  message: string;                 // Generic message, no vertical terms
  confidence: number;              // 0.0 to 1.0
  
  relevanceWindow: {
    start: Date;
    end: Date;
  };
  
  contributingFactors: Array<{
    factor: string;                 // Generic factor name
    weight: number;                 // 0.0 to 1.0
  }>;
  
  conditions: string[];             // Array of condition strings
}
```

## Rule Definitions

### Rule 1: Critical Threshold Calculation
```
IF businessMaturity === 'early':
  threshold = averageMonthlyExpenses (from cashFlows)
ELSE IF businessMaturity === 'mature':
  threshold = averageMonthlyExpenses * 0.5
ELSE:
  threshold = 0
```

### Rule 2: Severity Classification
```
IF (projectedBalance < 0 AND daysToThreshold <= 7) 
   OR (projectedBalance < threshold AND declineRate > 20% per week):
  severity = 'critical'
  
ELSE IF (projectedBalance < threshold AND daysToThreshold <= 30)
   OR (projectedBalance < threshold * 2 AND declineRate between 10-20% per week):
  severity = 'warning'
  
ELSE IF (projectedBalance < threshold * 3 AND daysToThreshold <= 60)
   OR (declineRate > 0 AND declineRate < 10% per week):
  severity = 'informational'
```

### Rule 3: Time Horizon Assignment
```
IF daysToThreshold <= 7:
  timeHorizon = 'immediate'
ELSE IF daysToThreshold <= 30:
  timeHorizon = 'near-term'
ELSE IF daysToThreshold <= 90:
  timeHorizon = 'medium-term'
ELSE:
  timeHorizon = 'long-term'
```

### Rule 4: Confidence Calculation
```
confidence = (
  dataQualityScore * 0.4 +      // Based on historical data availability
  patternConsistencyScore * 0.4 + // Based on variance in cash flows
  projectionReliabilityScore * 0.2  // Based on time horizon
)

WHERE:
  dataQualityScore = min(1.0, historicalDataPoints / 30)
  patternConsistencyScore = 1.0 - (variance / mean)
  projectionReliabilityScore = 1.0 - (daysToThreshold / 90)
```

## Contributing Factors Identification

### Factor 1: Negative Cash Flow Trend
```
IF averageWeeklyOutflows > averageWeeklyInflows:
  factor = "Negative cash flow trend"
  weight = min(1.0, (outflows - inflows) / outflows)
```

### Factor 2: Large Scheduled Outflows
```
IF sumOfUpcomingOutflows > currentBalance * 0.3:
  factor = "Large scheduled outflows"
  weight = min(1.0, sumOfUpcomingOutflows / currentBalance)
```

### Factor 3: Reduced Revenue Inflows
```
IF averageWeeklyInflows < historicalAverage * 0.7:
  factor = "Reduced revenue inflows"
  weight = 1.0 - (averageWeeklyInflows / historicalAverage)
```

## Translation Mapping (Hospitality AI)

### Domain Translation
```
SME OS Domain: "cash"
→ Hospitality Category: "cash" (same, but with Thai context)
```

### Severity Translation
```
SME OS: "critical"
→ Thai: "ระดับวิกฤต"
→ English: "Critical"

SME OS: "warning"
→ Thai: "คำเตือน"
→ English: "Warning"

SME OS: "informational"
→ Thai: "ข้อมูล"
→ English: "Informational"
```

### Message Translation Template
```
Generic: "Projected cash balance will fall below critical threshold within {days} days"
→ Thai: "ยอดเงินสดคาดการณ์จะต่ำกว่าระดับวิกฤตภายใน {days} วัน"
→ English: "Projected cash balance will fall below critical threshold within {days} days"
```

### Contributing Factors Translation
```
Generic: "Negative cash flow trend"
→ Thai: "แนวโน้มกระแสเงินสดติดลบ"
→ English: "Negative cash flow trend"

Generic: "Large scheduled outflows"
→ Thai: "รายจ่ายที่วางแผนไว้จำนวนมาก"
→ English: "Large scheduled expenses"

Generic: "Reduced revenue inflows"
→ Thai: "รายได้ที่ลดลง"
→ English: "Reduced revenue"
```

## Example: Full Flow

### Input (from Hospitality AI via Adapter)
```json
{
  "financial": {
    "currentBalance": 50000,
    "projectedBalance": -15000,
    "cashFlows": [
      { "amount": 3000, "direction": "inflow", "date": "2024-01-24", "category": "revenue" },
      { "amount": -10000, "direction": "outflow", "date": "2024-01-25", "category": "operational_expense" }
    ]
  },
  "timePeriod": {
    "start": "2024-01-24",
    "end": "2024-01-31",
    "granularity": "day"
  }
}
```

### SME OS Output (Generic)
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
    { "factor": "Negative cash flow trend", "weight": 0.7 },
    { "factor": "Large scheduled outflows", "weight": 0.5 },
    { "factor": "Reduced revenue inflows", "weight": 0.4 }
  ],
  "conditions": [
    "Current balance: 50000",
    "Projected balance in 7 days: -15000",
    "Average weekly cash burn: 10000",
    "No significant inflows scheduled"
  ]
}
```

### Hospitality AI Translation (Thai-first)
```json
{
  "id": "cash-runway-20240124-001",
  "timestamp": "2024-01-24T10:00:00Z",
  "type": "risk",
  "severity": "critical",
  "category": "cash",
  "timeHorizon": "immediate",
  "title": "การแจ้งเตือนกระแสเงินสด - ระดับวิกฤต",
  "message": "ยอดเงินสดคาดการณ์จะต่ำกว่าระดับวิกฤตภายใน 7 วัน ตามรูปแบบกระแสเงินสดปัจจุบัน",
  "context": "การแจ้งเตือนกระแสเงินสด: ยอดเงินสดคาดการณ์จะต่ำกว่าระดับวิกฤตภายใน 7 วัน สาเหตุหลักมาจาก: (1) แนวโน้มกระแสเงินสดติดลบ (2) รายจ่ายที่วางแผนไว้จำนวนมาก และ (3) รายได้ที่ลดลง",
  "confidence": 0.85,
  "contributingFactors": [
    { "factor": "แนวโน้มกระแสเงินสดติดลบ", "weight": 0.7 },
    { "factor": "รายจ่ายที่วางแผนไว้จำนวนมาก", "weight": 0.5 },
    { "factor": "รายได้ที่ลดลง", "weight": 0.4 }
  ]
}
```
