// 🔒 FROZEN — Revenue Concentration Risk Alert V2
// V2 Changes: Supports Thai SME threshold calibration
// All other logic remains identical to V1 (frozen)

import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Revenue Concentration Risk Alert Rule V2
 * Detects dangerous revenue concentration patterns in time-based distribution
 * 
 * V2 Changes: Supports Thai SME threshold calibration
 * All other logic remains identical to V1 (frozen)
 */
export class RevenueConcentrationRuleV2 {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 21) {
      return null;
    }

    const today = new Date();
    const twentyEightDaysAgo = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);

    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= twentyEightDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 21) {
      return null;
    }

    const totalRevenue = recentSignals.reduce((sum, signal) => sum + signal.dailyRevenue, 0);
    
    if (totalRevenue <= 0) {
      return null;
    }

    const weekendRevenue = recentSignals
      .filter(signal => {
        const dayOfWeek = signal.timestamp.getDay();
        return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      })
      .reduce((sum, signal) => sum + signal.dailyRevenue, 0);

    if (!totalRevenue || totalRevenue <= 0) {
      return null;
    }
    
    const weekendShare = (weekendRevenue / totalRevenue) * 100;
    
    if (isNaN(weekendShare) || !isFinite(weekendShare)) {
      return null;
    }

    const sortedRevenues = recentSignals
      .map(signal => signal.dailyRevenue)
      .filter(r => isFinite(r) && !isNaN(r))
      .sort((a, b) => b - a);
    
    if (sortedRevenues.length === 0) {
      return null;
    }
    
    const top5Revenue = sortedRevenues.slice(0, 5).reduce((sum, revenue) => sum + revenue, 0);
    const top5Share = (top5Revenue / totalRevenue) * 100;
    
    if (isNaN(top5Share) || !isFinite(top5Share)) {
      return null;
    }

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let weekendWarningThreshold: number;
    let weekendCriticalThreshold: number;
    let top5WarningThreshold: number;
    let top5CriticalThreshold: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { weekendDependencyWarning?: number; weekendDependencyCritical?: number };
      weekendWarningThreshold = (thresholds.weekendDependencyWarning ?? 0.60) * 100;
      weekendCriticalThreshold = (thresholds.weekendDependencyCritical ?? 0.70) * 100;
      top5WarningThreshold = 45; // Keep at default (not in profile)
      top5CriticalThreshold = 50; // Keep at default (not in profile)
    } else {
      // Use default thresholds
      weekendWarningThreshold = 60;
      weekendCriticalThreshold = 70;
      top5WarningThreshold = 45;
      top5CriticalThreshold = 50;
    }

    // Detect concentration risk using resolved thresholds
    const concentrationRisk = this.detectConcentrationRisk(
      weekendShare,
      top5Share,
      weekendWarningThreshold,
      top5WarningThreshold
    );
    
    if (concentrationRisk === 'none') {
      return null;
    }

    // Determine severity using resolved thresholds
    const severity = this.determineSeverity(
      weekendShare,
      top5Share,
      weekendWarningThreshold,
      weekendCriticalThreshold,
      top5WarningThreshold,
      top5CriticalThreshold
    );

    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    const confidence = this.calculateConfidence(recentSignals.length, weekendRevenue, totalRevenue);

    const { message, recommendations } = this.generateMessageAndRecommendations(
      concentrationRisk,
      weekendShare,
      top5Share,
      weekendWarningThreshold,
      weekendCriticalThreshold,
      top5WarningThreshold,
      top5CriticalThreshold
    );

    const contributingFactors = this.generateContributingFactors(
      concentrationRisk,
      weekendShare,
      top5Share,
      recentSignals
    );

    const alert: AlertContract = {
      id: `revenue-concentration-v2-${Date.now()}`,
      timestamp: today,
      type: 'risk',
      severity,
      domain: 'forecast',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence,
      contributingFactors,
      conditions: [
        `Weekend revenue share: ${weekendShare.toFixed(1)}%`,
        `Top-5 day concentration: ${top5Share.toFixed(1)}%`,
        `Total revenue analyzed: $${totalRevenue.toLocaleString()}`,
        `Data points: ${recentSignals.length} days`,
        `Recommendations: ${recommendations}`
      ]
    };

    return alert;
  }

  private detectConcentrationRisk(
    weekendShare: number,
    top5Share: number,
    weekendWarningThreshold: number,
    top5WarningThreshold: number
  ): 'weekend_concentration' | 'top_day_concentration' | 'both' | 'none' {
    const weekendRisk = weekendShare >= weekendWarningThreshold;
    const topDayRisk = top5Share >= top5WarningThreshold;

    if (weekendRisk && topDayRisk) {
      return 'both';
    } else if (weekendRisk) {
      return 'weekend_concentration';
    } else if (topDayRisk) {
      return 'top_day_concentration';
    }

    return 'none';
  }

  private determineSeverity(
    weekendShare: number,
    top5Share: number,
    weekendWarningThreshold: number,
    weekendCriticalThreshold: number,
    top5WarningThreshold: number,
    top5CriticalThreshold: number
  ): 'critical' | 'warning' | 'informational' {
    const weekendSeverity = this.determineWeekendSeverity(
      weekendShare,
      weekendWarningThreshold,
      weekendCriticalThreshold
    );
    const topDaySeverity = this.determineTopDaySeverity(
      top5Share,
      top5WarningThreshold,
      top5CriticalThreshold
    );
    
    const severityLevels = { 'none': 0, 'informational': 1, 'warning': 2, 'critical': 3 };
    const applicableSeverities = [weekendSeverity, topDaySeverity].filter(s => s !== 'none');
    
    if (applicableSeverities.length === 0) {
      return 'informational';
    }
    
    const maxSeverity = Math.max(...applicableSeverities.map(s => severityLevels[s]));
    
    if (maxSeverity === 3) return 'critical';
    if (maxSeverity === 2) return 'warning';
    return 'informational';
  }

  private determineWeekendSeverity(
    weekendShare: number,
    warningThreshold: number,
    criticalThreshold: number
  ): 'critical' | 'warning' | 'informational' | 'none' {
    if (weekendShare >= criticalThreshold) return 'critical';
    if (weekendShare >= warningThreshold) return 'warning';
    if (weekendShare >= warningThreshold - 10) return 'informational';
    return 'none';
  }

  private determineTopDaySeverity(
    top5Share: number,
    warningThreshold: number,
    criticalThreshold: number
  ): 'critical' | 'warning' | 'informational' | 'none' {
    if (top5Share >= criticalThreshold) return 'critical';
    if (top5Share >= warningThreshold) return 'warning';
    if (top5Share >= warningThreshold - 10) return 'informational';
    return 'none';
  }

  private calculateConfidence(dataPoints: number, weekendRevenue: number, totalRevenue: number): number {
    let confidence = 0.75;

    const extraDays = Math.min(7, dataPoints - 21);
    confidence += extraDays * 0.02;

    const weekendDays = Math.floor(dataPoints / 7) * 3;
    const actualWeekendDays = dataPoints - Math.floor(dataPoints * 4/7);
    if (Math.abs(weekendDays - actualWeekendDays) <= 1) {
      confidence += 0.05;
    }

    if (weekendRevenue / totalRevenue > 0.90 || weekendRevenue / totalRevenue < 0.10) {
      confidence -= 0.10;
    }

    return Math.min(0.95, Math.max(0.60, confidence));
  }

  private generateMessageAndRecommendations(
    concentrationRisk: string,
    weekendShare: number,
    top5Share: number,
    weekendWarningThreshold: number,
    weekendCriticalThreshold: number,
    top5WarningThreshold: number,
    top5CriticalThreshold: number
  ): { message: string; recommendations: string } {
    const severity = this.determineSeverity(
      weekendShare,
      top5Share,
      weekendWarningThreshold,
      weekendCriticalThreshold,
      top5WarningThreshold,
      top5CriticalThreshold
    );
    const weekendHigh = weekendShare >= 55;
    const topDayHigh = top5Share >= 45;

    if (concentrationRisk === 'both') {
      if (severity === 'critical') {
        return {
          message: `Dual concentration risk: ${weekendShare.toFixed(1)}% weekend share and ${top5Share.toFixed(1)}% top-day concentration`,
          recommendations: 'Implement comprehensive revenue diversification strategy with dynamic pricing across time periods'
        };
      } else {
        return {
          message: `High top-day revenue concentration: ${top5Share.toFixed(1)}% of revenue from top 5 days creates risk`,
          recommendations: top5Share >= 65
            ? 'Diversify revenue across more days through dynamic pricing and promotions'
            : top5Share >= 55
            ? 'Implement revenue smoothing strategies and demand spreading through dynamic pricing'
            : 'Monitor revenue distribution and consider demand leveling with dynamic pricing'
        };
      }
    } else if (concentrationRisk === 'top_day_concentration') {
      return {
        message: `High top-day revenue concentration: ${top5Share.toFixed(1)}% of revenue from top 5 days creates risk`,
        recommendations: top5Share >= 65
          ? 'Diversify revenue across more days through dynamic pricing and promotions'
          : top5Share >= 55
          ? 'Implement revenue smoothing strategies and demand spreading through dynamic pricing'
          : 'Monitor revenue distribution and consider demand leveling with dynamic pricing'
      };
    } else if (concentrationRisk === 'weekend_concentration') {
      const message = `High weekend revenue concentration: ${weekendShare.toFixed(1)}% of revenue from weekends creates vulnerability`;
      const recommendations = weekendShare >= 75
        ? 'Implement weekday promotions and business travel packages immediately'
        : weekendShare >= 65
        ? 'Develop weekday revenue streams and corporate partnerships'
        : 'Consider weekday market expansion opportunities';
      return { message, recommendations };
    } else {
      return {
        message: 'Revenue concentration detected',
        recommendations: 'Monitor revenue distribution patterns'
      };
    }
  }

  private generateContributingFactors(
    concentrationRisk: string,
    weekendShare: number,
    top5Share: number,
    recentSignals: Array<{ timestamp: Date; dailyRevenue: number }>
  ) {
    const factors = [];

    if (weekendShare >= 55) {
      factors.push({
        factor: `Weekend revenue concentration: ${weekendShare.toFixed(1)}%`,
        weight: Math.min(1.0, (weekendShare - 50) / 30)
      });
    }

    if (top5Share >= 45) {
      factors.push({
        factor: `Top-5 day revenue concentration: ${top5Share.toFixed(1)}%`,
        weight: Math.min(1.0, (top5Share - 40) / 30)
      });
    }

    const revenues = recentSignals.map(s => s.dailyRevenue);
    const avgRevenue = revenues.reduce((sum, rev) => sum + rev, 0) / revenues.length;
    const variance = this.calculateVariance(revenues, avgRevenue);
    
    if (variance > avgRevenue * 0.5) {
      factors.push({
        factor: 'High revenue volatility indicates uneven demand distribution',
        weight: Math.min(1.0, variance / (avgRevenue * 0.8))
      });
    }

    const consecutiveClusters = this.findConsecutiveHighRevenueDays(recentSignals, avgRevenue);
    if (consecutiveClusters.length > 0) {
      const maxCluster = Math.max(...consecutiveClusters);
      if (maxCluster >= 3) {
        factors.push({
          factor: `Consecutive high-revenue day clusters: ${maxCluster} days`,
          weight: Math.min(1.0, maxCluster / 7)
        });
      }
    }

    return factors.length > 0 ? factors : [
      { factor: 'Revenue concentration pattern analysis', weight: 1.0 }
    ];
  }

  private calculateVariance(revenues: number[], mean: number): number {
    const squaredDiffs = revenues.map(rev => Math.pow(rev - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / revenues.length;
    return Math.sqrt(variance);
  }

  private findConsecutiveHighRevenueDays(
    signals: Array<{ timestamp: Date; dailyRevenue: number }>,
    avgRevenue: number
  ): number[] {
    const clusters: number[] = [];
    let currentCluster = 0;
    
    const sortedSignals = signals.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    for (const signal of sortedSignals) {
      if (signal.dailyRevenue > avgRevenue * 1.2) {
        currentCluster++;
      } else {
        if (currentCluster > 0) {
          clusters.push(currentCluster);
          currentCluster = 0;
        }
      }
    }
    
    if (currentCluster > 0) {
      clusters.push(currentCluster);
    }
    
    return clusters;
  }
}
