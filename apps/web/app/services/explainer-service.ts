/**
 * Explainer Service
 * 
 * Routes alerts to appropriate explainer classes based on alert type.
 * Provides unified interface for getting explanations from SME OS explainers.
 */
'use client';

import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import { DemandDropExplainer } from '../../../../core/sme-os/engine/explainers/demand-drop-explainer';
import { WeekendWeekdayExplainer } from '../../../../core/sme-os/engine/explainers/weekend-weekday-explainer';
import { LowWeekdayUtilizationExplainer } from '../../../../core/sme-os/engine/explainers/low-weekday-utilization-explainer';
import { CapacityUtilizationExplainer } from '../../../../core/sme-os/engine/explainers/capacity-utilization-explainer';
import { RevenueConcentrationExplainer } from '../../../../core/sme-os/engine/explainers/revenue-concentration-explainer';
import { SeasonalityRiskExplainer } from '../../../../core/sme-os/engine/explainers/seasonality-risk-explainer';
import { operationalSignalsService, type OperationalSignal } from './operational-signals-service';
import { businessGroupService } from './business-group-service';

export interface UnifiedExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  dataQuality: {
    completeness: string;
    historicalCoverage: string;
    variance: string;
  };
  // Additional fields that may be present in specific explainers
  impactAnalysis?: {
    revenueImpact?: string;
    occupancyImpact?: string;
    volumeImpact?: string;
  };
  utilizationAnalysis?: {
    averageOccupancy?: string;
    peakDayPattern?: string;
    consistencyPattern?: string;
  };
  profitabilityAnalysis?: {
    breakEvenAssessment?: string;
    revenueGapAnalysis?: string;
    riskLevel?: string;
  };
}

export class ExplainerService {
  private demandDropExplainer: DemandDropExplainer;
  private weekendWeekdayExplainer: WeekendWeekdayExplainer;
  private lowWeekdayUtilizationExplainer: LowWeekdayUtilizationExplainer;
  private capacityUtilizationExplainer: CapacityUtilizationExplainer;
  private revenueConcentrationExplainer: RevenueConcentrationExplainer;
  private seasonalityRiskExplainer: SeasonalityRiskExplainer;

  constructor() {
    this.demandDropExplainer = new DemandDropExplainer();
    this.weekendWeekdayExplainer = new WeekendWeekdayExplainer();
    this.lowWeekdayUtilizationExplainer = new LowWeekdayUtilizationExplainer();
    this.capacityUtilizationExplainer = new CapacityUtilizationExplainer();
    this.revenueConcentrationExplainer = new RevenueConcentrationExplainer();
    this.seasonalityRiskExplainer = new SeasonalityRiskExplainer();
  }

