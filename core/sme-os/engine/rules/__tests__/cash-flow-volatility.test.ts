import { CashFlowVolatilityRule } from '../cash-flow-volatility';
import { InputContract } from '../../../contracts/inputs';

describe('CashFlowVolatilityRule', () => {
  let rule: CashFlowVolatilityRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new CashFlowVolatilityRule();
    mockInput = {
      timePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-01'),
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

  /**
   * Generate deterministic revenue signals with guaranteed coefficient of variation (CV)
   * Uses alternating high/low pattern to achieve exact CV
   * CV = standardDeviation / mean
   * All signals are within the last 60+ days to ensure they pass date filtering
   */
  const generateDeterministicRevenueSignals = (
    meanRevenue: number = 1000,
    coefficientOfVariation: number = 0.3,
    days: number = 70
  ) => {
    const signals = [];
    const today = new Date();
    
    // Calculate standard deviation needed for target CV
    const standardDeviation = meanRevenue * coefficientOfVariation;
    
    // Create alternating pattern: [low, high, low, high, ...]
    // For mean = M and SD = S, use values [M - S, M + S]
    // This gives exact CV = S / M
    const lowValue = meanRevenue - standardDeviation;
    const highValue = meanRevenue + standardDeviation;
    
    // Generate signals going backwards from today
    // All signals will be within the valid date range for the rule
    for (let i = 0; i < days; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      // Alternate between low and high values
      const revenue = i % 2 === 0 ? lowValue : highValue;
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: Math.max(0, revenue) // Ensure non-negative
      });
    }

    return signals;
  };

  describe('evaluate', () => {
    it('should return null when insufficient data provided', () => {
      const result = rule.evaluate(mockInput, []);
      expect(result).toBeNull();
    });

    it('should return null when fewer than 60 days of revenue', () => {
      const signals = generateDeterministicRevenueSignals(1000, 0.4, 50);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when mean revenue is zero', () => {
      const signals = Array(70).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        dailyRevenue: 0
      }));

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when coefficient of variation < 0.25', () => {
      // Use CV = 0.2 (below threshold) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.2, 70);

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect informational volatility risk (CV 0.25-0.5)', () => {
      // Use CV = 0.35 (within informational range 0.25-0.49) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.35, 70);

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('informational');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('medium-term');
      expect(result!.message).toContain('volatility');
    });

    it('should detect warning volatility risk (CV 0.5-0.75)', () => {
      // Use CV = 0.6 (within warning range 0.5-0.74) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.6, 70);

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('volatility');
    });

    it('should detect critical volatility risk (CV >= 0.75)', () => {
      // Use CV = 0.8 (within critical range >= 0.75) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.8, 70);

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('volatility');
    });

    it('should increase confidence with more data points', () => {
      // Use identical CV (0.4) but different data lengths
      // Generate multiple signals per day to ensure different counts pass filtering
      // 90 signals total = 0.6 + floor((90-60)/30)*0.05 = 0.6 + 0.05 = 0.65
      // 120 signals total = 0.6 + floor((120-60)/30)*0.05 = 0.6 + 0.10 = 0.7
      const today = new Date();
      const standardDeviation = 1000 * 0.4;
      const lowValue = 1000 - standardDeviation;
      const highValue = 1000 + standardDeviation;
      
      // Generate exactly 90 signals, multiple per day to ensure all pass filter
      const signals90Days = [];
      for (let i = 0; i < 90; i++) {
        // Distribute signals across 60 days (some days have 2 signals)
        const dayIndex = Math.floor(i / 1.5); // Spread across ~60 days
        const signalDate = new Date(today);
        signalDate.setDate(today.getDate() - dayIndex);
        signals90Days.push({
          timestamp: signalDate,
          dailyRevenue: i % 2 === 0 ? lowValue : highValue
        });
      }
      
      // Generate exactly 120 signals, multiple per day to ensure all pass filter
      const signals120Days = [];
      for (let i = 0; i < 120; i++) {
        // Distribute signals across 60 days (2 signals per day)
        const dayIndex = Math.floor(i / 2);
        const signalDate = new Date(today);
        signalDate.setDate(today.getDate() - dayIndex);
        signals120Days.push({
          timestamp: signalDate,
          dailyRevenue: i % 2 === 0 ? lowValue : highValue
        });
      }

      const result90 = rule.evaluate(mockInput, signals90Days);
      const result120 = rule.evaluate(mockInput, signals120Days);
      
      expect(result90).not.toBeNull();
      expect(result120).not.toBeNull();
      expect(result120!.confidence).toBeGreaterThan(result90!.confidence);
    });

    it('should include volatility CV in conditions', () => {
      // Use CV = 0.4 (informational range) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.4, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Volatility (CV):'))).toBe(true);
    });

    it('should include data points in conditions', () => {
      // Use CV = 0.4 (informational range) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.4, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
    });

    it('should calculate confidence based on data completeness', () => {
      // Use CV = 0.4 (informational range) with 90 signals - deterministic
      // Generate multiple signals per day to ensure 90 signals pass filter
      // 90 signals = 0.6 + floor((90-60)/30)*0.05 = 0.6 + 0.05 = 0.65
      const today = new Date();
      const standardDeviation = 1000 * 0.4;
      const lowValue = 1000 - standardDeviation;
      const highValue = 1000 + standardDeviation;
      
      const signals = [];
      for (let i = 0; i < 90; i++) {
        // Distribute signals across 60 days (some days have 2 signals)
        const dayIndex = Math.floor(i / 1.5);
        const signalDate = new Date(today);
        signalDate.setDate(today.getDate() - dayIndex);
        signals.push({
          timestamp: signalDate,
          dailyRevenue: i % 2 === 0 ? lowValue : highValue
        });
      }
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.60);
    });

    it('should include appropriate contributing factors', () => {
      // Use CV = 0.6 (warning range) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.6, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThan(0);
      expect(result!.contributingFactors.some(f => f.factor.includes('volatility'))).toBe(true);
    });

    it('should generate appropriate recommendations for high volatility', () => {
      // Use CV = 0.7 (warning range, triggers cash flow management) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.7, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('cash flow management'))).toBe(true);
    });

    it('should handle edge case with exactly 60 days of data', () => {
      // Use exactly 60 days with CV >= 0.25 (informational range) - deterministic
      const signals = generateDeterministicRevenueSignals(1000, 0.4, 60);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points: 60 days'))).toBe(true);
    });
  });
});
