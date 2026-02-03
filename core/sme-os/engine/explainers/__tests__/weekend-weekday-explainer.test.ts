import { WeekendWeekdayExplainer } from '../weekend-weekday-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('WeekendWeekdayExplainer', () => {
  let explainer: WeekendWeekdayExplainer;

  beforeEach(() => {
    explainer = new WeekendWeekdayExplainer();
  });

  describe('explain', () => {
    it('should handle null alert', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No weekend-weekday imbalance detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.pricingAnalysis.weekendPremium).toBe('No premium analysis available');
      expect(result.pricingAnalysis.occupancyPattern).toBe('No occupancy pattern detected');
      expect(result.pricingAnalysis.revenueEfficiency).toBe('No efficiency analysis available');
      expect(result.recommendations.immediate).toEqual([]);
      expect(result.recommendations.strategic).toEqual([]);
    });

    it('should explain underpriced weekends alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Weekend demand exceeds pricing: 85.0% occupancy with only 1.20x weekday premium',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const weekendData = [
        { timestamp: new Date(), dailyRevenue: 1200, occupancyRate: 0.85, averageDailyRate: 1400 },
        { timestamp: new Date(), dailyRevenue: 1250, occupancyRate: 0.87, averageDailyRate: 1450 }
      ];

      const weekdayData = [
        { timestamp: new Date(), dailyRevenue: 1000, occupancyRate: 0.60, averageDailyRate: 1200 },
        { timestamp: new Date(), dailyRevenue: 1050, occupancyRate: 0.65, averageDailyRate: 1250 }
      ];

      const result = explainer.explain(mockAlert, weekendData, weekdayData);
      
      expect(result.primaryFactor).toContain('Weekend rates are underpriced');
      expect(result.primaryFactor).toContain('86.0% occupancy');
      expect(result.contributingFactors.some(f => f.includes('Low weekend premium') && f.includes('underpricing'))).toBe(true);
      expect(result.recommendations.immediate.some(r => r.includes('weekend rate increase'))).toBe(true);
      expect(result.recommendations.strategic.some(r => r.includes('dynamic weekend pricing'))).toBe(true);
    });

    it('should explain overpriced weekends alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Weekend pricing may be limiting demand: 45.0% occupancy with 2.20x weekday premium',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const weekendData = [
        { timestamp: new Date(), dailyRevenue: 2200, occupancyRate: 0.45, averageDailyRate: 2500 }
      ];

      const weekdayData = [
        { timestamp: new Date(), dailyRevenue: 1000, occupancyRate: 0.70, averageDailyRate: 1200 }
      ];

      const result = explainer.explain(mockAlert, weekendData, weekdayData);
      
      expect(result.primaryFactor).toContain('Weekend rates may be too high');
      expect(result.primaryFactor).toContain('45.0% occupancy');
      expect(result.contributingFactors.some(f => f.includes('High weekend premium') && f.includes('limiting demand'))).toBe(true);
      expect(result.recommendations.immediate.some(r => r.includes('weekend rate reduction') || r.includes('weekend value packages'))).toBe(true);
      expect(result.recommendations.strategic.some(r => r.includes('leisure market segments'))).toBe(true);
    });

    it('should explain weekday leakage alert', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Weekday occupancy significantly higher than weekends: 25.0% difference indicates demand leakage',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const weekendData = [
        { timestamp: new Date(), dailyRevenue: 1000, occupancyRate: 0.50, averageDailyRate: 1300 }
      ];

      const weekdayData = [
        { timestamp: new Date(), dailyRevenue: 1200, occupancyRate: 0.75, averageDailyRate: 1400 }
      ];

      const result = explainer.explain(mockAlert, weekendData, weekdayData);
      
      expect(result.primaryFactor).toContain('Weekday occupancy exceeds weekend by 25.0%');
      expect(result.contributingFactors).toContain('Strong weekday performance indicates business travel or local demand base');
      expect(result.recommendations.immediate).toContain('Launch weekend promotion campaign');
      expect(result.recommendations.strategic).toContain('Develop weekend leisure packages and experiences');
    });

    it('should analyze pricing patterns correctly', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Weekend demand exceeds pricing',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const weekendData = [
        { timestamp: new Date(), dailyRevenue: 1500, occupancyRate: 0.80, averageDailyRate: 1800 }
      ];

      const weekdayData = [
        { timestamp: new Date(), dailyRevenue: 1000, occupancyRate: 0.70, averageDailyRate: 1200 }
      ];

      const result = explainer.explain(mockAlert, weekendData, weekdayData);
      
      expect(result.pricingAnalysis.weekendPremium).toContain('Premium ratio within typical range');
      expect(result.pricingAnalysis.occupancyPattern).toContain('Weekend-focused demand: 10.0% higher weekend occupancy');
      expect(result.pricingAnalysis.revenueEfficiency).toContain('Weekend periods show higher revenue efficiency');
    });

    it('should detect significant occupancy variance', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'warning',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Weekend-weekday imbalance detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const weekendData = [
        { timestamp: new Date(), dailyRevenue: 1200, occupancyRate: 0.85, averageDailyRate: 1400 }
      ];

      const weekdayData = [
        { timestamp: new Date(), dailyRevenue: 1000, occupancyRate: 0.60, averageDailyRate: 1200 }
      ];

      const result = explainer.explain(mockAlert, weekendData, weekdayData);
      
      expect(result.contributingFactors).toContain('Significant occupancy variance: 25.0% difference between periods');
    });

    it('should handle missing data gracefully', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'General imbalance detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Weekend-weekday pricing imbalance detected with 1.00x premium ratio');
      
      // Check that missing-data messaging appears in at least one location
      const hasDataPatternMessage = 
        result.primaryFactor.includes('Weekend-weekday') ||
        result.contributingFactors.some(f => f.includes('Weekend-weekday demand patterns') || f.includes('pricing optimization')) ||
        result.recommendations.immediate.some(r => r.includes('booking patterns') || r.includes('day of week'));
      
      expect(hasDataPatternMessage).toBe(true);
      expect(result.recommendations.immediate.some(r => r.includes('booking patterns') || r.includes('day of week'))).toBe(true);
    });

    it('should detect ADR and revenue premium misalignment', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'Weekend-weekday imbalance detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const weekendData = [
        { timestamp: new Date(), dailyRevenue: 1500, occupancyRate: 0.75, averageDailyRate: 2400 } // High ADR
      ];

      const weekdayData = [
        { timestamp: new Date(), dailyRevenue: 1000, occupancyRate: 0.70, averageDailyRate: 1200 } // Normal ADR
      ];

      const result = explainer.explain(mockAlert, weekendData, weekdayData);
      
      expect(result.contributingFactors).toContain('ADR ratio (2.00x) differs from revenue premium, suggesting volume effects');
    });

    it('should provide appropriate recommendations for general imbalance', () => {
      const mockAlert: AlertContract = {
        id: 'test-alert',
        timestamp: new Date(),
        type: 'opportunity',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        },
        message: 'General imbalance detected',
        confidence: 0.75,
        contributingFactors: [],
        conditions: []
      };

      const result = explainer.explain(mockAlert);
      
      expect(result.recommendations.immediate).toContain('Analyze booking patterns by day of week');
      expect(result.recommendations.strategic).toContain('Implement day-of-week pricing strategy');
    });
  });
});