  /**
   * Get explanation for an alert using the appropriate explainer
   */
  async explain(alert: AlertContract): Promise<UnifiedExplanation> {
    const alertId = alert.id.toLowerCase();
    const domain = alert.domain?.toLowerCase() || '';
    
    // Get operational signals for explainers that need them
    const branchId = alert.branchId || businessGroupService.getCurrentBranchId();
    const businessGroup = businessGroupService.getBusinessGroup();
    const signals = branchId && branchId !== '__all__'
      ? operationalSignalsService.getAllSignals(branchId, businessGroup?.id)
      : [];

    // Route to appropriate explainer based on alert ID or domain
    if (alertId.includes('demand-drop') || domain === 'demand') {
      const explanation = this.demandDropExplainer.explain(alert, signals.map(s => ({
        timestamp: s.timestamp,
        revenue7Days: s.revenue7Days,
        revenue30Days: s.revenue30Days,
        occupancyRate: s.occupancyRate,
        customerVolume: s.customerVolume,
      })));
      
      return {
        primaryFactor: explanation.primaryFactor,
        contributingFactors: explanation.contributingFactors,
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
        impactAnalysis: explanation.impactAnalysis,
      };
    }

    if (alertId.includes('weekend-weekday') || alertId.includes('weekend-weekday-imbalance') || alertId.includes('weekend-weekday-fnb-gap')) {
      const explanation = this.weekendWeekdayExplainer.explain(alert, signals.map(s => ({
        timestamp: s.timestamp,
        dailyRevenue: s.revenue7Days / 7, // Approximate daily revenue
        occupancyRate: s.occupancyRate || 0,
        averageDailyRate: 0, // Not available in signals
      })));
      
      return {
        primaryFactor: explanation.primaryFactor,
        contributingFactors: explanation.contributingFactors,
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
        // WeekendWeekdayExplanation has pricingAnalysis structure
        impactAnalysis: {
          revenueImpact: explanation.pricingAnalysis.revenueEfficiency || '',
          occupancyImpact: explanation.pricingAnalysis.occupancyPattern || '',
          volumeImpact: explanation.pricingAnalysis.weekendPremium || '',
        },
      };
    }

    if (alertId.includes('low-weekday-utilization')) {
      const explanation = this.lowWeekdayUtilizationExplainer.explain(alert, signals.map(s => ({
        timestamp: s.timestamp,
        dailyRevenue: s.revenue7Days / 7, // Approximate daily revenue
      })));
      
      return {
        primaryFactor: explanation.primaryFactor,
        contributingFactors: explanation.contributingFactors,
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
        utilizationAnalysis: explanation.utilizationAnalysis,
      };
    }

    if (alertId.includes('capacity-utilization')) {
      const explanation = this.capacityUtilizationExplainer.explain(alert, signals.map(s => ({
        timestamp: s.timestamp,
        occupancyRate: s.occupancyRate || 0,
      })));
      
      return {
        primaryFactor: explanation.primaryFactor,
        contributingFactors: explanation.contributingFactors,
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
        utilizationAnalysis: explanation.utilizationAnalysis,
      };
    }

    if (alertId.includes('revenue-concentration') || alertId.includes('menu-revenue-concentration')) {
      const explanation = this.revenueConcentrationExplainer.explain(alert);
      
      return {
        primaryFactor: explanation.primaryFactor,
        contributingFactors: explanation.contributingFactors,
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
        // Map concentrationAnalysis to profitabilityAnalysis structure
        profitabilityAnalysis: {
          breakEvenAssessment: explanation.concentrationAnalysis.riskLevel,
          revenueGapAnalysis: explanation.concentrationAnalysis.topDayConcentration,
          riskLevel: explanation.concentrationAnalysis.riskLevel,
        },
      };
    }

    if (alertId.includes('seasonal') || alertId.includes('seasonality')) {
      const explanation = this.seasonalityRiskExplainer.explain(alert, signals.map(s => ({
        timestamp: s.timestamp,
        dailyRevenue: s.revenue7Days / 7,
      })));
      
      return {
        primaryFactor: explanation.primaryFactor,
        contributingFactors: explanation.contributingFactors,
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
        // Map seasonalityAnalysis to profitabilityAnalysis structure
        profitabilityAnalysis: {
          breakEvenAssessment: explanation.seasonalityAnalysis.riskLevel,
          revenueGapAnalysis: explanation.seasonalityAnalysis.variationLevel,
          riskLevel: explanation.seasonalityAnalysis.riskLevel,
        },
      };
    }

    // Handle alerts without dedicated explainers - provide enhanced fallback explanations
    if (alertId.includes('cost-pressure') || domain === 'cost') {
      return this.generateCostPressureExplanation(alert, signals);
    }

    if (alertId.includes('margin-compression') || alertId.includes('margin')) {
      return this.generateMarginCompressionExplanation(alert, signals);
    }

    if (alertId.includes('data-confidence') || alertId.includes('data-quality')) {
      return this.generateDataConfidenceExplanation(alert);
    }

    if (alertId.includes('seasonal-mismatch') || alertId.includes('seasonal')) {
      return this.generateSeasonalMismatchExplanation(alert, signals);
    }

    // Fallback: Generic explanation from alert data
    return {
      primaryFactor: alert.message,
      contributingFactors: alert.contributingFactors.map(cf => cf.factor),
      dataQuality: {
        completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
        historicalCoverage: 'Historical data span: Based on operational signals',
        variance: 'Historical variance: Calculated from signal trends',
      },
    };
  }

