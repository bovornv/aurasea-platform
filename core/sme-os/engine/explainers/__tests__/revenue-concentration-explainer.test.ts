import { RevenueConcentrationExplainer } from '../revenue-concentration-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('RevenueConcentrationExplainer', () => {
  let explainer: RevenueConcentrationExplainer;

  beforeEach(() => {
    explainer = new RevenueConcentrationExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No revenue concentration risk detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.concentrationAnalysis.weekendShare).toBe('No weekend revenue analysis available');
      expect(result.concentrationAnalysis.topDayConcentration).toBe('No top-day concentration analysis available');
      expect(result.concentrationAnalysis.riskLevel).toBe('No risk assessment available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain weekend concentration alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'High weekend revenue concentration: 70.0% of revenue from weekends creates vulnerability',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 70.0%',
          'Top-5 day concentration: 45.0%',
          'Total revenue analyzed: $100,000',
          'Data points: 28 days',
          'Recommendations: Develop weekday revenue streams and corporate partnerships'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Weekend revenue concentration risk');
      expect(result.primaryFactor).toContain('70.0%');
      expect(result.contributingFactors.some(f => f.includes('weekend concentration') && f.includes('70.0%'))).toBe(true);
      expect(result.recommendations.immediate).toContain('Increase weekday marketing efforts');
      expect(result.recommendations.strategic).toContain('Develop comprehensive weekday revenue strategy');
    });

    it('should explain top-day concentration alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'High top-day revenue concentration: 60.0% of revenue from top 5 days creates risk',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 50.0%',
          'Top-5 day concentration: 60.0%',
          'Total revenue analyzed: $100,000',
          'Data points: 28 days',
          'Recommendations: Implement revenue smoothing strategies and demand spreading'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Top-day revenue concentration risk');
      expect(result.primaryFactor).toContain('60.0%');
      expect(result.contributingFactors).toContain('High top-day concentration: 60.0% in top 5 days indicates significant risk');
      expect(result.recommendations.immediate).toContain('Develop demand smoothing strategies');
      expect(result.recommendations.strategic).toContain('Implement revenue management best practices');
    });

    it('should explain critical dual concentration alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Dual concentration risk: 80.0% weekend share and 70.0% top-day concentration',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 80.0%',
          'Top-5 day concentration: 70.0%',
          'Total revenue analyzed: $100,000',
          'Data points: 28 days',
          'Recommendations: Implement comprehensive revenue diversification strategy across time periods'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Dual concentration risk');
      expect(result.primaryFactor).toContain('80.0%');
      expect(result.primaryFactor).toContain('70.0%');
      expect(result.contributingFactors).toContain('Combined weekend and top-day concentration amplifies business vulnerability');
      expect(result.recommendations.immediate).toContain('Launch immediate weekday promotion campaigns');
      expect(result.recommendations.strategic).toContain('Develop comprehensive weekday revenue strategy');
    });

    it('should analyze concentration levels correctly', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Revenue concentration detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 58.0%',
          'Top-5 day concentration: 48.0%',
          'Total revenue analyzed: $100,000',
          'Data points: 28 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.concentrationAnalysis.weekendShare).toContain('Moderate weekend concentration at 58.0%');
      expect(result.concentrationAnalysis.topDayConcentration).toContain('Moderate top-day concentration at 48.0%');
      expect(result.concentrationAnalysis.riskLevel).toContain('Informational level requiring monitoring');
    });

    it('should handle revenue data input', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Revenue concentration detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const revenueData = [
        { timestamp: new Date(), dailyRevenue: 5000 }, // Weekend
        { timestamp: new Date(), dailyRevenue: 2000 }, // Weekday
        { timestamp: new Date(), dailyRevenue: 4500 }, // Weekend
        { timestamp: new Date(), dailyRevenue: 1800 }, // Weekday
        { timestamp: new Date(), dailyRevenue: 4800 }  // Weekend
      ];

      const result = explainer.explain(mockAlert, revenueData);
      
      expect(result.primaryFactor).toMatch(/concentration/i);
      expect(result.contributingFactors.length).toBeGreaterThan(0);
    });

    it('should provide appropriate recommendations for critical concentration', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'High weekend revenue concentration',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 80.0%',
          'Top-5 day concentration: 50.0%'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate).toContain('Launch immediate weekday promotion campaigns');
      expect(result.recommendations.strategic).toContain('Develop comprehensive weekday revenue strategy');
    });

    it('should handle general concentration patterns', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Revenue concentration detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Revenue concentration detected');
      expect(result.recommendations.immediate).toContain('Analyze revenue distribution patterns');
      expect(result.recommendations.strategic).toContain('Develop revenue diversification strategy');
    });

    it('should detect extreme concentration levels', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Extreme concentration',
        confidence: 0.90,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 85.0%',
          'Top-5 day concentration: 75.0%'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.contributingFactors).toContain('Extreme weekend dependency: 85.0% concentration creates severe vulnerability');
      expect(result.contributingFactors).toContain('Extreme top-day concentration: 75.0% in top 5 days creates severe risk');
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
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Revenue concentration detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Weekend revenue share: 58.0%',
          'Top-5 day concentration: 48.0%'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate.some(r => r.includes('weekday promotional') || r.includes('weekday market'))).toBe(true);
      expect(result.recommendations.strategic.some(r => r.includes('weekday revenue strategy'))).toBe(true);
    });
  });
});
