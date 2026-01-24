// Input contracts for vertical apps to send data to SME OS

export type TimeGranularity = 'day' | 'week' | 'month';

export interface TimePeriod {
  start: Date;
  end: Date;
  granularity: TimeGranularity;
}

export interface CashFlow {
  amount: number;
  direction: 'inflow' | 'outflow';
  date: Date;
  category: string; // generic category, not vertical-specific
}

export interface Resource {
  type: string; // generic resource type
  capacity: number;
  utilization: number;
  timePeriod: {
    start: Date;
    end: Date;
  };
}

export interface Constraint {
  type: string;
  limit: number;
  appliesTo: string;
}

export interface HistoricalPattern {
  metric: string;
  values: Array<{ date: Date; value: number }>;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
}

export interface PreviousDecision {
  decisionId: string;
  timestamp: Date;
  outcome: 'positive' | 'neutral' | 'negative';
}

export interface InputContract {
  timePeriod: TimePeriod;
  financial: {
    cashFlows: CashFlow[];
    currentBalance: number;
    projectedBalance: number;
  };
  operational: {
    resources: Resource[];
    constraints: Constraint[];
  };
  historical: {
    patterns: HistoricalPattern[];
  };
  context: {
    businessMaturity: 'early' | 'growth' | 'mature';
    marketConditions: 'favorable' | 'neutral' | 'challenging';
    previousDecisions: PreviousDecision[];
  };
}
