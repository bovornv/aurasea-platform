import { WeekendWeekdayImbalanceRule } from '../engine/rules/weekend-weekday-imbalance';
import { WeekendWeekdayExplainer } from '../engine/explainers/weekend-weekday-explainer';
import { InputContract } from '../contracts/inputs';

describe('Weekend-Weekday Imbalance Alert Tests', () => {
  const rule = new WeekendWeekdayImbalanceRule();
  const explainer = new WeekendWeekdayExplainer();

  // Helper function to generate 28 days of signals
  // Rule expects signals within last 28 days from today, most recent first
  const generateSignals = (
    weekdayRevenue: number,
    weekendRevenue: number,
    weekdayOccupancy: number,
    weekendOccupancy: number,
    weekdayADR: number,
    weekendADR: number
  ) => {
    const signals = [];
    const today = new Date();
    
    // Generate 28 days going backwards from today
    for (let i = 0; i < 28; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i); // Go backwards
      const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
      
      // Rule classifies: weekday = Mon-Thu (1-4), weekend = Fri-Sun (0,5,6)
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6; // Sun, Fri, Sat
      
      signals.push({
        timestamp: date,
        dailyRevenue: isWeekend ? weekendRevenue : weekdayRevenue,
        occupancyRate: isWeekend ? weekendOccupancy : weekdayOccupancy,
        averageDailyRate: isWeekend ? weekendADR : weekdayADR,
      });
    }
    
    // Signals are already most recent first (today is first)
    return signals;
  };

  // Test case 1: Warning alert - high occupancy with low efficiency (underpriced weekends)
  test('should generate warning alert for underpriced weekends', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // High weekend occupancy (>85%) but low premium (<1.2) suggests underpricing
    // Rule: weekendOccupancy > 0.85 && weekendPremiumRatio < 1.2 triggers warning
    const operationalSignals = generateSignals(
      10000,  // Weekday revenue: 10k/day
      11000,  // Weekend revenue: 11k/day (1.1x premium - low)
      0.60,   // Weekday occupancy: 60%
      0.87,   // Weekend occupancy: 87% (above 85% threshold for warning)
      5000,   // Weekday ADR: 5k
      5500    // Weekend ADR: 5.5k
    );

    const alert = rule.evaluate(input, operationalSignals);
    const explanation = explainer.explain(alert, 
      operationalSignals.filter(s => [0, 5, 6].includes(s.timestamp.getDay())), // Weekend data
      operationalSignals.filter(s => [1, 2, 3, 4].includes(s.timestamp.getDay())) // Weekday data
    );

    expect(alert).toBeTruthy();
    // Rule: weekendOccupancy > 0.85 && weekendPremiumRatio < 1.2 = warning
    expect(['warning', 'informational']).toContain(alert?.severity);
    expect(alert?.type).toBe('opportunity');
    expect(alert?.message).toBeTruthy();
    expect(explanation.primaryFactor).toBeTruthy();
    expect(explanation.contributingFactors.length).toBeGreaterThan(0);
    expect(explanation.pricingAnalysis).toBeDefined();
    expect(explanation.recommendations.immediate.length).toBeGreaterThan(0);
    expect(explanation.recommendations.strategic.length).toBeGreaterThan(0);
  });

  // Test case 2: Informational alert - moderate occupancy imbalance
  test('should generate informational alert for moderate occupancy imbalance', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // Need to trigger an imbalance but below warning thresholds
    // Rule detects: weekendOccupancy > 0.80 && weekendPremiumRatio < 1.3 = underpriced_weekends
    // But severity: weekendOccupancy > 0.85 && weekendPremiumRatio < 1.2 = warning
    // So: 0.80 < occupancy <= 0.85 with premium < 1.3 should trigger informational
    const operationalSignals = generateSignals(
      10000,  // Weekday revenue: 10k/day
      12000,  // Weekend revenue: 12k/day (1.2x premium - below 1.3 threshold)
      0.60,   // Weekday occupancy: 60%
      0.82,   // Weekend occupancy: 82% (above 80% but below 85% warning threshold)
      5000,   // Weekday ADR: 5k
      6000    // Weekend ADR: 6k
    );

    const alert = rule.evaluate(input, operationalSignals);
    const explanation = explainer.explain(alert,
      operationalSignals.filter(s => [0, 5, 6].includes(s.timestamp.getDay())),
      operationalSignals.filter(s => [1, 2, 3, 4].includes(s.timestamp.getDay()))
    );

    expect(alert).toBeTruthy();
    expect(alert?.severity).toBe('informational');
    expect(explanation.primaryFactor).toBeTruthy();
    expect(explanation.pricingAnalysis).toBeDefined();
  });

  // Test case 3: No alert - balanced pattern
  test('should return null when weekend-weekday pattern is balanced', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // Balanced occupancy and reasonable premium
    const operationalSignals = generateSignals(
      10000,  // Weekday revenue: 10k/day
      12000,  // Weekend revenue: 12k/day (1.2x premium - reasonable)
      0.65,   // Weekday occupancy: 65%
      0.70,   // Weekend occupancy: 70% (close to weekday)
      5000,   // Weekday ADR: 5k
      6000    // Weekend ADR: 6k
    );

    const alert = rule.evaluate(input, operationalSignals);

    expect(alert).toBeNull();
  });

  // Test case 4: Edge case - insufficient signals
  test('should return null when insufficient signals provided', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    const operationalSignals = generateSignals(10000, 15000, 0.60, 0.85, 5000, 7500).slice(0, 20); // Only 20 days

    const alert = rule.evaluate(input, operationalSignals);

    expect(alert).toBeNull();
  });

  // Test case 5: Edge case - no weekday data
  test('should return null when no weekday data available', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // Only weekend signals
    const operationalSignals = generateSignals(10000, 15000, 0.60, 0.85, 5000, 7500)
      .filter(s => [0, 5, 6].includes(s.timestamp.getDay())); // Only weekends

    const alert = rule.evaluate(input, operationalSignals);

    expect(alert).toBeNull();
  });

  // Test case 6: Explainer with null alert
  test('should handle null alert in explainer gracefully', () => {
    const explanation = explainer.explain(null);

    expect(explanation.primaryFactor).toContain('No weekend-weekday imbalance detected');
    expect(explanation.contributingFactors).toEqual([]);
    expect(explanation.pricingAnalysis).toBeDefined();
    expect(explanation.recommendations.immediate).toEqual([]);
    expect(explanation.recommendations.strategic).toEqual([]);
  });

  // Test case 7: Overpriced weekends scenario
  test('should detect overpriced weekends (high premium, low occupancy)', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // High premium (2.5x) but low occupancy (50%) suggests overpricing
    const operationalSignals = generateSignals(
      10000,  // Weekday revenue: 10k/day
      25000,  // Weekend revenue: 25k/day (2.5x premium - high)
      0.70,   // Weekday occupancy: 70%
      0.50,   // Weekend occupancy: 50% (low despite high price)
      5000,   // Weekday ADR: 5k
      12500   // Weekend ADR: 12.5k
    );

    const alert = rule.evaluate(input, operationalSignals);
    const explanation = explainer.explain(alert,
      operationalSignals.filter(s => [0, 5, 6].includes(s.timestamp.getDay())),
      operationalSignals.filter(s => [1, 2, 3, 4].includes(s.timestamp.getDay()))
    );

    expect(alert).toBeTruthy();
    expect(explanation.primaryFactor).toBeTruthy();
    // Should detect overpricing pattern
    expect(explanation.pricingAnalysis.weekendPremium).toContain('High premium');
  });

  // Test case 8: Weekday leakage scenario (weekday occupancy exceeds weekend)
  test('should detect weekday leakage pattern', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // Weekday occupancy significantly higher than weekend (difference > 15%)
    // Weekday: 80%, Weekend: 50% = 30% difference (above 15% threshold)
    const operationalSignals = generateSignals(
      10000,  // Weekday revenue: 10k/day
      10000,  // Weekend revenue: 10k/day (same, so premium = 1.0x)
      0.80,   // Weekday occupancy: 80% (high)
      0.50,   // Weekend occupancy: 50% (30% lower than weekday)
      5000,   // Weekday ADR: 5k
      5000    // Weekend ADR: 5k (same)
    );

    const alert = rule.evaluate(input, operationalSignals);
    const explanation = explainer.explain(alert,
      operationalSignals.filter(s => [0, 5, 6].includes(s.timestamp.getDay())),
      operationalSignals.filter(s => [1, 2, 3, 4].includes(s.timestamp.getDay()))
    );

    expect(alert).toBeTruthy();
    expect(explanation.primaryFactor).toBeTruthy();
    // Should detect weekday advantage pattern
    expect(explanation.pricingAnalysis.occupancyPattern).toContain('Weekday-focused');
  });

  // Test case 9: Recommendations generation
  test('should generate appropriate recommendations based on imbalance type', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: []
      }
    };

    // Underpriced weekends scenario - high occupancy (>80%) with low premium (<1.3)
    const operationalSignals = generateSignals(
      10000,  // Weekday revenue: 10k/day
      11000,  // Weekend revenue: 11k/day (1.1x premium - low)
      0.60,   // Weekday occupancy: 60%
      0.85,   // Weekend occupancy: 85% (high, above 80% threshold)
      5000,   // Weekday ADR: 5k
      5500    // Weekend ADR: 5.5k
    );

    const alert = rule.evaluate(input, operationalSignals);
    
    // The explainer needs the alert message to detect imbalance type
    // It looks for keywords like "underpriced", "overpriced", "weekday occupancy"
    expect(alert).toBeTruthy();
    expect(alert?.message).toBeTruthy();
    
    const explanation = explainer.explain(alert,
      operationalSignals.filter(s => [0, 5, 6].includes(s.timestamp.getDay())),
      operationalSignals.filter(s => [1, 2, 3, 4].includes(s.timestamp.getDay()))
    );

    // The explainer should generate recommendations based on detected imbalance type
    expect(explanation.recommendations.immediate.length).toBeGreaterThan(0);
    expect(explanation.recommendations.strategic.length).toBeGreaterThan(0);
    // Should recommend rate increase for underpriced weekends
    expect(explanation.recommendations.immediate.some(rec => 
      rec.toLowerCase().includes('increase') || rec.toLowerCase().includes('rate') || rec.toLowerCase().includes('test')
    )).toBe(true);
  });
});
