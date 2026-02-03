import { SeasonalityRiskExplainer } from '../seasonality-risk-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('SeasonalityRiskExplainer', () => {
  let explainer: SeasonalityRiskExplainer;

  beforeEach(() => {
    explainer = new SeasonalityRiskExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No seasonality risk detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.seasonalityAnalysis.variationLevel).toBe('No seasonality analysis available');
      expect(result.seasonalityAnalysis.peakPeriod).toBe('No peak period analysis available');
      expect(result.seasonalityAnalysis.riskLevel).toBe('No risk assessment available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain moderate seasonality alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Moderate revenue seasonality detected: 2.5x variation between peak and low months',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 2.5x',
          'Peak month: Month 2 ($50,000)',
          'Low month: Month 1 ($20,000)',
          'Data points: 100 days',
          'Recommendations: Develop seasonal planning and cash flow management'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Moderate seasonality risk');
      expect(result.primaryFactor).toContain('2.5x');
      expect(result.contributingFactors).toContain('Moderate seasonal variation: 2.5x ratio indicates emerging risk');
      expect(result.recommendations.immediate).toContain('Develop seasonal cash flow planning');
      expect(result.recommendations.strategic).toContain('Create seasonal revenue diversification strategy');
    });

    it('should explain high seasonality alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'High revenue seasonality detected: 4.0x variation between peak and low months',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 4.0x',
          'Peak month: Month 3 ($80,000)',
          'Low month: Month 1 ($20,000)',
          'Data points: 120 days',
          'Recommendations: Implement seasonal risk mitigation and revenue smoothing'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('High seasonality risk');
      expect(result.primaryFactor).toContain('4.0x');
      expect(result.contributingFactors).toContain('High seasonal variation: 4.0x ratio indicates significant risk');
      expect(result.recommendations.immediate).toContain('Implement seasonal pricing strategies');
      expect(result.recommendations.strategic).toContain('Develop counter-seasonal revenue streams');
    });

    it('should explain extreme seasonality alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Extreme revenue seasonality detected: 8.0x variation between peak and low months',
        confidence: 0.90,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 8.0x',
          'Peak month: Month 2 ($120,000)',
          'Low month: Month 1 ($15,000)',
          'Data points: 150 days',
          'Recommendations: Urgent seasonal risk management and diversification required'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Extreme seasonality risk');
      expect(result.primaryFactor).toContain('8.0x');
      expect(result.contributingFactors).toContain('Extreme seasonal variation: 8.0x ratio creates severe vulnerability');
      expect(result.recommendations.immediate).toContain('Implement emergency seasonal risk management');
      expect(result.recommendations.strategic).toContain('Develop comprehensive seasonal diversification strategy');
    });

    it('should analyze seasonality patterns correctly', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'High revenue seasonality detected',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 3.5x',
          'Peak month: Month 3 ($70,000)',
          'Low month: Month 1 ($20,000)',
          'Data points: 100 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.seasonalityAnalysis.variationLevel).toContain('High seasonal variation at 3.5x');
      expect(result.seasonalityAnalysis.peakPeriod).toContain('Peak revenue in Month 3');
      expect(result.seasonalityAnalysis.riskLevel).toContain('Warning level risk requiring near-term planning');
    });

    it('should handle revenue data input', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Seasonality detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const revenueData = Array(100).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        dailyRevenue: 1000 + (i % 30) * 100 // Seasonal pattern
      }));

      const result = explainer.explain(mockAlert, revenueData);
      
      expect(result.primaryFactor).toMatch(/seasonality/i);
      expect(result.contributingFactors.length).toBeGreaterThan(0);
    });

    it('should provide appropriate recommendations for critical seasonality', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Extreme seasonality',
        confidence: 0.90,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 10.0x'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate).toContain('Implement emergency seasonal risk management');
      expect(result.recommendations.strategic).toContain('Develop comprehensive seasonal diversification strategy');
    });

    it('should handle general seasonality patterns', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Seasonality detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Seasonality risk detected');
      expect(result.recommendations.immediate).toContain('Analyze seasonal revenue patterns');
      expect(result.recommendations.strategic).toContain('Develop seasonal planning strategy');
    });

    it('should detect peak and low period patterns', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'High seasonality',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 5.0x',
          'Peak month: Month 2 ($100,000)',
          'Low month: Month 3 ($20,000)'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.contributingFactors).toContain('Peak revenue concentration in Month 2 creates dependency risk');
      expect(result.contributingFactors).toContain('Low revenue period in Month 3 indicates vulnerability');
    });

    it('should provide informational level recommendations', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Moderate seasonality',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Seasonality ratio: 2.0x'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate).toContain('Develop seasonal cash flow planning');
      expect(result.recommendations.strategic).toContain('Create seasonal revenue diversification strategy');
    });
  });
});
