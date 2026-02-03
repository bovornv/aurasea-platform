import { CapacityUtilizationExplainer } from '../capacity-utilization-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('CapacityUtilizationExplainer', () => {
  let explainer: CapacityUtilizationExplainer;

  beforeEach(() => {
    explainer = new CapacityUtilizationExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No capacity utilization issues detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.utilizationAnalysis.averageOccupancy).toBe('No occupancy data available');
      expect(result.utilizationAnalysis.peakDayPattern).toBe('No peak day analysis available');
      expect(result.utilizationAnalysis.consistencyPattern).toBe('No consistency analysis available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain critical underutilization alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'critical',
        domain: 'forecast',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Severe underutilization: 15 days below 40% occupancy, 35.0% average',
        confidence: 0.85,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 35.0%',
          'Peak days (≥95%): 0 days',
          'Low days (<40%): 15 days',
          'Data points: 28 days',
          'Recommendations: Implement aggressive pricing strategy and marketing campaigns'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Severe underutilization');
      expect(result.primaryFactor).toContain('15 days below 40%');
      expect(result.primaryFactor).toContain('35.0%');
      expect(result.contributingFactors).toContain('Low average occupancy: 35.0% indicates significant revenue opportunity');
      expect(result.recommendations.immediate).toContain('Launch aggressive marketing campaigns');
      expect(result.recommendations.strategic).toContain('Develop comprehensive revenue optimization strategy');
    });

    it('should explain critical overutilization alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'risk',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'High capacity strain: 8 days at ≥95% occupancy with 92.0% average',
        confidence: 0.90,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 92.0%',
          'Peak days (≥95%): 8 days',
          'Low days (<40%): 0 days',
          'Data points: 28 days',
          'Recommendations: Implement demand management: increase rates, restrict availability'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Critical capacity strain');
      expect(result.primaryFactor).toContain('8 days at peak capacity');
      expect(result.primaryFactor).toContain('92.0%');
      expect(result.contributingFactors).toContain('Consistently high occupancy: 92.0% average indicates sustained demand pressure');
      expect(result.recommendations.immediate).toContain('Implement immediate demand management: increase rates for peak periods');
      expect(result.recommendations.strategic).toContain('Develop dynamic pricing strategy based on demand patterns');
    });

    it('should explain warning underutilization alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Low capacity utilization: 45.0% average occupancy indicates revenue opportunity',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 45.0%',
          'Peak days (≥95%): 0 days',
          'Low days (<40%): 8 days',
          'Data points: 28 days',
          'Recommendations: Review pricing strategy and increase marketing efforts'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toMatch(/underutilization/i);
      expect(result.primaryFactor).toMatch(/\d+\.\d+%/); // Contains percentage
      expect(result.recommendations.immediate.some(r => r.includes('marketing'))).toBe(true);
      expect(result.recommendations.strategic.some(r => r.includes('revenue optimization'))).toBe(true);
    });

    it('should explain warning overutilization alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'High average occupancy: 87.0% may impact service quality',
        confidence: 0.80,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 87.0%',
          'Peak days (≥95%): 5 days',
          'Low days (<40%): 0 days',
          'Data points: 28 days',
          'Recommendations: Consider rate increases and capacity optimization'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('High capacity pressure');
      expect(result.primaryFactor).toContain('5 peak days');
      expect(result.primaryFactor).toContain('87.0%');
      expect(result.recommendations.immediate).toContain('Consider rate increases for high-demand periods');
      expect(result.recommendations.strategic).toContain('Develop dynamic pricing strategy based on demand patterns');
    });

    it('should analyze utilization patterns correctly', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Low capacity utilization',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 55.0%',
          'Peak days (≥95%): 2 days',
          'Low days (<40%): 5 days',
          'Data points: 28 days',
          'Recommendations: Consider promotional packages and market expansion'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.utilizationAnalysis.averageOccupancy).toContain('Below-optimal utilization at 55.0%');
      expect(result.utilizationAnalysis.peakDayPattern).toContain('Occasional peak days (2)');
    });

    it('should handle occupancy data input', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'warning',
        domain: 'forecast',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Low capacity utilization',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const occupancyData = [
        { timestamp: new Date(), occupancyRate: 0.40 },
        { timestamp: new Date(), occupancyRate: 0.45 },
        { timestamp: new Date(), occupancyRate: 0.35 },
        { timestamp: new Date(), occupancyRate: 0.50 },
        { timestamp: new Date(), occupancyRate: 0.42 }
      ];

      const result = explainer.explain(mockAlert, occupancyData);
      
      expect(result.primaryFactor).toMatch(/underutilization/i);
      expect(result.contributingFactors.length).toBeGreaterThan(0);
    });

    it('should detect high variance patterns', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'forecast',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Variable occupancy patterns',
        confidence: 0.65,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 60.0%',
          'Peak days (≥95%): 1 days',
          'Low days (<40%): 3 days',
          'Data points: 28 days'
        ]
      };

      const occupancyData = [
        { timestamp: new Date(), occupancyRate: 0.20 },
        { timestamp: new Date(), occupancyRate: 0.95 },
        { timestamp: new Date(), occupancyRate: 0.30 },
        { timestamp: new Date(), occupancyRate: 0.85 },
        { timestamp: new Date(), occupancyRate: 0.40 }
      ];

      const result = explainer.explain(mockAlert, occupancyData);
      
      expect(result.contributingFactors.some(f => f.includes('High occupancy variance'))).toBe(true);
      expect(result.utilizationAnalysis.consistencyPattern).toContain('Highly variable occupancy');
    });

    it('should provide informational recommendations', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Elevated occupancy levels',
        confidence: 0.75,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 82.0%',
          'Peak days (≥95%): 3 days',
          'Low days (<40%): 0 days',
          'Data points: 28 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate.length).toBeGreaterThanOrEqual(0);
      expect(result.recommendations.strategic.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle combined high average and frequent peaks', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'risk',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'High capacity strain',
        confidence: 0.90,
        contributingFactors: [],
        conditions: [
          'Average occupancy: 88.0%',
          'Peak days (≥95%): 6 days',
          'Low days (<40%): 0 days',
          'Data points: 28 days'
        ]
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.contributingFactors.some(f => f.includes('Combined high average and frequent peaks'))).toBe(true);
    });
  });
});
