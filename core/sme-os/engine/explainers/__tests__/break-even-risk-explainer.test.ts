import { BreakEvenRiskExplainer } from '../break-even-risk-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('BreakEvenRiskExplainer', () => {
  let explainer: BreakEvenRiskExplainer;

  beforeEach(() => {
    explainer = new BreakEvenRiskExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No break-even risk detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.profitabilityAnalysis.breakEvenAssessment).toBe('No break-even analysis available');
      expect(result.profitabilityAnalysis.revenueGapAnalysis).toBe('No revenue gap analysis available');
      expect(result.profitabilityAnalysis.riskLevel).toBe('No risk assessment available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain critical break-even alert', () => {
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
        message: 'Critical break-even risk: 0.80 revenue-to-expense ratio with $-8,000 gap',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 0.80',
          'Revenue gap: $-8,000',
          'Total revenue: $32,000',
          'Total expenses: $40,000',
          'Data points: 40 days',
          'Recommendations: Implement immediate cost reduction and revenue enhancement strategies'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Critical break-even risk');
      expect(result.primaryFactor).toContain('0.80');
      expect(result.contributingFactors).toContain('Critical profitability shortfall: 0.80 ratio indicates severe financial stress');
      expect(result.recommendations.immediate).toContain('Implement emergency cost reduction measures');
      expect(result.recommendations.strategic).toContain('Develop comprehensive profitability improvement strategy');
    });

    it('should explain warning break-even alert', () => {
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
        message: 'Warning break-even risk: 0.95 revenue-to-expense ratio with $-2,000 gap',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 0.95',
          'Revenue gap: $-2,000',
          'Total revenue: $38,000',
          'Total expenses: $40,000',
          'Data points: 40 days',
          'Recommendations: Develop cost management and revenue optimization plans'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Warning break-even risk');
      expect(result.primaryFactor).toContain('0.95');
      expect(result.recommendations.immediate).toContain('Implement cost management strategies');
      expect(result.recommendations.strategic).toContain('Develop profitability enhancement plans');
    });

    it('should explain informational break-even alert', () => {
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
        message: 'Moderate break-even risk: 1.10 revenue-to-expense ratio with $4,000 gap',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 1.10',
          'Revenue gap: $4,000',
          'Total revenue: $44,000',
          'Total expenses: $40,000',
          'Data points: 40 days',
          'Recommendations: Monitor profitability trends and optimize operational efficiency'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Moderate break-even risk');
      expect(result.primaryFactor).toContain('1.10');
      expect(result.recommendations.immediate).toContain('Monitor profitability trends closely');
      expect(result.recommendations.strategic).toContain('Develop profitability forecasting capabilities');
    });

    it('should analyze profitability patterns correctly', () => {
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
        message: 'Break-even risk detected',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 0.92',
          'Revenue gap: $-3,200',
          'Total revenue: $36,800',
          'Total expenses: $40,000',
          'Data points: 40 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.profitabilityAnalysis.breakEvenAssessment).toContain('Warning level break-even risk at 0.92');
      expect(result.profitabilityAnalysis.revenueGapAnalysis).toContain('Operating at loss with $3,200');
      expect(result.profitabilityAnalysis.riskLevel).toContain('Warning level risk requiring near-term optimization');
    });

    it('should handle financial data input', () => {
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
        message: 'Break-even risk detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const financialData = Array(40).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        dailyRevenue: 900,
        dailyExpenses: 1000
      }));

      const result = explainer.explain(mockAlert, financialData);
      
      expect(result.primaryFactor).toMatch(/break-even/i);
      expect(result.contributingFactors.length).toBeGreaterThan(0);
    });

    it('should provide appropriate recommendations for critical break-even', () => {
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
        message: 'Critical break-even risk',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 0.75'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate).toContain('Implement emergency cost reduction measures');
      expect(result.recommendations.strategic).toContain('Develop comprehensive profitability improvement strategy');
    });

    it('should handle operating loss scenarios', () => {
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
        message: 'Critical break-even risk',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 0.70',
          'Revenue gap: $-12,000'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.contributingFactors).toContain('Operating loss: $12,000 negative gap requires immediate correction');
    });

    it('should handle minimal profit scenarios', () => {
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
        message: 'Moderate break-even risk',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Break-even ratio: 1.05',
          'Revenue gap: $2,000'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.contributingFactors).toContain('Narrow profit margin: 1.05 ratio provides limited financial buffer');
    });
  });
});
