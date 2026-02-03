import { DemandDropRule } from '../demand-drop';
import { InputContract } from '../../../contracts/inputs';

describe('DemandDropRule', () => {
  let rule: DemandDropRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new DemandDropRule();
    mockInput = {
      timePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
        granularity: 'day'
      },
      financial: {
        cashFlows: [],
        currentBalance: 100000,
        projectedBalance: 90000
      },
      operational: {
        resources: [],
        constraints: [],
        historicalPatterns: [],
        previousDecisions: []
      }
    };
  });

  describe('evaluate', () => {
    it('should return null when no operational signals provided', () => {
      const result = rule.evaluate(mockInput);
      expect(result).toBeNull();
    });

    it('should return null when insufficient operational signals provided', () => {
      const signals = [{
        timestamp: new Date(),
        revenue7Days: 10000,
        revenue30Days: 40000
      }];
      
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when no significant drop detected', () => {
      const signals = [
        {
          timestamp: new Date(),
          revenue7Days: 10000,
          revenue30Days: 40000,
          occupancyRate: 0.8,
          customerVolume: 100
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10500,
          revenue30Days: 42000,
          occupancyRate: 0.82,
          customerVolume: 105
        }
      ];
      
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should generate warning alert for moderate revenue drop', () => {
      const signals = [
        {
          timestamp: new Date(),
          revenue7Days: 8000, // 20% drop from 10000
          revenue30Days: 32000, // 20% drop from 40000
          occupancyRate: 0.7, // 12.5% drop from 0.8
          customerVolume: 80 // 20% drop from 100
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
          occupancyRate: 0.8,
          customerVolume: 100
        }
      ];
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('warning');
      expect(result!.domain).toBe('risk');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('20.0% decline');
      expect(result!.contributingFactors).toHaveLength(4);
    });

    it('should generate critical alert for severe revenue drop', () => {
      const signals = [
        {
          timestamp: new Date(),
          revenue7Days: 6500, // 35% drop
          revenue30Days: 26000, // 35% drop
          occupancyRate: 0.6, // 25% drop
          customerVolume: 70 // 30% drop
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000,
          occupancyRate: 0.8,
          customerVolume: 100
        }
      ];
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('35.0% decline');
    });

    it('should handle missing occupancy and customer volume data', () => {
      const signals = [
        {
          timestamp: new Date(),
          revenue7Days: 8000, // 20% drop
          revenue30Days: 32000 // 20% drop
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000
        }
      ];
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.contributingFactors).toHaveLength(2); // Only revenue factors
    });

    it('should generate alert based on 7-day revenue drop alone', () => {
      const signals = [
        {
          timestamp: new Date(),
          revenue7Days: 8000, // 20% drop
          revenue30Days: 39000 // 2.5% drop (not significant)
        },
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          revenue7Days: 10000,
          revenue30Days: 40000
        }
      ];
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.contributingFactors).toHaveLength(1);
      expect(result!.contributingFactors[0].factor).toBe('Recent revenue decline');
    });

    it('should set appropriate confidence level', () => {
      const signals = [
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
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(0.70);
    });

    it('should include relevant conditions in alert', () => {
      const signals = [
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
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions).toContain('7-day revenue change: -20.0%');
      expect(result!.conditions).toContain('30-day revenue change: -20.0%');
      expect(result!.conditions).toContain('Occupancy change: -12.5%');
      expect(result!.conditions).toContain('Customer volume change: -20.0%');
    });
  });
});
