import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

/**
 * Revenue Concentration Risk Alert Rule
 * Detects dangerous revenue concentration patterns in time-based distribution
 */
export class RevenueConcentrationRule {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue: number;
  }>): AlertContract | null {
    if (!operationalSignals || operationalSignals.length < 21) {
      return null;
    }

    const today = new Date();
    const twentyEightDaysAgo = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);

    // Filter to 28-day rolling window
    const recentSignals = operationalSignals.filter(signal => 
      signal.timestamp >= twentyEightDaysAgo && signal.timestamp <= today
    );

    if (recentSignals.length < 21) {
      return null;
    }

    // Calculate total revenue
    const totalRevenue = recentSignals.reduce((sum, signal) => sum + signal.dailyRevenue, 0);
    
    if (totalRevenue <= 0) {
      return null;
    }

    // Calculate weekend revenue share
    const weekendRevenue = recentSignals
      .filter(signal => {
        const dayOfWeek = signal.timestamp.getDay();
        return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri-Sun
      })
      .reduce((sum, signal) => sum + signal.dailyRevenue, 0);

    const weekendShare = (weekendRevenue / totalRevenue) * 100;

    // Calculate top-5 day concentration
    const sortedRevenues = recentSignals
      .map(signal => signal.dailyRevenue)
      .sort((a, b) => b - a);
    
    const top5Revenue = sortedRevenues.slice(0, 5).reduce((sum, revenue) => sum + revenue, 0);
    const top5Share = (top5Revenue / totalRevenue) * 100;

    // Detect concentration risk
    const concentrationRisk = this.detectConcentrationRisk(weekendShare, top5Share);
    
    if (concentrationRisk === 'none') {
      return null;
    }

    // Determine severity
    const severity = this.determineSeverity(weekendShare, top5Share);

    // Determine time horizon
    const timeHorizon = severity === 'critical' ? 'immediate' : 
                      severity === 'warning' ? 'near-term' : 'medium-term';

    // Calculate confidence
    const confidence = this.calculateConfidence(recentSignals.length, weekendRevenue, totalRevenue);

    // Generate message and recommendations
    const { message, recommendations } = this.generateMessageAndRecommendations(
      concentrationRisk,
      weekendShare,
      top5Share
    );

    // Contributing factors
    const contributingFactors = this.generateContributingFactors(
      concentrationRisk,
      weekendShare,
      top5Share,
      recentSignals
    );

    const alert: AlertContract = {
      id: `revenue-concentration-${Date.now()}`,
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

  private detectConcentrationRisk(weekendShare: number, top5Share: number): 'weekend_concentration' | 'top_day_concentration' | 'both' | 'none' {
    const weekendRisk = weekendShare >= 55;
    const topDayRisk = top5Share >= 45;

    if (weekendRisk && topDayRisk) {
      return 'both';
    } else if (weekendRisk) {
      return 'weekend_concentration';
    } else if (topDayRisk) {
      return 'top_day_concentration';
    }

    return 'none';
  }

  private determineSeverity(weekendShare: number, top5Share: number): 'critical' | 'warning' | 'informational' {
    // Critical thresholds
    if (weekendShare >= 75 || top5Share >= 65) {
      return 'critical';
    }

    // Warning thresholds
    if (weekendShare >= 65 || top5Share >= 55) {
      return 'warning';
    }

    return 'informational';
  }

  private calculateConfidence(dataPoints: number, weekendRevenue: number, totalRevenue: number): number {
    let confidence = 0.75; // Base confidence

    // Bonus for more data points (beyond minimum 21)
    const extraDays = Math.min(7, dataPoints - 21);
    confidence += extraDays * 0.02; // +0.02 per extra day, max +0.14

    // Bonus for balanced week representation
    const weekendDays = Math.floor(dataPoints / 7) * 3; // Expected weekend days
    const actualWeekendDays = dataPoints - Math.floor(dataPoints * 4/7); // Approximate weekend days
    if (Math.abs(weekendDays - actualWeekendDays) <= 1) {
      confidence += 0.05;
    }

    // Penalty for extreme concentration (may indicate data quality issues)
    if (weekendRevenue / totalRevenue > 0.90 || weekendRevenue / totalRevenue < 0.10) {
      confidence -= 0.10;
    }

    return Math.min(0.95, Math.max(0.60, confidence));
  }

  private generateMessageAndRecommendations(
    concentrationRisk: string,
    weekendShare: number,
    top5Share: number
  ): { message: string; recommendations: string } {
    switch (concentrationRisk) {
      case 'weekend_concentration':
        const message = `High weekend revenue concentration: ${weekendShare.toFixed(1)}% of revenue from weekends creates vulnerability`;
        const recommendations = weekendShare >= 75
          ? 'Implement weekday promotions and business travel packages immediately'
          : weekendShare >= 65
          ? 'Develop weekday revenue streams and corporate partnerships'
          : 'Consider weekday market expansion opportunities';
        return { message, recommendations };

      case 'top_day_concentration':
        return {
          message: `High top-day revenue concentration: ${top5Share.toFixed(1)}% of revenue from top 5 days creates risk`,
          recommendations: top5Share >= 65
            ? 'Diversify revenue across more days through dynamic pricing and promotions'
            : top5Share >= 55
            ? 'Implement revenue smoothing strategies and demand spreading'
            : 'Monitor revenue distribution and consider demand leveling'
        };

      case 'both':
        return {
          message: `Dual concentration risk: ${weekendShare.toFixed(1)}% weekend share and ${top5Share.toFixed(1)}% top-day concentration`,
          recommendations: 'Implement comprehensive revenue diversification strategy across time periods'
        };

      default:
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

    // Weekend concentration factors
    if (weekendShare >= 55) {
      factors.push({
        factor: `Weekend revenue concentration: ${weekendShare.toFixed(1)}%`,
        weight: Math.min(1.0, (weekendShare - 50) / 30)
      });
    }

    // Top-day concentration factors
    if (top5Share >= 45) {
      factors.push({
        factor: `Top-5 day revenue concentration: ${top5Share.toFixed(1)}%`,
        weight: Math.min(1.0, (top5Share - 40) / 30)
      });
    }

    // Revenue variance analysis
    const revenues = recentSignals.map(s => s.dailyRevenue);
    const avgRevenue = revenues.reduce((sum, rev) => sum + rev, 0) / revenues.length;
    const variance = this.calculateVariance(revenues, avgRevenue);
    
    if (variance > avgRevenue * 0.5) {
      factors.push({
        factor: 'High revenue volatility indicates uneven demand distribution',
        weight: Math.min(1.0, variance / (avgRevenue * 0.8))
      });
    }

    // Consecutive high-revenue day analysis
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
    
    // Sort by timestamp to ensure chronological order
    const sortedSignals = signals.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    for (const signal of sortedSignals) {
      if (signal.dailyRevenue > avgRevenue * 1.2) { // 20% above average
        currentCluster++;
      } else {
        if (currentCluster > 0) {
          clusters.push(currentCluster);
          currentCluster = 0;
        }
      }
    }
    
    // Don't forget the last cluster
    if (currentCluster > 0) {
      clusters.push(currentCluster);
    }
    
    return clusters;
  }
}
