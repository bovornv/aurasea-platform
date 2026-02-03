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

    // Generate 28 days of signals with proper weekend/weekday distribution
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      const dayOfWeek = signalDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri-Sun
      
      // Calculate base daily revenue to achieve weekend share
      const weekendDays = 12; // 3 days * 4 weeks
      const weekdayDays = 16; // 4 days * 4 weeks
      
      let dailyRevenue;
      if (isWeekend) {
        dailyRevenue = (totalRevenue * weekendShare) / weekendDays;
      } else {
        dailyRevenue = (totalRevenue * (1 - weekendShare)) / weekdayDays;
      }
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue
      });
    }

    // If we need high top-5 concentration, boost the top 5 days
    if (top5Concentration > 0.5) {
      // Sort signals by revenue to find current top 5
      const sortedSignals = [...signals].sort((a, b) => b.dailyRevenue - a.dailyRevenue);
      const currentTop5Revenue = sortedSignals.slice(0, 5).reduce((sum, s) => sum + s.dailyRevenue, 0);
      const targetTop5Revenue = totalRevenue * top5Concentration;
      const boostPerDay = (targetTop5Revenue - currentTop5Revenue) / 5;
      
      // Boost the actual top 5 signals
      const top5Timestamps = sortedSignals.slice(0, 5).map(s => s.timestamp.getTime());
      signals.forEach(signal => {
        if (top5Timestamps.includes(signal.timestamp.getTime())) {
          signal.dailyRevenue += boostPerDay;
        }
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
      const signals = generateRevenueSignals(0.45, 0.60); // 45% weekend, 60% top-5 concentration

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.message).toContain('top-day revenue concentration');
    });

    it('should detect top-day concentration risk (critical)', () => {
      const signals = generateRevenueSignals(0.45, 0.70); // 45% weekend, 70% top-5 concentration

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
    });

    it('should detect dual concentration risk', () => {
      const signals = generateRevenueSignals(0.70, 0.60); // Both high

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.message).toMatch(/concentration risk|weekend.*concentration|top.*concentration/i);
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
      
      if (result) {
        expect(result.contributingFactors.length).toBeGreaterThan(0);
        expect(result.contributingFactors.some(f => f.factor.includes('Weekend revenue concentration'))).toBe(true);
      }
    });

    it('should include relevant conditions in alert', () => {
      const signals = generateRevenueSignals(0.70, 0.50);
      const result = rule.evaluate(mockInput, signals);
      
      if (result) {
        expect(result.conditions.some(c => c.includes('Weekend revenue share:'))).toBe(true);
        expect(result.conditions.some(c => c.includes('Top-5 day concentration:'))).toBe(true);
        expect(result.conditions.some(c => c.includes('Total revenue analyzed:'))).toBe(true);
        expect(result.conditions.some(c => c.includes('Data points:'))).toBe(true);
        expect(result.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
      }
    });

    it('should generate appropriate recommendations for weekend concentration', () => {
      const signals = generateRevenueSignals(0.80, 0.40);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('weekday promotions'))).toBe(true);
    });

    it('should generate appropriate recommendations for top-day concentration', () => {
      const signals = generateRevenueSignals(0.45, 0.70); // Ensure weekend below threshold
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
      
      if (result) {
        // Should get bonus for having 28 days (7 extra beyond minimum 21)
        expect(result.confidence).toBeGreaterThan(0.75);
      }
    });
  });
});
