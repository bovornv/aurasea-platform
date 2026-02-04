import { CashFlowVolatilityExplainer } from '../cash-flow-volatility-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('CashFlowVolatilityExplainer', () => {
  let explainer: CashFlowVolatilityExplainer;

  beforeEach(() => {
    explainer = new CashFlowVolatilityExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No cash flow volatility risk detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.volatilityAnalysis.variationLevel).toBe('No volatility analysis available');
      expect(result.volatilityAnalysis.patternType).toBe('No pattern analysis available');
      expect(result.volatilityAnalysis.riskLevel).toBe('No risk assessment available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain moderate volatility alert', () => {
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
        message: 'Moderate cash flow volatility detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Volatility (CV): 0.35',
          'Data points: 70 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      // These will initially fail - placeholder implementation
      expect(result.primaryFactor).toContain('volatility');
      expect(result.contributingFactors.length).toBeGreaterThan(0);
      expect(result.recommendations.immediate.length).toBeGreaterThan(0);
      expect(result.recommendations.strategic.length).toBeGreaterThan(0);
    });

    it('should explain high volatility alert', () => {
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
        message: 'High cash flow volatility detected',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Volatility (CV): 0.65',
          'Data points: 90 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      // These will initially fail - placeholder implementation
      expect(result.primaryFactor).toContain('volatility');
      expect(result.volatilityAnalysis.riskLevel).toContain('Warning');
    });

    it('should explain extreme volatility alert', () => {
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
        message: 'Extreme cash flow volatility detected',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Volatility (CV): 0.85',
          'Data points: 100 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      // These will initially fail - placeholder implementation
      expect(result.primaryFactor).toContain('volatility');
      expect(result.volatilityAnalysis.riskLevel).toContain('Critical');
    });
  });
});
