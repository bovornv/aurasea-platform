# Contract Shape Proposals

## inputs.ts Contract Shape

### Core Structure
```
InputContract {
  // Time Context
  timePeriod: {
    start: Date
    end: Date
    granularity: 'day' | 'week' | 'month'
  }
  
  // Financial Data
  financial: {
    cashFlows: Array<{
      amount: number
      direction: 'inflow' | 'outflow'
      date: Date
      category: string  // generic category, not vertical-specific
    }>
    currentBalance: number
    projectedBalance: number
  }
  
  // Operational Data
  operational: {
    resources: Array<{
      type: string  // generic resource type
      capacity: number
      utilization: number
      timePeriod: DateRange
    }>
    constraints: Array<{
      type: string
      limit: number
      appliesTo: string
    }>
  }
  
  // Historical Context
  historical: {
    patterns: Array<{
      metric: string
      values: Array<{ date: Date, value: number }>
      trend: 'increasing' | 'decreasing' | 'stable' | 'volatile'
    }>
  }
  
  // Decision Context
  context: {
    businessMaturity: 'early' | 'growth' | 'mature'
    marketConditions: 'favorable' | 'neutral' | 'challenging'
    previousDecisions: Array<{
      decisionId: string
      timestamp: Date
      outcome: 'positive' | 'neutral' | 'negative'
    }>
  }
}
```

### Key Principles
- All fields are generic (no hospitality/retail terms)
- Time-bound (everything has temporal context)
- Quantitative (primarily numbers)
- Normalized (standardized formats)

## outputs.ts Contract Shape

### Core Structure
```
OutputContract {
  // Evaluation Results
  evaluation: {
    scenarioId: string
    timestamp: Date
    confidence: number  // 0-1 scale
    dataQuality: number  // 0-1 scale
    modelCertainty: number  // 0-1 scale
  }
  
  // Alerts (if any)
  alerts: Array<AlertContract>
  
  // Explanations
  explanation: {
    reasoning: string  // generic explanation
    contributingFactors: Array<{
      factor: string
      impact: 'high' | 'medium' | 'low'
      direction: 'positive' | 'negative'
    }>
    context: string
    implications: string
  }
  
  // Recommendations (optional, non-prescriptive)
  recommendations: Array<{
    type: 'consider' | 'monitor' | 'review'
    description: string  // generic description
    timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term'
    tradeoffs: {
      benefits: Array<string>
      costs: Array<string>
    }
  }>
}
```

### Key Principles
- Non-prescriptive (suggests, doesn't command)
- Generic language (no vertical terms)
- Authoritative tone (calm, conservative)
- Sparse output (only when meaningful)

## alerts.ts Contract Shape

### Core Structure
```
AlertContract {
  // Identification
  id: string
  timestamp: Date
  
  // Classification
  type: 'risk' | 'opportunity' | 'anomaly' | 'threshold'
  severity: 'critical' | 'warning' | 'informational'
  domain: 'cash' | 'risk' | 'labor' | 'forecast'
  
  // Temporal Context
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term'
  relevanceWindow: {
    start: Date
    end: Date
  }
  
  // Content
  message: string  // generic explanation
  confidence: number  // 0-1 scale
  
  // Context
  contributingFactors: Array<{
    factor: string
    weight: number
  }>
  conditions: Array<string>  // conditions that apply
  
  // Metadata
  relatedAlerts: Array<string>  // IDs of related alerts
  decisionHistory: Array<{
    decisionId: string
    timestamp: Date
  }>
}
```

### Alert Types

**Risk Alerts**
- Cash flow risk (low balance, negative trend)
- Operational risk (capacity constraints, resource shortages)
- Market risk (external factors affecting business)

**Opportunity Alerts**
- Favorable conditions detected
- Potential improvements identified
- Positive trends emerging

**Anomaly Alerts**
- Unexpected patterns detected
- Data inconsistencies
- Outlier events

**Threshold Alerts**
- Predefined thresholds crossed
- Boundary conditions reached
- Limit warnings

### Key Principles
- Informational (not prescriptive)
- Context-rich (enough info to understand)
- Non-intrusive (doesn't interrupt unnecessarily)
- Actionable (user can decide what to do)
