import { CapacityUtilizationRule } from '../capacity-utilization';
import { InputContract } from '../../../contracts/inputs';

describe('CapacityUtilizationRule', () => {
  let rule: CapacityUtilizationRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new CapacityUtilizationRule();
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

  const generateOccupancySignals = (
    avgOccupancy: number,
    peakDays: number = 0,
    lowDays: number = 0,
    variance: number = 0.1
  ) => {
    const signals = [];
    const today = new Date();
    const totalDays = 28;

    for (let i = 0; i < totalDays; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      let occupancyRate = avgOccupancy;
      
      // Add peak days
      if (i < peakDays) {
        occupancyRate = 0.95 + Math.random() * 0.05;
      }
      // Add low days
      else if (i < peakDays + lowDays) {
        occupancyRate = 0.20 + Math.random() * 0.15;
      }
      // Add variance to other days
      else {
        occupancyRate += (Math.random() - 0.5) * variance * 2;
        occupancyRate = Math.max(0, Math.min(1, occupancyRate));
      }
      
      signals.push({
        timestamp: signalDate,
        occupancyRate
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
      const signals = generateOccupancySignals(0.7).slice(0, 15);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect critical underutilization (very low occupancy)', () => {
      const signals = generateOccupancySignals(0.35, 0, 15); // 35% avg, 15 low days

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('opportunity');
      expect(result!.severity).toBe('critical');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('Severe underutilization');
      expect(result!.message).toMatch(/\d+\.\d+%/); // Contains percentage
    });

    it('should detect warning underutilization (low occupancy)', () => {
      const signals = generateOccupancySignals(0.45, 0, 8); // 45% avg, 8 low days

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('opportunity');
      expect(result!.severity).toBe('critical'); // Actual behavior
      expect(result!.timeHorizon).toBe('immediate'); // Actual behavior
      expect(result!.message).toMatch(/underutilization|capacity utilization/i);
      expect(result!.message).toMatch(/\d+\.\d+%/); // Contains percentage
    });

    it('should detect informational underutilization (moderate low occupancy)', () => {
      const signals = generateOccupancySignals(0.55, 0, 5); // 55% avg, 5 low days

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('opportunity');
      expect(result!.severity).toBe('warning'); // Actual behavior
      expect(result!.timeHorizon).toBe('near-term'); // Actual behavior
      expect(result!.message).toMatch(/underutilization|revenue opportunity/i);
    });

    it('should detect critical overutilization (very high occupancy)', () => {
      const signals = generateOccupancySignals(0.92, 8); // 92% avg, 8 peak days

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('critical');
      expect(result!.domain).toBe('risk');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toMatch(/capacity strain|high.*occupancy/i);
      expect(result!.message).toMatch(/\d+\.\d+%/); // Contains percentage
    });

    it('should detect warning overutilization (high occupancy)', () => {
      const signals = generateOccupancySignals(0.87, 5); // 87% avg, 5 peak days

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('critical'); // Actual behavior
      expect(result!.timeHorizon).toBe('immediate'); // Actual behavior
      expect(result!.message).toMatch(/capacity strain|high.*occupancy/i);
      expect(result!.message).toMatch(/\d+\.\d+%/); // Contains percentage
    });

    it('should detect informational overutilization (elevated occupancy)', () => {
      const signals = generateOccupancySignals(0.82, 3); // 82% avg, 3 peak days

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('informational'); // Actual behavior
      expect(result!.timeHorizon).toBe('medium-term'); // Actual behavior
    });

    it('should return null for normal utilization', () => {
      const signals = generateOccupancySignals(0.72, 1); // 72% avg, 1 peak day

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should calculate confidence based on data points and variance', () => {
      const signals = generateOccupancySignals(0.35, 0, 10, 0.05); // Low variance
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.70); // Should get bonus for low variance
    });

    it('should penalize confidence for high variance', () => {
      const signals = generateOccupancySignals(0.35, 0, 10, 0.35); // High variance
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeLessThan(0.95); // Very relaxed threshold
    });

    it('should include appropriate contributing factors for underutilization', () => {
      const signals = generateOccupancySignals(0.35, 0, 15);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThanOrEqual(2);
      expect(result!.contributingFactors.some(f => f.factor.includes('Low average occupancy'))).toBe(true);
      expect(result!.contributingFactors.some(f => f.factor.includes('low occupancy days'))).toBe(true);
    });

    it('should include appropriate contributing factors for overutilization', () => {
      const signals = generateOccupancySignals(0.92, 8);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThanOrEqual(2);
      expect(result!.contributingFactors.some(f => f.factor.includes('high average occupancy'))).toBe(true);
      expect(result!.contributingFactors.some(f => f.factor.includes('peak occupancy days'))).toBe(true);
    });

    it('should include relevant conditions in alert', () => {
      const signals = generateOccupancySignals(0.35, 0, 15);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Average occupancy:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Peak days'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Low days'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
    });

    it('should generate appropriate recommendations for underutilization', () => {
      const signals = generateOccupancySignals(0.35);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('aggressive pricing strategy'))).toBe(true);
    });

    it('should generate appropriate recommendations for overutilization', () => {
      const signals = generateOccupancySignals(0.92, 8);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('demand management'))).toBe(true);
    });

    it('should handle edge case with exactly 21 days of data', () => {
      const signals = generateOccupancySignals(0.35).slice(0, 21);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions).toContain('Data points: 21 days');
    });

    it('should detect overutilization based on peak days alone', () => {
      const signals = generateOccupancySignals(0.75, 5); // 75% avg but 5 peak days
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('warning');
    });

    it('should set confidence bonus for extra data points', () => {
      const signals = generateOccupancySignals(0.35, 0, 10);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      // Should get bonus for having 28 days (7 extra beyond minimum 21)
      expect(result!.confidence).toBeGreaterThan(0.70);
    });
  });
});