  /**
   * Generate explanation for Cost Pressure alerts
   */
  private generateCostPressureExplanation(
    alert: AlertContract,
    signals: OperationalSignal[]
  ): UnifiedExplanation {
    const latestSignal = signals[0];
    const previousSignal = signals[1];

    if (!latestSignal || !previousSignal) {
      return {
        primaryFactor: alert.message,
        contributingFactors: alert.contributingFactors.map(cf => cf.factor),
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
      };
    }

    const costChange = previousSignal.costs7Days > 0
      ? ((latestSignal.costs7Days - previousSignal.costs7Days) / previousSignal.costs7Days) * 100
      : 0;
    const revenueChange = previousSignal.revenue7Days > 0
      ? ((latestSignal.revenue7Days - previousSignal.revenue7Days) / previousSignal.revenue7Days) * 100
      : 0;
    const staffChange = previousSignal.staffCount > 0
      ? ((latestSignal.staffCount - previousSignal.staffCount) / previousSignal.staffCount) * 100
      : 0;

    let primaryFactor = alert.message;
    const contributingFactors: string[] = [];

    if (costChange > revenueChange + 10) {
      contributingFactors.push(`Operating costs increased ${costChange.toFixed(1)}% while revenue ${revenueChange >= 0 ? 'increased' : 'decreased'} ${Math.abs(revenueChange).toFixed(1)}%`);
    }

    if (staffChange > 10 && revenueChange < 5) {
      contributingFactors.push(`Staff count increased ${staffChange.toFixed(1)}% without corresponding revenue growth`);
    }

    return {
      primaryFactor,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : alert.contributingFactors.map(cf => cf.factor),
      dataQuality: {
        completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
        historicalCoverage: 'Historical data span: Based on operational signals',
        variance: 'Historical variance: Calculated from signal trends',
      },
      profitabilityAnalysis: {
        breakEvenAssessment: `Cost pressure is ${alert.severity === 'critical' ? 'significantly' : 'moderately'} impacting profitability`,
        revenueGapAnalysis: costChange > revenueChange
          ? `Costs are rising ${(costChange - revenueChange).toFixed(1)} percentage points faster than revenue`
          : 'Cost and revenue trends require monitoring',
        riskLevel: alert.severity === 'critical' ? 'High risk - immediate attention needed' : 'Moderate risk - monitor closely',
      },
    };
  }

  /**
   * Generate explanation for Margin Compression alerts
   */
  private generateMarginCompressionExplanation(
    alert: AlertContract,
    signals: OperationalSignal[]
  ): UnifiedExplanation {
    const latestSignal = signals[0];
    const previousSignal = signals[1];

    if (!latestSignal || !previousSignal) {
      return {
        primaryFactor: alert.message,
        contributingFactors: alert.contributingFactors.map(cf => cf.factor),
        dataQuality: {
          completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
          historicalCoverage: 'Historical data span: Based on operational signals',
          variance: 'Historical variance: Calculated from signal trends',
        },
      };
    }

    const previousMargin = previousSignal.revenue7Days > 0
      ? ((previousSignal.revenue7Days - previousSignal.costs7Days) / previousSignal.revenue7Days) * 100
      : 0;
    const latestMargin = latestSignal.revenue7Days > 0
      ? ((latestSignal.revenue7Days - latestSignal.costs7Days) / latestSignal.revenue7Days) * 100
      : 0;
    const marginChange = latestMargin - previousMargin;

    const contributingFactors: string[] = [];
    if (Math.abs(latestSignal.revenue7Days - previousSignal.revenue7Days) / previousSignal.revenue7Days < 0.10) {
      contributingFactors.push('Revenue remained relatively stable while margins compressed');
    }
    contributingFactors.push(`Profit margin decreased from ${previousMargin.toFixed(1)}% to ${latestMargin.toFixed(1)}%`);

    return {
      primaryFactor: alert.message,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : alert.contributingFactors.map(cf => cf.factor),
      dataQuality: {
        completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
        historicalCoverage: 'Historical data span: Based on operational signals',
        variance: 'Historical variance: Calculated from signal trends',
      },
      profitabilityAnalysis: {
        breakEvenAssessment: `Current margin of ${latestMargin.toFixed(1)}% is ${marginChange < -5 ? 'significantly' : 'moderately'} below previous period`,
        revenueGapAnalysis: marginChange < 0
          ? `Margin compression of ${Math.abs(marginChange).toFixed(1)} percentage points indicates cost increases outpacing revenue`
          : 'Margin trends require monitoring',
        riskLevel: alert.severity === 'critical' ? 'High risk - profitability declining' : 'Moderate risk - monitor margin trends',
      },
    };
  }

