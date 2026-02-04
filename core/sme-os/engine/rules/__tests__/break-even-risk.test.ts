import { BreakEvenRiskRule } from '../break-even-risk';
import { InputContract } from '../../../contracts/inputs';

describe('BreakEvenRiskRule', () => {
  let rule: BreakEvenRiskRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new BreakEvenRiskRule();
    mockInput = {
      timePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-02-01'),
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

  const generateBreakEvenSignals = (
    breakEvenRatio: number,
    baseRevenue: number = 1000,
    days: number = 40
  ) => {
    const signals = [];
    const today = new Date();
    const baseExpenses = baseRevenue / breakEvenRatio;
    
    for (let i = 0; i < days; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: baseRevenue,
        dailyExpenses: baseExpenses
      });
    }

    return signals;
  };

  describe('evaluate', () => {
    it('should return null when insufficient data provided', () => {
      const result = rule.evaluate(mockInput, []);
      expect(result).toBeNull();
    });

    it('should return null when fewer than 30 days of data', () => {
      const signals = generateBreakEvenSignals(0.8, 1000, 20);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when revenue or expenses are zero', () => {
      const signals = [{
        timestamp: new Date(),
        dailyRevenue: 0,
        dailyExpenses: 1000
      }];
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when well above break-even (ratio > 1.2)', () => {
      const signals = generateBreakEvenSignals(1.5); // Healthy profitability
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect critical break-even risk (ratio < 0.9)', () => {
      const signals = generateBreakEvenSignals(0.8); // 0.8 ratio

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('critical');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('break-even risk');
      expect(result!.message).toContain('0.80');
    });

    it('should detect warning break-even risk (ratio 0.9-1.0)', () => {
      const signals = generateBreakEvenSignals(0.95); // 0.95 ratio

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('break-even risk');
      expect(result!.message).toContain('0.95');
    });

    it('should detect informational break-even risk (ratio 1.0-1.2)', () => {
      const signals = generateBreakEvenSignals(1.1); // 1.1 ratio

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('informational');
      expect(result!.timeHorizon).toBe('medium-term');
      expect(result!.message).toContain('break-even risk');
      expect(result!.message).toContain('1.10');
    });

    it('should calculate confidence based on data completeness', () => {
      const signals = generateBreakEvenSignals(0.9, 1000, 60);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.70);
    });

    it('should include appropriate contributing factors', () => {
      const signals = generateBreakEvenSignals(0.8);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThan(0);
      expect(result!.contributingFactors.some(f => f.factor.includes('break-even'))).toBe(true);
    });

    it('should include required conditions in alert', () => {
      const signals = generateBreakEvenSignals(0.9);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Break-even ratio:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Revenue gap:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Total revenue:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Total expenses:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
    });

    it('should generate appropriate recommendations for critical break-even', () => {
      const signals = generateBreakEvenSignals(0.8);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('immediate cost reduction'))).toBe(true);
    });

    it('should generate appropriate recommendations for warning break-even', () => {
      const signals = generateBreakEvenSignals(0.95);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('cost management'))).toBe(true);
    });

    it('should generate appropriate recommendations for informational break-even', () => {
      const signals = generateBreakEvenSignals(1.1);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('profitability trends'))).toBe(true);
    });

    it('should handle edge case with exactly 30 days of data', () => {
      const signals = generateBreakEvenSignals(0.9, 1000, 30);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points: 30 days'))).toBe(true);
    });

    it('should increase confidence with more data points', () => {
      const signals60Days = generateBreakEvenSignals(0.9, 1000, 60);
      const signals90Days = generateBreakEvenSignals(0.9, 1000, 90);

      const result60 = rule.evaluate(mockInput, signals60Days);
      const result90 = rule.evaluate(mockInput, signals90Days);
      
      expect(result60).not.toBeNull();
      expect(result90).not.toBeNull();
      expect(result90!.confidence).toBeGreaterThan(result60!.confidence);
    });

    it('should handle negative revenue gap (operating at loss)', () => {
      const signals = generateBreakEvenSignals(0.7); // Loss scenario
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.contributingFactors.some(f => f.factor.includes('Operating at loss'))).toBe(true);
    });

    it('should handle minimal profit margin scenario', () => {
      const signals = generateBreakEvenSignals(1.05); // Small profit
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('informational');
      expect(result!.contributingFactors.some(f => f.factor.includes('Minimal profit margin'))).toBe(true);
    });
  });
});
