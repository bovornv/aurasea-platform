import { AlertContract } from '../../contracts/alerts';

/**
 * ⚠️ FROZEN ⚠️
 * 
 * Liquidity Runway Risk Explainer
 * Status: FROZEN
 * Reason: All explainer tests (6/6) passing and validated
 * 
 * This explainer implementation is frozen and production-ready.
 * Recommendation wording, factor generation, and analysis logic are test-locked.
 * 
 * CRITICAL CONSTRAINTS:
 * - Recommendation strings are test-locked and must not be modified
 * - Factor generation logic must match test expectations
 * - Do NOT modify recommendation wording without updating tests
 * 
 * CHANGE PROCESS (MANDATORY):
 * 1. Any future changes MUST begin by updating tests first
 * 2. Do NOT modify recommendation strings without explicit test updates
 * 3. If significant changes are needed, create a new explainer version
 */

interface LiquidityRunwayRiskExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  liquidityAnalysis: {
    runwayAssessment: string;
    burnRateAnalysis: string;
    riskLevel: string;
  };
  recommendations: {
    immediate: string[];
    strategic: string[];
  };
}

interface AlertWithMetrics extends AlertContract {
  metrics?: {
    runwayMonths: number;
    cashBalance: number;
    monthlyBurn: number;
  };
}

export class LiquidityRunwayRiskExplainer {
  explain(alert: AlertContract | null, cashFlowData?: Array<{
    timestamp: Date;
    cashBalance: number;
    netCashFlow: number;
  }>): LiquidityRunwayRiskExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No liquidity runway risk detected or insufficient data',
        contributingFactors: [],
        liquidityAnalysis: {
          runwayAssessment: 'No runway analysis available',
          burnRateAnalysis: 'No burn rate analysis available',
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
    let runwayMonths = 0;
    let cashBalance = 0;
    let monthlyBurn = 0;

    if (alertWithMetrics.metrics) {
      runwayMonths = alertWithMetrics.metrics.runwayMonths;
      cashBalance = alertWithMetrics.metrics.cashBalance;
      monthlyBurn = alertWithMetrics.metrics.monthlyBurn;
    } else if (cashFlowData && cashFlowData.length >= 30) {
      cashBalance = cashFlowData[0].cashBalance;
      const netCashFlows = cashFlowData.map(d => d.netCashFlow);
      const totalNetFlow = netCashFlows.reduce((sum, flow) => sum + flow, 0);
      const averageDailyBurn = totalNetFlow / netCashFlows.length;
      monthlyBurn = averageDailyBurn * 30;
      runwayMonths = monthlyBurn > 0 ? cashBalance / monthlyBurn : 0;
    } else {
      // Extract from alert conditions
      runwayMonths = this.extractRunwayFromConditions(alert);
      cashBalance = this.extractCashBalanceFromConditions(alert);
      monthlyBurn = this.extractMonthlyBurnFromConditions(alert);
    }

    // Determine liquidity type from alert
    const liquidityType = this.detectLiquidityTypeFromAlert(alert);

    // Generate primary factor explanation
    const primaryFactor = this.generatePrimaryFactor(
      liquidityType,
      runwayMonths,
      cashBalance,
      monthlyBurn,
      alert.severity
    );

    // Generate contributing factors
    const contributingFactors = this.generateContributingFactors(
      liquidityType,
      runwayMonths,
      monthlyBurn,
      cashBalance
    );

    // Generate liquidity analysis
    const liquidityAnalysis = this.analyzeLiquidity(
      runwayMonths,
      monthlyBurn,
      alert.severity
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      liquidityType,
      runwayMonths,
      alert.severity
    );

    return {
      primaryFactor,
      contributingFactors,
      liquidityAnalysis,
      recommendations
    };
  }

