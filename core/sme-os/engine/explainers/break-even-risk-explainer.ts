import { AlertContract } from '../../contracts/alerts';

interface BreakEvenRiskExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  profitabilityAnalysis: {
    breakEvenAssessment: string;
    revenueGapAnalysis: string;
    riskLevel: string;
  };
  recommendations: {
    immediate: string[];
    strategic: string[];
  };
}

interface AlertWithMetrics extends AlertContract {
  metrics?: {
    breakEvenRatio: number;
    revenueGap: number;
    totalRevenue: number;
    totalExpenses: number;
  };
}

export class BreakEvenRiskExplainer {
  explain(alert: AlertContract | null, financialData?: Array<{
    timestamp: Date;
    dailyRevenue: number;
    dailyExpenses: number;
  }>): BreakEvenRiskExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No break-even risk detected or insufficient data',
        contributingFactors: [],
        profitabilityAnalysis: {
          breakEvenAssessment: 'No break-even analysis available',
          revenueGapAnalysis: 'No revenue gap analysis available',
          riskLevel: 'No risk assessment available'
        },
        recommendations: {
          immediate: [],
          strategic: []
        }
      };
    }

    const alertWithMetrics = alert as AlertWithMetrics;
    
    // Extract metrics from alert conditions or calculate from data
    let breakEvenRatio = 0;
    let revenueGap = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;

    if (alertWithMetrics.metrics) {
      breakEvenRatio = alertWithMetrics.metrics.breakEvenRatio;
      revenueGap = alertWithMetrics.metrics.revenueGap;
      totalRevenue = alertWithMetrics.metrics.totalRevenue;
      totalExpenses = alertWithMetrics.metrics.totalExpenses;
    } else if (financialData && financialData.length >= 30) {
      totalRevenue = financialData.reduce((sum, d) => sum + d.dailyRevenue, 0);
      totalExpenses = financialData.reduce((sum, d) => sum + d.dailyExpenses, 0);
      breakEvenRatio = totalExpenses > 0 ? totalRevenue / totalExpenses : 0;
      revenueGap = totalRevenue - totalExpenses;
    } else {
      // Extract from alert conditions
      breakEvenRatio = this.extractBreakEvenRatioFromConditions(alert);
      revenueGap = this.extractRevenueGapFromConditions(alert);
      totalRevenue = this.extractTotalRevenueFromConditions(alert);
      totalExpenses = this.extractTotalExpensesFromConditions(alert);
    }

    // Determine break-even type from alert
    const breakEvenType = this.detectBreakEvenTypeFromAlert(alert);

    // Generate primary factor explanation
    const primaryFactor = this.generatePrimaryFactor(
      breakEvenType,
      breakEvenRatio,
      revenueGap,
      alert.severity
    );

    // Generate contributing factors
    const contributingFactors = this.generateContributingFactors(
      breakEvenType,
      breakEvenRatio,
      revenueGap,
      totalRevenue,
      totalExpenses
    );

    // Generate profitability analysis
    const profitabilityAnalysis = this.analyzeProfitability(
      breakEvenRatio,
      revenueGap,
      alert.severity
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      breakEvenType,
      breakEvenRatio,
      alert.severity
    );

    return {
      primaryFactor,
      contributingFactors,
      profitabilityAnalysis,
      recommendations
    };
  }

  private extractBreakEvenRatioFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Break-even ratio:'));
    if (condition) {
      const match = condition.match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : 0;
    }
    return 0;
  }

  private extractRevenueGapFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Revenue gap:'));
    if (condition) {
      const match = condition.match(/\$([0-9,-]+)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    }
    return 0;
  }

  private extractTotalRevenueFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Total revenue:'));
    if (condition) {
      const match = condition.match(/\$([0-9,]+)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    }
    return 0;
  }

  private extractTotalExpensesFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Total expenses:'));
    if (condition) {
      const match = condition.match(/\$([0-9,]+)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    }
    return 0;
  }

  private detectBreakEvenTypeFromAlert(alert: AlertContract): string {
    const message = alert.message.toLowerCase();
    
    if (message.includes('critical') || alert.severity === 'critical') {
      return 'critical_break_even';
    } else if (message.includes('warning') || alert.severity === 'warning') {
      return 'warning_break_even';
    } else if (message.includes('moderate') || alert.severity === 'informational') {
      return 'moderate_break_even';
    }
    
    return 'general_break_even';
  }

  private generatePrimaryFactor(
    breakEvenType: string,
    breakEvenRatio: number,
    revenueGap: number,
    severity: string
  ): string {
    switch (breakEvenType) {
      case 'critical_break_even':
        return `Critical break-even risk: ${breakEvenRatio.toFixed(2)} ratio with $${revenueGap.toLocaleString()} gap indicates severe profitability crisis`;
      
      case 'warning_break_even':
        return `Warning break-even risk: ${breakEvenRatio.toFixed(2)} ratio approaching break-even threshold requires immediate attention`;
      
      case 'moderate_break_even':
        return `Moderate break-even risk: ${breakEvenRatio.toFixed(2)} ratio indicates narrow profitability margin`;
      
      default:
        return `Break-even risk detected: ${breakEvenRatio.toFixed(2)} ratio requires profitability monitoring`;
    }
  }

  private generateContributingFactors(
    breakEvenType: string,
    breakEvenRatio: number,
    revenueGap: number,
    totalRevenue: number,
    totalExpenses: number
  ): string[] {
    const factors: string[] = [];

    // Break-even ratio analysis
    if (breakEvenRatio < 0.9) {
      factors.push(`Critical profitability shortfall: ${breakEvenRatio.toFixed(2)} ratio indicates severe financial stress`);
    } else if (breakEvenRatio < 1.0) {
      factors.push(`Break-even threshold risk: ${breakEvenRatio.toFixed(2)} ratio indicates profitability concern`);
    } else {
      factors.push(`Narrow profit margin: ${breakEvenRatio.toFixed(2)} ratio provides limited financial buffer`);
    }

    // Revenue gap analysis
    if (revenueGap < 0) {
      factors.push(`Operating loss: $${Math.abs(revenueGap).toLocaleString()} negative gap requires immediate correction`);
    } else if (revenueGap < totalExpenses * 0.1) {
      factors.push(`Minimal profit buffer: $${revenueGap.toLocaleString()} gap provides limited protection against volatility`);
    }

    // Expense burden analysis
    if (totalExpenses > 0 && totalRevenue > 0) {
      const expenseRatio = totalExpenses / totalRevenue;
      if (expenseRatio > 0.9) {
        factors.push('High expense burden relative to revenue creates profitability pressure');
      }
    }

    return factors.length > 0 ? factors : ['Break-even profitability patterns require management'];
  }

  private analyzeProfitability(
    breakEvenRatio: number,
    revenueGap: number,
    severity: string
  ) {
    const breakEvenAssessment = breakEvenRatio < 0.9 ? `Critical break-even shortfall at ${breakEvenRatio.toFixed(2)} ratio` :
                              breakEvenRatio < 1.0 ? `Warning level break-even risk at ${breakEvenRatio.toFixed(2)} ratio` :
                              breakEvenRatio < 1.2 ? `Moderate profitability at ${breakEvenRatio.toFixed(2)} ratio` :
                              `Healthy profitability at ${breakEvenRatio.toFixed(2)} ratio`;

    const revenueGapAnalysis = revenueGap < 0 ? `Operating at loss with $${Math.abs(revenueGap).toLocaleString()} negative gap` :
                              revenueGap > 0 ? `Positive margin of $${revenueGap.toLocaleString()}` :
                              'Operating at exact break-even point';

    const riskLevel = severity === 'critical' ? 'Critical risk requiring immediate profitability action' :
                     severity === 'warning' ? 'Warning level risk requiring near-term optimization' :
                     'Informational level requiring monitoring and strategic planning';

    return {
      breakEvenAssessment,
      revenueGapAnalysis,
      riskLevel
    };
  }

  private generateRecommendations(
    breakEvenType: string,
    breakEvenRatio: number,
    severity: string
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];

    if (severity === 'critical') {
      immediate.push('Implement emergency cost reduction measures');
      immediate.push('Launch immediate revenue enhancement initiatives');
      immediate.push('Review all operational expenses for cuts');
      strategic.push('Develop comprehensive profitability improvement strategy');
      strategic.push('Create cost structure optimization plan');
      strategic.push('Implement advanced financial monitoring and controls');
    } else if (severity === 'warning') {
      immediate.push('Implement cost management strategies');
      immediate.push('Optimize revenue generation processes');
      immediate.push('Review pricing and operational efficiency');
      strategic.push('Develop profitability enhancement plans');
      strategic.push('Create cost optimization strategies');
      strategic.push('Implement financial performance monitoring');
    } else {
      immediate.push('Monitor profitability trends closely');
      immediate.push('Analyze cost and revenue drivers');
      immediate.push('Review operational efficiency metrics');
      strategic.push('Develop profitability forecasting capabilities');
      strategic.push('Create financial optimization framework');
      strategic.push('Implement break-even monitoring systems');
    }

    return { immediate, strategic };
  }
}
