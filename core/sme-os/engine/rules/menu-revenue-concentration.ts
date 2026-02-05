import { AlertContract, AlertSeverity, AlertType, AlertDomain, TimeHorizon } from '../../contracts/alerts';
import { InputContract } from '../../contracts/inputs';

export class MenuRevenueConcentrationRule {
  evaluate(input: InputContract, menuItemData?: Array<{
    timestamp: Date;
    menuItemId: string;
    menuItemName: string;
    revenue: number;
  }>): AlertContract | null {
    if (!menuItemData || menuItemData.length < 14) {
      return null;
    }

    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    // Filter to last 14 days
    const recentData = menuItemData.filter(item => 
      item.timestamp >= cutoffDate
    );

    if (recentData.length < 14) {
      return null;
    }

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

    // Check minimum unique menu items requirement
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
    const concentrationPercentage = (top3Revenue / totalRevenue) * 100;

    // Determine severity based on thresholds
    let severity: AlertSeverity;
    if (concentrationPercentage >= 70) {
      severity = 'critical';
    } else if (concentrationPercentage >= 55) {
      severity = 'warning';
    } else if (concentrationPercentage >= 40) {
      severity = 'informational';
    } else {
      return null; // Below threshold, no alert needed
    }

    const confidence = this.calculateConfidence(recentData.length, menuItemRevenue.size);
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

    return {
      id: `menu-revenue-concentration-${Date.now()}`,
      timestamp: today,
      type: 'risk' as AlertType,
      severity,
      domain: 'risk' as AlertDomain,
      timeHorizon: 'near-term' as TimeHorizon,
      relevanceWindow: {
        start: cutoffDate,
        end: today
      },
      scope: 'cafe_restaurant',
      category: 'demand',
      confidence,
      message,
      conditions: [
        `Top 3 Menu Items Revenue Share: ${concentrationPercentage.toFixed(1)}%`,
        `Total Menu Items Analyzed: ${menuItemRevenue.size}`,
        `Analysis Period: 14 days`,
        `Top Item: ${top3Items[0].name} (${((top3Items[0].totalRevenue / totalRevenue) * 100).toFixed(1)}%)`,
        `Second Item: ${top3Items[1].name} (${((top3Items[1].totalRevenue / totalRevenue) * 100).toFixed(1)}%)`,
        `Third Item: ${top3Items[2].name} (${((top3Items[2].totalRevenue / totalRevenue) * 100).toFixed(1)}%)`
      ],
      contributingFactors,
      recommendations
    } as AlertContract & { scope: string; category: string; recommendations: string[] };
  }

  private calculateConfidence(dataPoints: number, uniqueItems: number): number {
    let confidence = 0.65; // Base confidence for menu analysis

    // Bonus for more data points (beyond minimum 14)
    const extraDays = dataPoints - 14;
    confidence += extraDays * 0.005; // +0.005 per extra day

    // Bonus for menu diversity (beyond minimum 5 items)
    const extraItems = uniqueItems - 5;
    confidence += extraItems * 0.01; // +0.01 per extra item

    return Math.min(0.95, Math.max(0.65, confidence));
  }

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

  private generateContributingFactors(
    concentrationPercentage: number,
    top3Items: Array<{ id: string; name: string; totalRevenue: number }>,
    totalRevenue: number,
    totalMenuItems: number
  ): Array<{ factor: string; impact: 'high' | 'medium' | 'low'; direction: 'positive' | 'negative' }> {
    const factors = [];

    // Top performer dominance
    const topItemPercentage = (top3Items[0].totalRevenue / totalRevenue) * 100;
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
    const secondItemPercentage = (top3Items[1].totalRevenue / totalRevenue) * 100;
    const performanceGap = topItemPercentage - secondItemPercentage;
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
