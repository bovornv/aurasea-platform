// Mock SME OS service - returns mock alerts for skeleton
// This will be replaced with real logic later

import type { InputContract, OutputContract } from '../contracts';
import type { AlertContract } from '../contracts/alerts';
import { generateMockAlerts } from './mock-data-generator';

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
    const alerts = generateMockAlerts();

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
        reasoning: 'Evaluation completed based on provided inputs. Analysis considers cash flow patterns, resource utilization, and historical trends.',
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
        context: 'Analysis based on current business state and historical patterns',
        implications: 'Current trends suggest attention to cash flow management and resource optimization',
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
   * Get all active alerts (mock)
   */
  async getAlerts(): Promise<AlertContract[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return generateMockAlerts();
  }

  /**
   * Get business state summary (mock)
   */
  async getBusinessStateSummary(): Promise<{
    demandStatus: string;
    laborIntensityStatus: string;
    cashStressStatus: string;
    forecastReliability: string;
  }> {
    await new Promise(resolve => setTimeout(resolve, 30));
    const { generateBusinessStateSummary } = await import('./mock-data-generator');
    return generateBusinessStateSummary();
  }
}

// Singleton instance
export const mockSMEOS = new MockSMEOS();
