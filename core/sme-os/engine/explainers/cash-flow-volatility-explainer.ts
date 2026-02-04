import { AlertContract } from '../../contracts/alerts';

interface CashFlowVolatilityExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  volatilityAnalysis: {
    variationLevel: string;
    patternType: string;
    riskLevel: string;
  };
  recommendations: {
    immediate: string[];
    strategic: string[];
  };
}

interface AlertWithMetrics extends AlertContract {
  metrics?: {
    coefficientOfVariation: number;
    meanRevenue: number;
    standardDeviation: number;
  };
}

export class CashFlowVolatilityExplainer {
  explain(alert: AlertContract | null, revenueData?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): CashFlowVolatilityExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No cash flow volatility risk detected or insufficient data',
        contributingFactors: [],
        volatilityAnalysis: {
          variationLevel: 'No volatility analysis available',
          patternType: 'No pattern analysis available',
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
    let coefficientOfVariation = 0;
    let meanRevenue = 0;
    let standardDeviation = 0;

    if (alertWithMetrics.metrics) {
      coefficientOfVariation = alertWithMetrics.metrics.coefficientOfVariation;
      meanRevenue = alertWithMetrics.metrics.meanRevenue;
      standardDeviation = alertWithMetrics.metrics.standardDeviation;
    } else if (revenueData && revenueData.length >= 60) {
      const revenues = revenueData.map(d => d.dailyRevenue);
      meanRevenue = revenues.reduce((sum, rev) => sum + rev, 0) / revenues.length;
      
      const variance = revenues.reduce((sum, rev) => sum + Math.pow(rev - meanRevenue, 2), 0) / revenues.length;
      standardDeviation = Math.sqrt(variance);
      coefficientOfVariation = meanRevenue > 0 ? standardDeviation / meanRevenue : 0;
    } else {
      // Extract from alert conditions
      coefficientOfVariation = this.extractCVFromConditions(alert);
    }

    // Determine volatility type from alert
    const volatilityType = this.detectVolatilityTypeFromAlert(alert);

    // Generate primary factor explanation
    const primaryFactor = this.generatePrimaryFactor(
      volatilityType,
      coefficientOfVariation,
      alert.severity
    );

    // Generate contributing factors
    const contributingFactors = this.generateContributingFactors(
      volatilityType,
      coefficientOfVariation,
      meanRevenue,
      standardDeviation
    );

    // Generate volatility analysis
    const volatilityAnalysis = this.analyzeVolatility(
      coefficientOfVariation,
      alert.severity
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      volatilityType,
      coefficientOfVariation,
      alert.severity
    );

    return {
      primaryFactor,
      contributingFactors,
      volatilityAnalysis,
      recommendations
    };
  }

  private extractCVFromConditions(alert: AlertContract): number {
    const condition = alert.conditions.find(c => c.startsWith('Volatility (CV):'));
    if (condition) {
      const match = condition.match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : 0;
    }
    return 0;
  }

  private detectVolatilityTypeFromAlert(alert: AlertContract): string {
    const message = alert.message.toLowerCase();
    
    if (message.includes('extreme') || message.includes('severe')) {
      return 'extreme_volatility';
    } else if (message.includes('high')) {
      return 'high_volatility';
    } else if (message.includes('moderate')) {
      return 'moderate_volatility';
    }
    
    return 'general_volatility';
  }

  private generatePrimaryFactor(
    volatilityType: string,
    coefficientOfVariation: number,
    severity: string
  ): string {
    switch (volatilityType) {
      case 'extreme_volatility':
        return `Extreme cash flow volatility risk: ${coefficientOfVariation.toFixed(2)} coefficient of variation creates severe business unpredictability`;
      
      case 'high_volatility':
        return `High cash flow volatility risk: ${coefficientOfVariation.toFixed(2)} coefficient of variation indicates significant revenue instability`;
      
      case 'moderate_volatility':
        return `Moderate cash flow volatility risk: ${coefficientOfVariation.toFixed(2)} coefficient of variation suggests emerging revenue unpredictability`;
      
      default:
        return `Cash flow volatility detected: ${coefficientOfVariation.toFixed(2)} coefficient of variation indicates revenue pattern instability`;
    }
  }

