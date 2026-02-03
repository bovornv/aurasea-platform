import { RevenueConcentrationRule } from '../revenue-concentration';
import { InputContract } from '../../../contracts/inputs';

describe('RevenueConcentrationRule', () => {
  let rule: RevenueConcentrationRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new RevenueConcentrationRule();
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

  const generateRevenueSignals = (
    weekendShare: number = 0.6,
    top5Concentration: number = 0.4,
    totalRevenue: number = 100000
  ) => {
    const signals = [];
    const today = new Date();
    const dailyRevenues: number[] = [];

    // First, generate base daily revenues
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      const dayOfWeek = signalDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri-Sun
      
      // Base revenue distribution
      const baseRevenue = isWeekend 
        ? (totalRevenue * weekendShare) / (3 * 4) // 3 weekend days per week, 4 weeks
        : (totalRevenue * (1 - weekendShare)) / (4 * 4); // 4 weekdays per week, 4 weeks
      
      dailyRevenues.push(baseRevenue);
    }

    // Adjust top 5 days to meet concentration target
    if (top5Concentration > 0.4) {
      const currentTop5 = dailyRevenues.sort((a, b) => b - a).slice(0, 5).reduce((sum, rev) => sum + rev, 0);
      const targetTop5 = totalRevenue * top5Concentration;
      const adjustment = (targetTop5 - currentTop5) / 5;
      
      // Apply adjustment to top 5 days
      dailyRevenues.sort((a, b) => b - a);
      for (let i = 0; i < 5; i++) {
        dailyRevenues[i] += adjustment;
      }
    }

    // Create signals with adjusted revenues
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: Math.max(0, dailyRevenues[i])
      });
    }

    return signals;
  };

  describe('evaluate', () => {
    it('should return null when insufficient data provided', () => {
      const result = rule.evaluate(mockInput, []);
      expect(result).toBeNull();
    });

    it('should return null when less than 21 days of data', () => {
      const signals = generateRevenueSignals().slice(0, 15);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect weekend concentration risk (informational)', () => {
      const signals = generateRevenueSignals(0.60, 0.40); // 60% weekend share

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('informational');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('medium-term');
      expect(result!.message).toContain('weekend revenue concentration');
    });

    it('should detect weekend concentration risk (warning)', () => {
      const signals = generateRevenueSignals(0.70, 0.40); // 70% weekend share

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('70.0%');
    });

    it('should detect weekend concentration risk (critical)', () => {
      const signals = generateRevenueSignals(0.80, 0.40); // 80% weekend share

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
    });

    it('should detect top-day concentration risk (warning)', () => {
      const signals = generateRevenueSignals(0.50, 0.60); // 60% top-5 concentration

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.message).toContain('top-day revenue concentration');
    });

    it('should detect top-day concentration risk (critical)', () => {
      const signals = generateRevenueSignals(0.50, 0.70); // 70% top-5 concentration

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
    });

    it('should detect dual concentration risk', () => {
      const signals = generateRevenueSignals(0.70, 0.60); // Both high

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.message).toContain('Dual concentration risk');
    });

    it('should return null for balanced revenue distribution', () => {
      const signals = generateRevenueSignals(0.45, 0.35); // Balanced distribution

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should calculate confidence based on data completeness', () => {
      const signals = generateRevenueSignals(0.70, 0.40);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.70);
    });

    it('should include appropriate contributing factors', () => {
      const signals = generateRevenueSignals(0.70, 0.50);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThan(0);
      expect(result!.contributingFactors.some(f => f.factor.includes('Weekend revenue concentration'))).toBe(true);
    });

    it('should include relevant conditions in alert', () => {
      const signals = generateRevenueSignals(0.70, 0.50);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Weekend revenue share:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Top-5 day concentration:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Total revenue analyzed:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
    });

    it('should generate appropriate recommendations for weekend concentration', () => {
      const signals = generateRevenueSignals(0.80, 0.40);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('weekday promotions'))).toBe(true);
    });

    it('should generate appropriate recommendations for top-day concentration', () => {
      const signals = generateRevenueSignals(0.50, 0.70);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('dynamic pricing'))).toBe(true);
    });

    it('should handle edge case with exactly 21 days of data', () => {
      const signals = generateRevenueSignals(0.70, 0.50).slice(0, 21);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points: 21 days'))).toBe(true);
    });

    it('should return null when total revenue is zero', () => {
      const signals = Array(28).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        dailyRevenue: 0
      }));

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should set confidence bonus for extra data points', () => {
      const signals = generateRevenueSignals(0.70, 0.50);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      // Should get bonus for having 28 days (7 extra beyond minimum 21)
      expect(result!.confidence).toBeGreaterThan(0.75);
    });
  });
});