  /**
   * Generate explanation for Data Confidence Risk alerts
   */
  private generateDataConfidenceExplanation(alert: AlertContract): UnifiedExplanation {
    // Extract data age from conditions if available
    let dataAgeInfo = '';
    const ageCondition = alert.conditions.find(c => c.toLowerCase().includes('day') || c.toLowerCase().includes('age'));
    if (ageCondition) {
      dataAgeInfo = ageCondition;
    }

    const contributingFactors: string[] = [];
    if (alert.confidence < 0.5) {
      contributingFactors.push(`Data confidence is ${Math.round(alert.confidence * 100)}%, below recommended threshold`);
    }
    if (dataAgeInfo) {
      contributingFactors.push(dataAgeInfo);
    }

    return {
      primaryFactor: alert.message,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : alert.contributingFactors.map(cf => cf.factor),
      dataQuality: {
        completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
        historicalCoverage: dataAgeInfo || 'Historical data span: Based on operational signals',
        variance: 'Data freshness may impact alert accuracy',
      },
    };
  }

  /**
   * Generate explanation for Seasonal Mismatch alerts
   */
  private generateSeasonalMismatchExplanation(
    alert: AlertContract,
    signals: OperationalSignal[]
  ): UnifiedExplanation {
    const contributingFactors: string[] = [];
    
    // Extract deviation information from conditions
    const deviationCondition = alert.conditions.find(c => 
      c.toLowerCase().includes('%') || c.toLowerCase().includes('deviation')
    );
    if (deviationCondition) {
      contributingFactors.push(deviationCondition);
    }

    // Add signal-based context if available
    if (signals.length >= 2) {
      const latestSignal = signals[0];
      const previousSignal = signals[1];
      const revenueChange = previousSignal.revenue30Days > 0
        ? ((latestSignal.revenue30Days - previousSignal.revenue30Days) / previousSignal.revenue30Days) * 100
        : 0;
      
      if (Math.abs(revenueChange) > 20) {
        contributingFactors.push(`30-day revenue ${revenueChange > 0 ? 'increased' : 'decreased'} ${Math.abs(revenueChange).toFixed(1)}% compared to previous period`);
      }
    }

    return {
      primaryFactor: alert.message,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : alert.contributingFactors.map(cf => cf.factor),
      dataQuality: {
        completeness: `Data completeness: ${Math.round(alert.confidence * 100)}%`,
        historicalCoverage: 'Historical data span: Based on operational signals',
        variance: 'Seasonal patterns may vary from historical norms',
      },
      profitabilityAnalysis: {
        breakEvenAssessment: 'Seasonal variations may impact profitability expectations',
        revenueGapAnalysis: 'Revenue patterns differ from expected seasonal trends',
        riskLevel: alert.severity === 'critical' ? 'High risk - significant deviation from seasonal norms' : 'Moderate risk - monitor seasonal patterns',
      },
    };
  }
}

export const explainerService = new ExplainerService();
