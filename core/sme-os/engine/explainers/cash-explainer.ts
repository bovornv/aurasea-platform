import { AlertContract } from '../../contracts/alerts';
import { CashEvaluation } from '../evaluators/cash-evaluator';

interface CashExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  dataQuality: {
    completeness: string;
    historicalCoverage: string;
    variance: string;
  };
}

interface AlertWithPositions extends AlertContract {
  positions?: Array<{ date: Date; balance: number; daysOfCoverage: number }>;
}

export class CashExplainer {
  explain(alert: AlertContract | null, evaluation: CashEvaluation): CashExplanation {
    if (!alert) {
      return {
        primaryFactor: 'Insufficient data to generate alert',
        contributingFactors: [],
        dataQuality: this.explainDataQuality(evaluation)
      };
    }

    const alertWithPositions = alert as AlertWithPositions;
    const positions = alertWithPositions.positions || [];
    
    // Find the critical points in the cash position
    if (positions.length === 0) {
      return {
        primaryFactor: 'Alert generated but position data unavailable',
        contributingFactors: [],
        dataQuality: this.explainDataQuality(evaluation)
      };
    }

    const lowestCoverage = Math.min(...positions.map(p => p.daysOfCoverage));
    const lowestBalance = Math.min(...positions.map(p => p.balance));
    const criticalDate = positions.find(p => p.daysOfCoverage === lowestCoverage)?.date;
    
    // Determine primary factor
    let primaryFactor = '';
    if (lowestBalance < 0) {
      primaryFactor = `Projected negative cash balance on ${criticalDate?.toISOString().split('T')[0]}`;
    } else if (lowestCoverage < 30) {
      primaryFactor = `Cash coverage drops below 30 days on ${criticalDate?.toISOString().split('T')[0]}`;
    } else if (lowestCoverage < 60) {
      primaryFactor = `Cash coverage drops below 60 days on ${criticalDate?.toISOString().split('T')[0]}`;
    } else {
      primaryFactor = 'Cash coverage remains above 60 days';
    }

    // Identify contributing factors
    const contributingFactors: string[] = [];
    
    // Analyze balance trend
    const balanceChange = positions[positions.length - 1].balance - positions[0].balance;
    if (balanceChange < 0) {
      contributingFactors.push(`Declining cash balance trend: ${Math.round(balanceChange)} over 30 days`);
    }

    // Analyze coverage trend
    const coverageChange = positions[positions.length - 1].daysOfCoverage - positions[0].daysOfCoverage;
    if (coverageChange < 0) {
      contributingFactors.push(`Declining coverage trend: ${Math.round(coverageChange)} days over period`);
    }

    // Historical pattern analysis
    if (evaluation.historicalVariance > 0.5) {
      contributingFactors.push('Unusual variance in historical cash flow patterns');
    }

    return {
      primaryFactor,
      contributingFactors,
      dataQuality: this.explainDataQuality(evaluation)
    };
  }

  private explainDataQuality(evaluation: CashEvaluation): {
    completeness: string;
    historicalCoverage: string;
    variance: string;
  } {
    return {
      completeness: `Data completeness: ${Math.round(evaluation.dataCompleteness * 100)}%`,
      historicalCoverage: `Historical data span: ${Math.round(evaluation.historicalSpan)} days`,
      variance: `Historical variance: ${evaluation.historicalVariance.toFixed(2)} coefficient`
    };
  }
}
