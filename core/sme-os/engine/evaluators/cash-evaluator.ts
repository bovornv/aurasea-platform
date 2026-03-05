import { InputContract } from '../../contracts/inputs';
import { CashRunwayRule } from '../rules/cash-runway';

export interface CashEvaluation {
  confidence: number;
  historicalVariance: number;
  dataCompleteness: number;
  historicalSpan: number;
}

export class CashEvaluator {
  private rule: CashRunwayRule;

  constructor() {
    this.rule = new CashRunwayRule();
  }

  private calculateHistoricalVariance(input: InputContract): number {
    if (!input.financial?.cashFlows?.length) return 0;

    const today = new Date();
    const sixMonthsAgo = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
    
    // Get historical flows
    const historicalFlows = input.financial.cashFlows.filter(cf => 
      cf.date < today && cf.date >= sixMonthsAgo
    );

    if (historicalFlows.length === 0) return 0;

    // Calculate variance in daily net flows
    const dailyNetFlows = new Map<string, number>();
    
    historicalFlows.forEach(flow => {
      const dateKey = flow.date.toISOString().split('T')[0];
      const amount = flow.direction === 'inflow' ? flow.amount : -flow.amount;
      dailyNetFlows.set(dateKey, (dailyNetFlows.get(dateKey) || 0) + amount);
    });

    const values = Array.from(dailyNetFlows.values());
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance) / Math.abs(mean); // Coefficient of variation
  }

  private calculateHistoricalSpan(input: InputContract): number {
    if (!input.financial?.cashFlows?.length) return 0;

    const today = new Date();
    const oldestFlow = input.financial.cashFlows
      .reduce((oldest, flow) => flow.date < oldest ? flow.date : oldest, today);
    
    const daysDiff = (today.getTime() - oldestFlow.getTime()) / (24 * 60 * 60 * 1000);
    return daysDiff;
  }

  private calculateDataCompleteness(input: InputContract): number {
    let score = 100;

    // Check required fields
    if (!input.financial?.currentBalance) score -= 10;
    if (!input.financial?.cashFlows?.length) score -= 10;
    
    // Check historical data
    const historicalSpan = this.calculateHistoricalSpan(input);
    if (historicalSpan < 180) score -= 5; // Less than 6 months history
    
    return Math.max(0, score);
  }

  evaluate(input: InputContract): { alert: ReturnType<CashRunwayRule['evaluate']>, evaluation: CashEvaluation } {
    const alert = this.rule.evaluate(input);
    
    // Calculate confidence components
    const dataCompleteness = this.calculateDataCompleteness(input);
    const historicalSpan = this.calculateHistoricalSpan(input);
    const historicalVariance = this.calculateHistoricalVariance(input);

    // Calculate final confidence
    let confidence = dataCompleteness;
    if (historicalSpan < 180) confidence -= 5;
    if (historicalVariance > 0.5) confidence -= 5; // High variance penalty

    const evaluation: CashEvaluation = {
      confidence: Math.max(0, confidence) / 100,
      historicalVariance,
      dataCompleteness: dataCompleteness / 100,
      historicalSpan
    };

    return { alert, evaluation };
  }
}
