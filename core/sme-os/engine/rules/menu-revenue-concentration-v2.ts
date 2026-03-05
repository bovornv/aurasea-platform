import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Menu Revenue Concentration Alert Rule V2
 * Detects revenue concentration risk when top 3 menu items account for excessive revenue share
 * 
 * V2 Changes:
 * - Supports Thai SME threshold calibration
 * - All other logic remains identical to V1 (frozen)
 * 
 * This V2 version maintains all frozen logic from V1 but adds configurable thresholds
 * for Thai SME business context. Original thresholds are used as defaults.
 */
export class MenuRevenueConcentrationRuleV2 {
  evaluate(input: InputContract, menuItemData?: Array<{
    timestamp: Date;
    menuItemId: string;
    menuItemName: string;
    revenue: number;
  }>): AlertContract | null {
    // 🔒 FROZEN: Minimum data requirement (DO NOT MODIFY WITHOUT TEST UPDATES)
    if (!menuItemData || menuItemData.length < 14) {
      return null;
    }

    // Sort data by timestamp (most recent first) and take the most recent 14 days worth
    const sortedData = [...menuItemData].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );

    // Group by date to get unique days
    const dataByDate = new Map<string, Array<typeof menuItemData[0]>>();
    sortedData.forEach(item => {
      const dateKey = item.timestamp.toISOString().split('T')[0];
      if (!dataByDate.has(dateKey)) {
        dataByDate.set(dateKey, []);
      }
      dataByDate.get(dateKey)!.push(item);
    });

    // Get the most recent 14 days
    const uniqueDates = Array.from(dataByDate.keys()).slice(0, 14);
    if (uniqueDates.length < 14) {
      return null;
    }

    const recentData = uniqueDates.flatMap(dateKey => dataByDate.get(dateKey)!);

    // Use the most recent signal's date as reference for today
    const today = sortedData[0].timestamp;
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Aggregate revenue by menu item
    const menuItemRevenue = new Map<string, { name: string; totalRevenue: number }>();
    
    recentData.forEach(item => {
      const existing = menuItemRevenue.get(item.menuItemId);
      if (existing) {
        existing.totalRevenue += item.revenue;
      } else {
        menuItemRevenue.set(item.menuItemId, {
          name: item.menuItemName,
          totalRevenue: item.revenue
        });
      }
    });

    // 🔒 FROZEN: Minimum unique menu items requirement (DO NOT MODIFY WITHOUT TEST UPDATES)
    if (menuItemRevenue.size < 5) {
      return null;
    }

