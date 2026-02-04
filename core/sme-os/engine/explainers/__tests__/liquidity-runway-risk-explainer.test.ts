import { LiquidityRunwayRiskExplainer } from '../liquidity-runway-risk-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('LiquidityRunwayRiskExplainer', () => {
  let explainer: LiquidityRunwayRiskExplainer;

  beforeEach(() => {
    explainer = new LiquidityRunwayRiskExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No liquidity runway risk detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.liquidityAnalysis.runwayAssessment).toBe('No runway analysis available');
      expect(result.liquidityAnalysis.burnRateAnalysis).toBe('No burn rate analysis available');
      expect(result.liquidityAnalysis.riskLevel).toBe('No risk assessment available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain critical liquidity alert', () => {
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
        message: 'Liquidity runway risk: 2.5 months of cash remaining at current burn rate',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Estimated runway: 2.5 months',
          'Cash balance: $50,000',
          'Average monthly burn: $20,000',
          'Data points: 60 days',
          'Recommendations: Implement immediate cash preservation and secure emergency financing'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Critical liquidity risk');
      expect(result.primaryFactor).toContain('2.5 months');
      expect(result.contributingFactors).toContain('Critical runway shortage requires immediate action');
      expect(result.recommendations.immediate).toContain('Implement emergency cash preservation');
      expect(result.recommendations.strategic).toContain('Develop comprehensive liquidity management strategy');
    });

    it('should explain warning liquidity alert', () => {
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
        message: 'Liquidity runway risk: 5.0 months of cash remaining at current burn rate',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Estimated runway: 5.0 months',
          'Cash balance: $100,000',
          'Average monthly burn: $20,000',
          'Data points: 90 days',
          'Recommendations: Implement cost control measures and prepare funding options'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Warning liquidity risk');
      expect(result.primaryFactor).toContain('5.0 months');
      expect(result.recommendations.immediate).toContain('Implement cost reduction strategies');
      expect(result.recommendations.strategic).toContain('Prepare funding and financing options');
    });

    it('should explain informational liquidity alert', () => {
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
        message: 'Liquidity runway risk: 10.0 months of cash remaining at current burn rate',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Estimated runway: 10.0 months',
          'Cash balance: $200,000',
          'Average monthly burn: $20,000',
          'Data points: 120 days',
          'Recommendations: Monitor cash flow patterns and develop contingency planning'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Moderate liquidity risk');
      expect(result.primaryFactor).toContain('10.0 months');
      expect(result.recommendations.immediate).toContain('Monitor cash flow trends');
      expect(result.recommendations.strategic).toContain('Develop cash flow forecasting capabilities');
    });

    it('should analyze liquidity patterns correctly', () => {
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
        message: 'Liquidity runway risk',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Estimated runway: 4.0 months',
          'Cash balance: $80,000',
          'Average monthly burn: $20,000',
          'Data points: 90 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.liquidityAnalysis.runwayAssessment).toContain('Warning level runway at 4.0 months');
      expect(result.liquidityAnalysis.burnRateAnalysis).toContain('Monthly burn rate of $20,000');
      expect(result.liquidityAnalysis.riskLevel).toContain('Warning level risk requiring near-term action');
    });

    it('should handle cash flow data input', () => {
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
        message: 'Liquidity runway risk',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const cashFlowData = Array(60).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        cashBalance: 100000 - (i * 500),
        netCashFlow: -500
      }));

      const result = explainer.explain(mockAlert, cashFlowData);
      
      expect(result.primaryFactor).toMatch(/liquidity/i);
      expect(result.contributingFactors.length).toBeGreaterThan(0);
    });
  });
});
