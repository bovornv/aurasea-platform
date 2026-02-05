import { WeekendWeekdayFnbGapRule } from './weekend-weekday-fnb-gap';
import { InputContract } from '../../contracts/inputs';

describe('WeekendWeekdayFnbGapRule', () => {
  let rule: WeekendWeekdayFnbGapRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new WeekendWeekdayFnbGapRule();
    mockInput = {
      timePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
        granularity: 'day'
      },
      financial: {
        cashFlows: [],
        currentBalance: 10000,
        projectedBalance: 8000
      },
      operational: {
        resources: [],
        constraints: [],
        historicalPatterns: [],
        previousDecisions: []
      }
    };
  });

  describe('insufficient data scenarios', () => {
    it('should return null when no operational signals provided', () => {
      const result = rule.evaluate(mockInput);
      expect(result).toBeNull();
    });

    it('should return null when less than 14 days of data', () => {
      const signals = generateDailySignals(10, 100, 200); // 10 days
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when weekday revenue is zero', () => {
      const signals = [
        // Weekend days with revenue
        { timestamp: new Date('2024-01-06'), dailyRevenue: 500 }, // Saturday
        { timestamp: new Date('2024-01-07'), dailyRevenue: 600 }, // Sunday
        { timestamp: new Date('2024-01-13'), dailyRevenue: 550 }, // Saturday
        { timestamp: new Date('2024-01-14'), dailyRevenue: 650 }, // Sunday
        // Weekdays with zero revenue
        ...Array.from({ length: 10 }, (_, i) => ({
          timestamp: new Date(2024, 0, 8 + i), // Weekdays
          dailyRevenue: 0
        }))
      ];
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });
  });

  describe('severity thresholds', () => {
    it('should return null when ratio is below 1.5x threshold', () => {
      const signals = generateDailySignals(14, 200, 250); // 1.25x ratio
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should generate informational alert for 1.5x ratio', () => {
      const signals = generateDailySignals(14, 200, 300); // 1.5x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('informational');
      expect(result!.scope).toBe('cafe_restaurant');
      expect(result!.category).toBe('demand');
      expect(result!.type).toBe('opportunity');
      expect(result!.domain).toBe('risk');
      expect(result!.timeHorizon).toBe('near-term');
    });

    it('should generate warning alert for 2.0x ratio', () => {
      const signals = generateDailySignals(14, 200, 400); // 2.0x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.message).toContain('Significant weekend revenue advantage');
      expect(result!.message).toContain('2.0x higher');
    });

    it('should generate critical alert for 2.8x ratio', () => {
      const signals = generateDailySignals(14, 200, 560); // 2.8x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.message).toContain('Extreme weekend revenue advantage');
      expect(result!.message).toContain('2.8x higher');
    });

    it('should generate critical alert for ratio above 2.8x', () => {
      const signals = generateDailySignals(14, 100, 350); // 3.5x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.message).toContain('3.5x higher');
    });
  });

  describe('alert content validation', () => {
    it('should include correct conditions and metrics', () => {
      const signals = generateDailySignals(14, 200, 400); // 2.0x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.conditions).toContain('Weekend/Weekday Revenue Ratio: 2.00x');
      expect(result!.conditions).toContain('Average Weekend Revenue: $400.00');
      expect(result!.conditions).toContain('Average Weekday Revenue: $200.00');
      expect(result!.conditions).toContain('Weekend Days Analyzed: 4');
      expect(result!.conditions).toContain('Weekday Days Analyzed: 10');
    });

    it('should include appropriate recommendations for critical severity', () => {
      const signals = generateDailySignals(14, 150, 450); // 3.0x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.recommendations).toContain('Implement aggressive weekday promotions and marketing campaigns');
      expect(result!.recommendations).toContain('Consider weekday-specific menu offerings or pricing strategies');
      expect(result!.recommendations).toContain('Explore corporate lunch programs or weekday catering opportunities');
    });

    it('should include appropriate recommendations for warning severity', () => {
      const signals = generateDailySignals(14, 200, 420); // 2.1x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.recommendations).toContain('Develop targeted weekday customer acquisition strategies');
      expect(result!.recommendations).toContain('Consider weekday lunch specials or happy hour promotions');
      expect(result!.recommendations).toContain('Explore partnerships with local businesses for weekday traffic');
    });

    it('should include appropriate recommendations for informational severity', () => {
      const signals = generateDailySignals(14, 200, 320); // 1.6x ratio
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.recommendations).toContain('Monitor weekday performance trends and customer patterns');
      expect(result!.recommendations).toContain('Consider modest weekday promotions or loyalty programs');
      expect(result!.recommendations).toContain('Track competitor weekday activities and market response');
    });
  });

  describe('contributing factors', () => {
    it('should include relevant contributing factors', () => {
      const signals = generateDailySignals(14, 180, 450); // 2.5x ratio
      const result = rule.evaluate(mockInput, signals);
      
      const factors = result!.contributingFactors;
      expect(factors).toHaveLength(4);
      
      // Strong weekend performance
      expect(factors[0].factor).toContain('Strong weekend performance with average daily revenue of $450.00');
      expect(factors[0].impact).toBe('high');
      expect(factors[0].direction).toBe('positive');
      
      // Weekday underperformance
      expect(factors[1].factor).toContain('Significant weekday underperformance with average daily revenue of $180.00');
      expect(factors[1].impact).toBe('high');
      expect(factors[1].direction).toBe('negative');
      
      // Data coverage
      expect(factors[2].factor).toContain('Sufficient data coverage with 14 days analyzed');
      expect(factors[2].impact).toBe('medium');
      expect(factors[2].direction).toBe('positive');
      
      // Revenue gap
      expect(factors[3].factor).toContain('Daily revenue gap of $270.00');
      expect(factors[3].impact).toBe('high');
      expect(factors[3].direction).toBe('negative');
    });

    it('should show moderate underperformance for lower ratios', () => {
      const signals = generateDailySignals(14, 200, 320); // 1.6x ratio
      const result = rule.evaluate(mockInput, signals);
      
      const factors = result!.contributingFactors;
      expect(factors[1].factor).toContain('Moderate weekday underperformance');
      expect(factors[1].impact).toBe('medium');
    });
  });

  describe('confidence calculation', () => {
    it('should have base confidence of 0.70 for minimum data', () => {
      const signals = generateDailySignals(14, 200, 400);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.confidence).toBe(0.70);
    });

    it('should increase confidence with more data points', () => {
      const signals = generateDailySignals(21, 200, 400); // 7 extra days
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.confidence).toBe(0.77); // 0.70 + (7 * 0.01)
    });

    it('should cap confidence at 0.95', () => {
      const signals = generateDailySignals(50, 200, 400); // 36 extra days
      const result = rule.evaluate(mockInput, signals);
      
      expect(result!.confidence).toBe(0.95);
    });
  });

  describe('edge cases', () => {
    it('should handle mixed weekend/weekday patterns correctly', () => {
      const signals = [
        // Week 1
        { timestamp: new Date('2024-01-01'), dailyRevenue: 150 }, // Monday
        { timestamp: new Date('2024-01-02'), dailyRevenue: 160 }, // Tuesday
        { timestamp: new Date('2024-01-03'), dailyRevenue: 140 }, // Wednesday
        { timestamp: new Date('2024-01-04'), dailyRevenue: 170 }, // Thursday
        { timestamp: new Date('2024-01-05'), dailyRevenue: 180 }, // Friday
        { timestamp: new Date('2024-01-06'), dailyRevenue: 350 }, // Saturday
        { timestamp: new Date('2024-01-07'), dailyRevenue: 380 }, // Sunday
        // Week 2
        { timestamp: new Date('2024-01-08'), dailyRevenue: 155 }, // Monday
        { timestamp: new Date('2024-01-09'), dailyRevenue: 165 }, // Tuesday
        { timestamp: new Date('2024-01-10'), dailyRevenue: 145 }, // Wednesday
        { timestamp: new Date('2024-01-11'), dailyRevenue: 175 }, // Thursday
        { timestamp: new Date('2024-01-12'), dailyRevenue: 185 }, // Friday
        { timestamp: new Date('2024-01-13'), dailyRevenue: 360 }, // Saturday
        { timestamp: new Date('2024-01-14'), dailyRevenue: 390 }  // Sunday
      ];
      
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning'); // ~2.3x ratio
      expect(result!.conditions).toContain('Weekend Days Analyzed: 4');
      expect(result!.conditions).toContain('Weekday Days Analyzed: 10');
    });

    it('should handle very small revenue amounts', () => {
      const signals = generateDailySignals(14, 1, 3); // 3.0x ratio with small amounts
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.message).toContain('$3');
      expect(result!.message).toContain('$1');
    });

    it('should handle exactly 14 days of data', () => {
      const signals = generateDailySignals(14, 200, 400);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions).toContain('Weekend Days Analyzed: 4');
      expect(result!.conditions).toContain('Weekday Days Analyzed: 10');
    });
  });

  // Helper function to generate test data
  function generateDailySignals(
    days: number, 
    weekdayRevenue: number, 
    weekendRevenue: number
  ): Array<{ timestamp: Date; dailyRevenue: number }> {
    const signals = [];
    const startDate = new Date('2024-01-01'); // Monday
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      signals.push({
        timestamp: date,
        dailyRevenue: isWeekend ? weekendRevenue : weekdayRevenue
      });
    }
    
    return signals;
  }
});