    // Sort by revenue (highest first) and get top 3
    const sortedItems = Array.from(menuItemRevenue.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const top3Items = sortedItems.slice(0, 3);
    const totalRevenue = sortedItems.reduce((sum, item) => sum + item.totalRevenue, 0);
    const top3Revenue = top3Items.reduce((sum, item) => sum + item.totalRevenue, 0);
    
    // PART 1: Safe division guard - prevent division by zero
    if (!totalRevenue || totalRevenue <= 0) {
      return null;
    }
    
    const concentrationPercentage = (top3Revenue / totalRevenue) * 100;
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(concentrationPercentage) || !isFinite(concentrationPercentage)) {
      return null;
    }

    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input, 'cafe_restaurant');
    const useThaiSME = isThaiSMEContext(input);
    
    let informationalThreshold: number;
    let warningThreshold: number;
    let criticalThreshold: number;
    
    if (useThaiSME && businessType === 'fnb') {
      const thresholds = getThresholds('fnb') as { top3RevenueWarning?: number; top3RevenueCritical?: number };
      informationalThreshold = 35;
      warningThreshold = (thresholds.top3RevenueWarning ?? 0.65) * 100;
      criticalThreshold = (thresholds.top3RevenueCritical ?? 0.75) * 100;
    } else {
      // Use default thresholds
      informationalThreshold = 40;
      warningThreshold = 55;
      criticalThreshold = 70;
    }

    // 🔒 FROZEN: Severity thresholds logic (now using resolved thresholds)
    // Thresholds are intentional and must match test expectations exactly
    let severity: AlertSeverity;
    if (concentrationPercentage >= criticalThreshold) {
      severity = 'critical';
    } else if (concentrationPercentage >= warningThreshold) {
      severity = 'warning';
    } else if (concentrationPercentage >= informationalThreshold) {
      severity = 'informational';
    } else {
      return null; // Below threshold, no alert needed
    }

    // Count unique days in the data
    const uniqueDays = new Set(menuItemData.map(item => item.timestamp.toISOString().split('T')[0])).size;
    const confidence = this.calculateConfidence(uniqueDays, menuItemRevenue.size);
    const { message, recommendations } = this.generateMessageAndRecommendations(
      concentrationPercentage,
      top3Items,
      severity
    );

    const contributingFactors = this.generateContributingFactors(
      concentrationPercentage,
      top3Items,
      totalRevenue,
      menuItemRevenue.size
    );

    // Transform contributingFactors from impact/direction format to weight format for AlertContract
    const contributingFactorsWithWeight = contributingFactors.map(factor => ({
      factor: factor.factor,
      weight: factor.impact === 'high' ? 0.8 : factor.impact === 'medium' ? 0.5 : 0.3
    }));

    return {
      id: `menu-revenue-concentration-v2-${Date.now()}`,
      timestamp: today,
      type: 'risk' as AlertType,
      severity,
      domain: 'risk' as AlertDomain,
      timeHorizon: 'near-term' as TimeHorizon,
      relevanceWindow: {
        start: cutoffDate,
        end: today
      },
      scope: 'cafe_restaurant', // 🔒 FROZEN: Scope must remain "cafe_restaurant" (DO NOT MODIFY WITHOUT TEST UPDATES)
      category: 'demand',
      confidence,
      message,
      conditions: [
        `Top 3 Menu Items Revenue Share: ${concentrationPercentage.toFixed(1)}%`,
        `Total Menu Items Analyzed: ${menuItemRevenue.size}`,
        `Analysis Period: 14 days`,
        `Top Item: ${top3Items[0].name} (${totalRevenue > 0 && isFinite((top3Items[0].totalRevenue / totalRevenue) * 100) ? ((top3Items[0].totalRevenue / totalRevenue) * 100).toFixed(1) : '0.0'}%)`,
        `Second Item: ${top3Items[1].name} (${totalRevenue > 0 && isFinite((top3Items[1].totalRevenue / totalRevenue) * 100) ? ((top3Items[1].totalRevenue / totalRevenue) * 100).toFixed(1) : '0.0'}%)`,
        `Third Item: ${top3Items[2].name} (${totalRevenue > 0 && isFinite((top3Items[2].totalRevenue / totalRevenue) * 100) ? ((top3Items[2].totalRevenue / totalRevenue) * 100).toFixed(1) : '0.0'}%)`
      ],
      contributingFactors: contributingFactorsWithWeight,
      recommendations
    } as AlertContract & { scope: string; category: string; recommendations: string[] };
  }

  // 🔒 FROZEN: Confidence calculation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Formula is canonical: base 0.65, +0.005 per extra day, +0.01 per extra item, capped at 0.95
  private calculateConfidence(dataPoints: number, uniqueItems: number): number {
    let confidence = 0.65; // Base confidence for menu analysis

    // Bonus for more data points (beyond minimum 14)
    const extraDays = dataPoints - 14;
    confidence += extraDays * 0.005; // +0.005 per extra day

    // Bonus for menu diversity (beyond minimum 5 items)
    const extraItems = uniqueItems - 5;
    confidence += extraItems * 0.01; // +0.01 per extra item

    // Round to avoid floating point precision issues
    confidence = Math.round(confidence * 1000) / 1000;
    
    return Math.min(0.95, Math.max(0.65, confidence));
  }

  // 🔒 FROZEN: Message and recommendation generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Message format and recommendation strings are test-locked and must match expectations exactly
  private generateMessageAndRecommendations(
    concentrationPercentage: number,
    top3Items: Array<{ id: string; name: string; totalRevenue: number }>,
    severity: AlertSeverity
  ): { message: string; recommendations: string[] } {
    const concentrationText = `${concentrationPercentage.toFixed(1)}%`;
    const topItemName = top3Items[0].name;

    let message: string;
    let recommendations: string[];

    if (severity === 'critical') {
      message = `Critical menu revenue concentration risk detected. Top 3 menu items account for ${concentrationText} of total revenue, with "${topItemName}" being the dominant performer. This creates significant vulnerability to demand shifts.`;
      recommendations = [
        'Immediately diversify menu offerings to reduce dependency on top performers',
        'Develop promotional campaigns for underperforming menu items',
        'Consider seasonal menu rotations to test new high-potential items',
        'Analyze customer preferences to identify opportunities for menu expansion',
        'Implement dynamic pricing strategies to balance item popularity',
        'Create combo deals that include both popular and less popular items'
      ];
    } else if (severity === 'warning') {
      message = `Significant menu revenue concentration detected. Top 3 menu items generate ${concentrationText} of total revenue, with "${topItemName}" leading performance. Consider diversification strategies to reduce risk.`;
      recommendations = [
        'Develop marketing strategies to promote underperforming menu items',
        'Analyze customer feedback to improve less popular items',
        'Consider limited-time offers to test new menu additions',
        'Review pricing strategy for underperforming items',
        'Train staff to upsell diverse menu options',
        'Monitor competitor menu strategies and customer preferences'
      ];
    } else {
      message = `Moderate menu revenue concentration observed. Top 3 menu items contribute ${concentrationText} of total revenue, with "${topItemName}" as the top performer. Monitor for increasing concentration trends.`;
      recommendations = [
        'Continue monitoring menu performance trends and customer preferences',
        'Maintain balanced promotion of all menu items',
        'Regularly review and refresh menu offerings',
        'Gather customer feedback on menu variety and satisfaction',
        'Consider seasonal adjustments to menu mix',
        'Track performance metrics for early detection of concentration increases'
      ];
    }

    return { message, recommendations };
  }

  // 🔒 FROZEN: Contributing factors generation (DO NOT MODIFY WITHOUT TEST UPDATES)
  // Factor structure (impact/direction), wording, and logic are test-locked
  private generateContributingFactors(
    concentrationPercentage: number,
    top3Items: Array<{ id: string; name: string; totalRevenue: number }>,
    totalRevenue: number,
    totalMenuItems: number
  ): Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> {
    const factors = [];

    // Top performer dominance
    // PART 1: Guard against division by zero
    if (!totalRevenue || totalRevenue <= 0) {
      return factors;
    }
    const topItemPercentage = (top3Items[0].totalRevenue / totalRevenue) * 100;
    
    // PART 3: Guard against NaN and Infinity
    if (isNaN(topItemPercentage) || !isFinite(topItemPercentage)) {
      return factors;
    }
    
    if (topItemPercentage > 30) {
      factors.push({
        factor: `Single menu item "${top3Items[0].name}" dominates with ${topItemPercentage.toFixed(1)}% of total revenue`,
        impact: 'high' as const,
        direction: 'negative' as const
      });
    } else if (topItemPercentage > 20) {
      factors.push({
        factor: `Top menu item "${top3Items[0].name}" accounts for ${topItemPercentage.toFixed(1)}% of total revenue`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    // Overall concentration level
    if (concentrationPercentage >= 60) {
      factors.push({
        factor: `High revenue concentration with top 3 items generating ${concentrationPercentage.toFixed(1)}% of total revenue`,
        impact: 'high' as const,
        direction: 'negative' as const
      });
    } else {
      factors.push({
        factor: `Moderate revenue concentration with top 3 items generating ${concentrationPercentage.toFixed(1)}% of total revenue`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    // Menu diversity factor
    if (totalMenuItems >= 15) {
      factors.push({
        factor: `Good menu diversity with ${totalMenuItems} unique items available`,
        impact: 'medium' as const,
        direction: 'positive' as const
      });
    } else if (totalMenuItems >= 10) {
      factors.push({
        factor: `Adequate menu diversity with ${totalMenuItems} unique items available`,
        impact: 'low' as const,
        direction: 'positive' as const
      });
    } else {
      factors.push({
        factor: `Limited menu diversity with only ${totalMenuItems} unique items available`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    // Performance gap between top items
    const secondItemPercentage = totalRevenue > 0 ? (top3Items[1].totalRevenue / totalRevenue) * 100 : 0;
    
    // PART 3: Guard against NaN and Infinity
    if (isNaN(secondItemPercentage) || !isFinite(secondItemPercentage)) {
      return factors;
    }
    
    const performanceGap = topItemPercentage - secondItemPercentage;
    
    // PART 3: Guard against NaN and Infinity
    if (isNaN(performanceGap) || !isFinite(performanceGap)) {
      return factors;
    }
    
    if (performanceGap > 15) {
      factors.push({
        factor: `Large performance gap of ${performanceGap.toFixed(1)}% between top two menu items`,
        impact: 'medium' as const,
        direction: 'negative' as const
      });
    }

    return factors;
  }
}
