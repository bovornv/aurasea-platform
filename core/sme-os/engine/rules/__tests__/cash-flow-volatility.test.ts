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

  const generateVolatileRevenueSignals = (
    meanRevenue: number = 1000,
    coefficientOfVariation: number = 0.3,
    days: number = 70
  ) => {
    const signals = [];
    const today = new Date();
    const standardDeviation = meanRevenue * coefficientOfVariation;
    
    for (let i = 0; i < days; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      // Generate revenue with specified CV using normal distribution approximation
      const randomFactor = (Math.random() + Math.random() + Math.random() + Math.random()) / 4; // Approximate normal
      const revenue = meanRevenue + (randomFactor - 0.5) * standardDeviation * 4;
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: Math.max(0, revenue)
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
      const signals = generateVolatileRevenueSignals(1000, 0.4, 50);
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
      const signals = generateVolatileRevenueSignals(1000, 0.2, 70); // Low volatility

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect informational volatility risk (CV 0.25-0.5)', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.35, 70);

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('informational');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('medium-term');
      expect(result!.message).toContain('volatility');
    });

    it('should detect warning volatility risk (CV 0.5-0.75)', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.6, 70);

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('volatility');
    });

    it('should detect critical volatility risk (CV >= 0.75)', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.8, 70);

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('volatility');
    });

    it('should increase confidence with more data points', () => {
      const signals90Days = generateVolatileRevenueSignals(1000, 0.4, 90);
      const signals120Days = generateVolatileRevenueSignals(1000, 0.4, 120);

      const result90 = rule.evaluate(mockInput, signals90Days);
      const result120 = rule.evaluate(mockInput, signals120Days);
      
      expect(result90).not.toBeNull();
      expect(result120).not.toBeNull();
      expect(result120!.confidence).toBeGreaterThan(result90!.confidence);
    });

    it('should include volatility CV in conditions', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.4, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Volatility (CV):'))).toBe(true);
    });

    it('should include data points in conditions', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.4, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
    });

    it('should calculate confidence based on data completeness', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.4, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.60);
    });

    it('should include appropriate contributing factors', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.6, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThan(0);
      expect(result!.contributingFactors.some(f => f.factor.includes('volatility'))).toBe(true);
    });

    it('should generate appropriate recommendations for high volatility', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.7, 70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('cash flow management'))).toBe(true);
    });

    it('should handle edge case with exactly 60 days of data', () => {
      const signals = generateVolatileRevenueSignals(1000, 0.4, 60);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points: 60 days'))).toBe(true);
    });
  });
});