  private generateContributingFactors(
    volatilityType: string,
    coefficientOfVariation: number,
    meanRevenue: number,
    standardDeviation: number
  ): string[] {
    const factors: string[] = [];

    // Volatility level analysis
    if (coefficientOfVariation >= 0.75) {
      factors.push(`Extreme volatility: ${coefficientOfVariation.toFixed(2)} CV creates severe cash flow unpredictability`);
    } else if (coefficientOfVariation >= 0.5) {
      factors.push(`High volatility: ${coefficientOfVariation.toFixed(2)} CV indicates significant revenue instability`);
    } else if (coefficientOfVariation >= 0.25) {
      factors.push(`Moderate volatility: ${coefficientOfVariation.toFixed(2)} CV indicates emerging revenue unpredictability`);
    }

    // Standard deviation analysis
    if (standardDeviation > 0 && meanRevenue > 0) {
      const deviationRatio = standardDeviation / meanRevenue;
      if (deviationRatio > 0.5) {
        factors.push('High standard deviation relative to mean revenue indicates large revenue swings');
      }
    }

    return factors.length > 0 ? factors : ['Cash flow volatility patterns require management'];
  }

  private analyzeVolatility(
    coefficientOfVariation: number,
    severity: string
  ) {
    const variationLevel = coefficientOfVariation >= 0.75 ? `Extreme volatility at ${coefficientOfVariation.toFixed(2)} CV` :
                         coefficientOfVariation >= 0.5 ? `High volatility at ${coefficientOfVariation.toFixed(2)} CV` :
                         coefficientOfVariation >= 0.25 ? `Moderate volatility at ${coefficientOfVariation.toFixed(2)} CV` :
                         `Low volatility at ${coefficientOfVariation.toFixed(2)} CV`;

    const patternType = coefficientOfVariation >= 0.75 ? 'Highly unpredictable revenue patterns' :
                       coefficientOfVariation >= 0.5 ? 'Significantly variable revenue patterns' :
                       'Moderately variable revenue patterns';

    const riskLevel = severity === 'critical' ? 'Critical risk requiring immediate cash flow management' :
                     severity === 'warning' ? 'Warning level risk requiring near-term planning' :
                     'Informational level requiring monitoring and strategic planning';

    return {
      variationLevel,
      patternType,
      riskLevel
    };
  }

  private generateRecommendations(
    volatilityType: string,
    coefficientOfVariation: number,
    severity: string
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];

    if (severity === 'critical') {
      immediate.push('Implement emergency cash flow management');
      immediate.push('Develop immediate revenue stabilization strategies');
      immediate.push('Review and strengthen cash reserves');
      strategic.push('Develop comprehensive volatility management strategy');
      strategic.push('Create revenue diversification plans');
      strategic.push('Implement advanced cash flow forecasting');
    } else if (severity === 'warning') {
      immediate.push('Implement cash flow management strategies');
      immediate.push('Develop revenue smoothing initiatives');
      immediate.push('Review cash flow forecasting accuracy');
      strategic.push('Create volatility mitigation plans');
      strategic.push('Develop revenue stabilization strategies');
      strategic.push('Implement cash flow monitoring systems');
    } else {
      immediate.push('Monitor cash flow patterns closely');
      immediate.push('Develop cash flow management planning');
      immediate.push('Analyze volatility drivers');
      strategic.push('Create cash flow volatility management strategy');
      strategic.push('Develop revenue pattern analysis capabilities');
      strategic.push('Implement cash flow risk assessment');
    }

    return { immediate, strategic };
  }
}
