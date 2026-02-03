import { DemandDropExplainer } from '../demand-drop-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('DemandDropExplainer', () => {
  let explainer: DemandDropExplainer;

  beforeEach(() => {
    explainer = new DemandDropExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No demand drop detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.impactAnalysis.revenueImpact).toBe('No significant revenue impact detected');
      expect(result.impactAnalysis.occupancyImpact).toBe('No significant occupancy impact detected');
      expect(result.impactAnalysis.volumeImpact).toBe('No significant volume impact detected');
    });

    it('should explain alert with operational signals', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Demand indicators show 20.0% decline',
        confidence: 0.70,
        contributingFactors: [],
        conditions: []
      };

      const operationalSignals = [
        {
          timestamp: new Date(),
          revenue7Days: 8000,
          revenue30Days: 32000,
          occupancyRate: 0.7,
          customerVolume: 80
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
          occupancyRate: 0.8,
          customerVolume: 100
        }
      ];

      const result = explainer.explain(mockAlert, operationalSignals);
      
      expect(result.primaryFactor).toContain('20.0% decline');
      expect(result.contributingFactors).toHaveLength(3);
      expect(result.contributingFactors).toContain('Short-term revenue decline: 20.0%');
      expect(result.contributingFactors).toContain('Occupancy rate decline: 12.5%');
      expect(result.contributingFactors).toContain('Customer volume decline: 20.0%');
    });

    it('should identify primary factor correctly', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'risk',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Severe demand drop',
        confidence: 0.70,
        contributingFactors: [],
        conditions: []
      };

      const operationalSignals = [
        {
          timestamp: new Date(),
          revenue7Days: 6000, // 40% drop - highest
          revenue30Days: 36000, // 10% drop
          occupancyRate: 0.75, // 6.25% drop
          customerVolume: 85 // 15% drop
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
          occupancyRate: 0.8,
          customerVolume: 100
        }
      ];

      const result = explainer.explain(mockAlert, operationalSignals);
      
      expect(result.primaryFactor).toContain('40.0% decline in revenue (7-day)');
    });

    it('should detect acceleration in decline trend', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Accelerating decline',
        confidence: 0.70,
        contributingFactors: [],
        conditions: []
      };

      const operationalSignals = [
        {
          timestamp: new Date(),
          revenue7Days: 6000, // 40% drop
          revenue30Days: 36000, // 10% drop
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
        }
      ];

      const result = explainer.explain(mockAlert, operationalSignals);
      
      expect(result.contributingFactors).toContain('Recent acceleration in decline trend');
    });

    it('should detect sustained decline pattern', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Sustained decline',
        confidence: 0.70,
        contributingFactors: [],
        conditions: []
      };

      const operationalSignals = [
        {
          timestamp: new Date(),
          revenue7Days: 8500, // 15% drop
          revenue30Days: 28000, // 30% drop
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
        }
      ];

      const result = explainer.explain(mockAlert, operationalSignals);
      
      expect(result.contributingFactors).toContain('Sustained decline pattern over longer period');
    });

    it('should categorize impact levels correctly', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'critical',
        domain: 'risk',
        timeHorizon: 'immediate',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Severe impact',
        confidence: 0.70,
        contributingFactors: [],
        conditions: []
      };

      const operationalSignals = [
        {
          timestamp: new Date(),
          revenue7Days: 7000, // 30% drop - severe
          revenue30Days: 32000, // 20% drop - moderate
          occupancyRate: 0.78, // 2.5% drop - minor
          customerVolume: 100 // 0% drop - no impact
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
          occupancyRate: 0.8,
          customerVolume: 100
        }
      ];

      const result = explainer.explain(mockAlert, operationalSignals);
      
      expect(result.impactAnalysis.revenueImpact).toContain('Severe revenue impact: 30.0%');
      expect(result.impactAnalysis.occupancyImpact).toContain('Minor occupancy impact: 2.5%');
      expect(result.impactAnalysis.volumeImpact).toContain('No significant volume impact');
    });

    it('should handle missing optional data gracefully', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'risk',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        message: 'Revenue only decline',
        confidence: 0.70,
        contributingFactors: [],
        conditions: []
      };

      const operationalSignals = [
        {
          timestamp: new Date(),
          revenue7Days: 8000,
          revenue30Days: 32000
          // No occupancy or customer volume data
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000
        }
      ];

      const result = explainer.explain(mockAlert, operationalSignals);
      
      expect(result.contributingFactors).toHaveLength(1); // Only short-term revenue decline
      expect(result.impactAnalysis.occupancyImpact).toBe('No significant occupancy impact detected');
      expect(result.impactAnalysis.volumeImpact).toBe('No significant volume impact detected');
    });
  });
});
