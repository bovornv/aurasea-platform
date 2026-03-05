/**
 * Accommodation Recommendation Engine
 * 
 * PART 5: Smart Recommendation Engine
 * Extracts and formats recommendations from alerts
 * 
 * Keep suggestions short and actionable.
 * No long reports.
 */

import type { AccommodationAlert } from './accommodation-intelligence-engine';

export interface Recommendation {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  alertType: string;
}

/**
 * Extract recommendations from alerts
 * Returns max 3 recommendations, prioritized by severity
 */
export function extractRecommendations(alerts: AccommodationAlert[]): Recommendation[] {
  // Sort alerts by severity (critical > warning > informational)
  const severityOrder = { critical: 0, warning: 1, informational: 2 };
  const sortedAlerts = [...alerts].sort((a, b) => 
    severityOrder[a.severity] - severityOrder[b.severity]
  );
  
  // Extract recommendations, max 3
  const recommendations: Recommendation[] = sortedAlerts
    .slice(0, 3)
    .map(alert => ({
      id: `rec_${alert.id}`,
      text: alert.recommendation,
      priority: alert.severity === 'critical' ? 'high' : 
                alert.severity === 'warning' ? 'medium' : 'low',
      alertType: alert.type,
    }));
  
  return recommendations;
}
