import { SeasonalityRiskRule } from '../seasonality-risk';
import { InputContract } from '../../../contracts/inputs';

describe('SeasonalityRiskRule', () => {
  let rule: SeasonalityRiskRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new SeasonalityRiskRule();
    mockInput = {
      timePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-31'),
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

  const generateSeasonalRevenueSignals = (
    monthlyMultipliers: number[] = [1.0, 1.0, 1.0], // 3 months
    baseRevenue: number = 1000
  ) => {
    const signals = [];
    const today = new Date();
    
    // Generate 90+ days of data across multiple months
    for (let i = 0; i < 100; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      const monthIndex = Math.floor(i / 30) % monthlyMultipliers.length;
      const multiplier = monthlyMultipliers[monthIndex];
      
      // Add some daily variance
      const dailyVariance = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: baseRevenue * multiplier * dailyVariance
      });
    }

    return signals;
  };

  describe('evaluate', () => {
    it('should return null when insufficient data provided', () => {
      const result = rule.evaluate(mockInput, []);
      expect(result).toBeNull();
    });

    it('should return null when less than 90 days of data', () => {
      const signals = generateSeasonalRevenueSignals().slice(0, 60);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect informational seasonality risk (moderate variation)', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 1.3, 0.8]); // 1.6x ratio

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('informational');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('medium-term');
      expect(result!.message).toContain('seasonality');
    });

    it('should detect warning seasonality risk (high variation)', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 2.0, 0.6]); // 3.3x ratio

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('seasonality');
    });

    it('should detect critical seasonality risk (extreme variation)', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 4.0, 0.5]); // 8x ratio

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('seasonality');
    });

    it('should return null for stable seasonal patterns', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 1.1, 0.95]); // 1.16x ratio

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should calculate confidence based on data completeness', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 2.0, 0.6]);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.70);
    });

    it('should include appropriate contributing factors', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 2.5, 0.5]);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThan(0);
      expect(result!.contributingFactors.some(f => f.factor.includes('Monthly revenue variation'))).toBe(true);
    });

    it('should include relevant conditions in alert', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 2.0, 0.6]);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Seasonality ratio:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Peak month:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Low month:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
    });

    it('should generate appropriate recommendations for high seasonality', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 3.0, 0.4]);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('seasonal planning'))).toBe(true);
    });

    it('should handle edge case with exactly 90 days of data', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 2.0, 0.6]).slice(0, 90);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points: 90 days'))).toBe(true);
    });

    it('should return null when total revenue is zero', () => {
      const signals = Array(100).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        dailyRevenue: 0
      }));

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should set confidence bonus for extra data points', () => {
      const signals = generateSeasonalRevenueSignals([1.0, 2.0, 0.6]);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.75);
    });

    it('should detect peak and low months correctly', () => {
      const signals = generateSeasonalRevenueSignals([0.5, 3.0, 1.0]); // Month 2 is peak, Month 1 is low
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Peak month:') && c.includes('Month 2'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Low month:') && c.includes('Month 1'))).toBe(true);
    });
  });
});