  private extractRunwayFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Estimated runway:'));
    if (condition) {
      const match = condition.match(/(\d+\.?\d*) months/);
      return match ? parseFloat(match[1]) : 0;
    }
    return 0;
  }

  private extractCashBalanceFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Cash balance:'));
    if (condition) {
      const match = condition.match(/\$([0-9,]+)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    }
    return 0;
  }

  private extractMonthlyBurnFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Average monthly burn:'));
    if (condition) {
      const match = condition.match(/\$([0-9,]+)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    }
    return 0;
  }

  private detectLiquidityTypeFromAlert(alert: AlertContract): string {
    const message = alert.message.toLowerCase();
    
    if (message.includes('critical') || alert.severity === 'critical') {
      return 'critical_liquidity';
    } else if (message.includes('warning') || alert.severity === 'warning') {
      return 'warning_liquidity';
    } else if (message.includes('moderate') || alert.severity === 'informational') {
      return 'moderate_liquidity';
    }
    
    return 'general_liquidity';
  }

  private generatePrimaryFactor(
    liquidityType: string,
    runwayMonths: number,
    cashBalance: number,
    monthlyBurn: number,
    severity: string
  ): string {
    switch (liquidityType) {
      case 'critical_liquidity':
        return `Critical liquidity risk: ${runwayMonths.toFixed(1)} months runway with $${cashBalance.toLocaleString()} balance and $${monthlyBurn.toLocaleString()} monthly burn creates immediate cash flow crisis`;
      
      case 'warning_liquidity':
        return `Warning liquidity risk: ${runwayMonths.toFixed(1)} months runway with $${monthlyBurn.toLocaleString()} monthly burn rate requires near-term cash flow management`;
      
      case 'moderate_liquidity':
        return `Moderate liquidity risk: ${runwayMonths.toFixed(1)} months runway suggests need for cash flow monitoring and planning`;
      
      default:
        return `Liquidity runway risk detected: ${runwayMonths.toFixed(1)} months of cash remaining requires attention`;
    }
  }

  private generateContributingFactors(
    liquidityType: string,
    runwayMonths: number,
    monthlyBurn: number,
    cashBalance: number
  ): string[] {
    const factors: string[] = [];

    // Runway duration analysis
    if (runwayMonths < 3) {
      factors.push('Critical runway shortage requires immediate action');
    } else if (runwayMonths < 6) {
      factors.push(`Limited cash reserves: ${runwayMonths.toFixed(1)} months runway creates vulnerability`);
    } else {
      factors.push(`Moderate runway concern: ${runwayMonths.toFixed(1)} months requires monitoring`);
    }

    // Burn rate analysis
    if (monthlyBurn > 0) {
      if (monthlyBurn > cashBalance * 0.15) {
        factors.push(`High monthly burn rate: $${monthlyBurn.toLocaleString()} creates liquidity pressure`);
      } else {
        factors.push(`Monthly burn rate: $${monthlyBurn.toLocaleString()} relative to cash reserves`);
      }
    }

    // Cash balance adequacy
    if (cashBalance < monthlyBurn * 6) {
      factors.push('Cash reserves insufficient for medium-term operations');
    }

    return factors.length > 0 ? factors : ['Liquidity runway patterns require management'];
  }

  private analyzeLiquidity(
    runwayMonths: number,
    monthlyBurn: number,
    severity: string
  ) {
    const runwayAssessment = runwayMonths < 3 ? `Critical runway at ${runwayMonths.toFixed(1)} months` :
                           runwayMonths < 6 ? `Warning level runway at ${runwayMonths.toFixed(1)} months` :
                           runwayMonths < 12 ? `Moderate runway at ${runwayMonths.toFixed(1)} months` :
                           `Healthy runway at ${runwayMonths.toFixed(1)} months`;

    const burnRateAnalysis = monthlyBurn > 0 ? `Monthly burn rate of $${monthlyBurn.toLocaleString()} indicates cash consumption pattern` :
                            'No significant burn rate detected';

    const riskLevel = severity === 'critical' ? 'Critical risk requiring immediate liquidity management' :
                     severity === 'warning' ? 'Warning level risk requiring near-term action' :
                     'Informational level requiring monitoring and strategic planning';

    return {
      runwayAssessment,
      burnRateAnalysis,
      riskLevel
    };
  }

  // ⚠️ FROZEN: Recommendation generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Recommendation strings are test-locked and must match exact test expectations
  private generateRecommendations(
    liquidityType: string,
    runwayMonths: number,
    severity: string
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];

    if (severity === 'critical') {
      // ⚠️ FROZEN: Required exact string for tests: "Implement emergency cash preservation"
      immediate.push('Implement emergency cash preservation');
      immediate.push('Secure immediate financing or credit facilities');
      immediate.push('Reduce all non-essential expenses immediately');
      strategic.push('Develop comprehensive liquidity management strategy');
      strategic.push('Create emergency funding contingency plans');
      strategic.push('Implement advanced cash flow forecasting and monitoring');
    } else if (severity === 'warning') {
      immediate.push('Implement cost reduction strategies');
      immediate.push('Review and optimize cash flow management');
      immediate.push('Accelerate revenue collection processes');
      strategic.push('Prepare funding and financing options');
      strategic.push('Develop cash flow optimization strategies');
      strategic.push('Create liquidity risk management framework');
    } else {
      // ⚠️ FROZEN: Required exact string for tests: "Monitor cash flow trends"
      immediate.push('Monitor cash flow trends');
      immediate.push('Develop cash flow forecasting accuracy');
      immediate.push('Review expense management processes');
      strategic.push('Develop cash flow forecasting capabilities');
      strategic.push('Create liquidity risk assessment framework');
      strategic.push('Implement cash flow optimization planning');
    }

    return { immediate, strategic };
  }
}
