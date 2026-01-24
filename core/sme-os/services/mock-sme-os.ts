// Mock SME OS service - returns mock alerts for skeleton
// This will be replaced with real logic later

import type { InputContract, OutputContract } from '../contracts';
import type { AlertContract } from '../contracts/alerts';

/**
 * Mock SME OS service that returns mock alerts
 * This is a placeholder until real decision logic is implemented
 */
export class MockSMEOS {
  /**
   * Evaluate a scenario and return mock outputs
   */
  async evaluate(input: InputContract): Promise<OutputContract> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate mock alerts
    const alerts = this.generateMockAlerts();

    return {
      evaluation: {
        scenarioId: `scenario-${Date.now()}`,
        timestamp: new Date(),
        confidence: 0.85,
        dataQuality: 0.90,
        modelCertainty: 0.80,
      },
      alerts,
      explanation: {
        reasoning: 'Mock evaluation completed. This is placeholder output.',
        contributingFactors: [
          {
            factor: 'Cash flow patterns',
            impact: 'high',
            direction: 'negative',
          },
          {
            factor: 'Resource utilization',
            impact: 'medium',
            direction: 'positive',
          },
        ],
        context: 'Mock context for skeleton demonstration',
        implications: 'Mock implications for skeleton demonstration',
      },
      recommendations: [
        {
          type: 'monitor',
          description: 'Monitor cash flow trends closely',
          timeHorizon: 'near-term',
          tradeoffs: {
            benefits: ['Early detection of issues'],
            costs: ['Requires regular review'],
          },
        },
      ],
    };
  }

  /**
   * Generate mock alerts for demonstration
   */
  private generateMockAlerts(): AlertContract[] {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    return [
      {
        id: 'alert-1',
        timestamp: now,
        type: 'risk',
        severity: 'warning',
        domain: 'cash',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: now,
          end: tomorrow,
        },
        message: 'Cash flow projection indicates potential shortfall in the next 7 days',
        confidence: 0.75,
        contributingFactors: [
          { factor: 'Reduced revenue trend', weight: 0.6 },
          { factor: 'Increased operational costs', weight: 0.4 },
        ],
        conditions: ['Revenue below historical average', 'Costs above baseline'],
      },
      {
        id: 'alert-2',
        timestamp: now,
        type: 'opportunity',
        severity: 'informational',
        domain: 'labor',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: now,
          end: nextWeek,
        },
        message: 'Resource utilization patterns suggest optimization opportunity',
        confidence: 0.65,
        contributingFactors: [
          { factor: 'Underutilized capacity', weight: 0.7 },
          { factor: 'Peak demand patterns', weight: 0.3 },
        ],
        conditions: ['Consistent low utilization periods detected'],
      },
      {
        id: 'alert-3',
        timestamp: now,
        type: 'anomaly',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: now,
          end: tomorrow,
        },
        message: 'Unusual pattern detected in historical data',
        confidence: 0.55,
        contributingFactors: [
          { factor: 'Data variance', weight: 0.8 },
          { factor: 'External factors', weight: 0.2 },
        ],
        conditions: ['Statistical outlier detected'],
      },
    ];
  }

  /**
   * Get all active alerts (mock)
   */
  async getAlerts(): Promise<AlertContract[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return this.generateMockAlerts();
  }
}

// Singleton instance
export const mockSMEOS = new MockSMEOS();
