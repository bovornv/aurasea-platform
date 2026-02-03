import { WeekendWeekdayImbalanceRule } from '../weekend-weekday-imbalance';
import { InputContract } from '../../../contracts/inputs';

describe('WeekendWeekdayImbalanceRule', () => {
  let rule: WeekendWeekdayImbalanceRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new WeekendWeekdayImbalanceRule();
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

  const generateOperationalSignals = (
    weekdayOccupancy: number,
    weekendOccupancy: number,
    weekdayRevenue: number,
    weekendRevenue: number,
    weekdayADR: number = weekdayRevenue * 1.2,
    weekendADR: number = weekendRevenue * 1.2
  ) => {
    const signals = [];
    const today = new Date();

    // Generate signals for 28 days
    for (let i = 0; i < 28; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      const dayOfWeek = signalDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Fri-Sun
      
      signals.push({
        timestamp: signalDate,
        dailyRevenue: isWeekend ? weekendRevenue : weekdayRevenue,
        occupancyRate: isWeekend ? weekendOccupancy : weekdayOccupancy,
        averageDailyRate: isWeekend ? weekendADR : weekdayADR
      });
    }

    return signals;
  };

  describe('evaluate', () => {
    it('should return null when insufficient data provided', () => {
      const result = rule.evaluate(mockInput, []);
      expect(result).toBeNull();
    });

    it('should return null when less than 28 days of data', () => {
      const signals = generateOperationalSignals(0.6, 0.8, 1000, 1500).slice(0, 20);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect underpriced weekends (high occupancy, low premium)', () => {
      const signals = generateOperationalSignals(
        0.5,  // weekday occupancy
        0.85, // weekend occupancy (high)
        1000, // weekday revenue
        1200  // weekend revenue (low premium: 1.2x)
      );

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('opportunity');
      expect(result!.severity).toBe('informational');
      expect(result!.message).toContain('Weekend demand exceeds pricing');
      expect(result!.message).toContain('85.0% occupancy');
      expect(result!.message).toContain('1.20x weekday premium');
    });

    it('should detect overpriced weekends (low occupancy, high premium)', () => {
      const signals = generateOperationalSignals(
        0.6,  // weekday occupancy
        0.4,  // weekend occupancy (low)
        1000, // weekday revenue
        2000  // weekend revenue (high premium: 2.0x)
      );

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('opportunity');
      expect(result!.severity).toBe('warning');
      expect(result!.message).toContain('Weekend pricing may be limiting demand');
      expect(result!.message).toContain('40.0% occupancy');
      expect(result!.message).toContain('2.00x weekday premium');
    });

    it('should detect weekday demand leakage', () => {
      const signals = generateOperationalSignals(
        0.8,  // weekday occupancy (high)
        0.5,  // weekend occupancy (low)
        1200, // weekday revenue
        1000  // weekend revenue
      );

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('opportunity');
      expect(result!.severity).toBe('warning');
      expect(result!.message).toContain('Weekday occupancy significantly higher than weekends');
      expect(result!.message).toContain('30.0% difference');
    });

    it('should return null when no significant imbalance detected', () => {
      const signals = generateOperationalSignals(
        0.7,  // weekday occupancy
        0.75, // weekend occupancy
        1000, // weekday revenue
        1400  // weekend revenue (1.4x premium - reasonable)
      );

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should generate critical alert for severe underpricing', () => {
      const signals = generateOperationalSignals(
        0.6,  // weekday occupancy
        0.95, // weekend occupancy (very high)
        1000, // weekday revenue
        1050  // weekend revenue (very low premium: 1.05x)
      );

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
    });

    it('should generate critical alert for severe overpricing', () => {
      const signals = generateOperationalSignals(
        0.7,  // weekday occupancy
        0.4,  // weekend occupancy (very low)
        1000, // weekday revenue
        2600  // weekend revenue (very high premium: 2.6x)
      );

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.timeHorizon).toBe('immediate');
    });

    it('should include appropriate contributing factors', () => {
      const signals = generateOperationalSignals(
        0.5,  // weekday occupancy
        0.85, // weekend occupancy
        1000, // weekday revenue
        1200  // weekend revenue
      );

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors).toHaveLength(1);
      expect(result!.contributingFactors[0].factor).toBe('High weekend occupancy with low price premium');
      expect(result!.contributingFactors[0].weight).toBeGreaterThan(0);
    });

    it('should include relevant conditions in alert', () => {
      const signals = generateOperationalSignals(
        0.6,  // weekday occupancy
        0.8,  // weekend occupancy
        1000, // weekday revenue
        1250, // weekend revenue
        1200, // weekday ADR
        1500  // weekend ADR
      );

      const result = rule.evaluate(mockInput, signals);
      
      if (result) {
        expect(result.conditions).toContain('Weekend premium ratio: 1.25x');
        expect(result.conditions).toContain('Weekend occupancy: 80.0%');
        expect(result.conditions).toContain('Weekday occupancy: 60.0%');
        expect(result.conditions).toContain('Weekend ADR: $1500');
        expect(result.conditions).toContain('Weekday ADR: $1200');
        expect(result.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
      }
    });

    it('should set appropriate confidence level', () => {
      const signals = generateOperationalSignals(0.6, 0.85, 1000, 1200);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(0.75);
    });

    it('should handle edge case with no weekday or weekend data', () => {
      // Create signals with only one type of day
      const signals = [
        {
          timestamp: new Date(),
          dailyRevenue: 1000,
          occupancyRate: 0.7,
          averageDailyRate: 1200
        }
      ];

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should generate recommendations based on imbalance type', () => {
      const signals = generateOperationalSignals(0.5, 0.85, 1000, 1150);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('increasing weekend rates'))).toBe(true);
    });
  });
});
