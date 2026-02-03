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

    // First, create base revenue distribution
    const baseRevenues: number[] = [];
    
    // Generate 28 days of base revenues
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      const dayOfWeek = signalDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri-Sun
      
      // Start with equal distribution
      const baseRevenue = totalRevenue / 28;
      baseRevenues.push(baseRevenue);
    }

    // Adjust for weekend concentration
    const weekendDays = 12; // 3 days * 4 weeks
    const weekdayDays = 16; // 4 days * 4 weeks
    
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      const dayOfWeek = signalDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      
      if (isWeekend) {
        baseRevenues[i] = (totalRevenue * weekendShare) / weekendDays;
      } else {
        baseRevenues[i] = (totalRevenue * (1 - weekendShare)) / weekdayDays;
      }
    }

    // Adjust for top-5 concentration if needed
    if (top5Concentration > 0.4) {
      // Sort indices by revenue to find top 5
      const revenueWithIndex = baseRevenues.map((rev, idx) => ({ revenue: rev, index: idx }));
      revenueWithIndex.sort((a, b) => b.revenue - a.revenue);
      
      const top5Indices = revenueWithIndex.slice(0, 5).map(item => item.index);
      const currentTop5Total = top5Indices.reduce((sum, idx) => sum + baseRevenues[idx], 0);
      const targetTop5Total = totalRevenue * top5Concentration;
      
      // Calculate boost needed
      const totalBoost = targetTop5Total - currentTop5Total;
      const boostPerDay = totalBoost / 5;
      
      // Apply boost to top 5 days
      top5Indices.forEach(idx => {
        baseRevenues[idx] += boostPerDay;
      });
      
      // Reduce other days proportionally to maintain total
      const otherIndices = baseRevenues.map((_, idx) => idx).filter(idx => !top5Indices.includes(idx));
      const reductionPerDay = totalBoost / otherIndices.length;
      otherIndices.forEach(idx => {
        baseRevenues[idx] = Math.max(0, baseRevenues[idx] - reductionPerDay);
      });
    }

    // Create final signals
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: baseRevenues[i]
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
