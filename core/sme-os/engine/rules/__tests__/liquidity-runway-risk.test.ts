import { LiquidityRunwayRiskRule } from '../liquidity-runway-risk';
import { InputContract } from '../../../contracts/inputs';

describe('LiquidityRunwayRiskRule', () => {
  let rule: LiquidityRunwayRiskRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new LiquidityRunwayRiskRule();
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

  const generateCashFlowSignals = (
    currentBalance: number,
    monthlyBurn: number,
    days: number = 90
  ) => {
    const signals = [];
    const today = new Date();
    const dailyBurn = monthlyBurn / 30;
    
    for (let i = 0; i < days; i++) {
      const signalDate = new Date(today);
      signalDate.setDate(today.getDate() - i);
      
      signals.push({
        timestamp: signalDate,
        cashBalance: currentBalance - (dailyBurn * i),
        netCashFlow: -dailyBurn
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
      const signals = generateCashFlowSignals(100000, 10000, 20);
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when cash balance is missing or invalid', () => {
      const signals = [{
        timestamp: new Date(),
        cashBalance: 0,
        netCashFlow: -1000
      }];
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should return null when burn rate is zero or negative (profitable)', () => {
      const signals = generateCashFlowSignals(100000, -5000); // Profitable
      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should detect critical liquidity risk (runway < 3 months)', () => {
      const signals = generateCashFlowSignals(50000, 20000); // 2.5 months runway

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.type).toBe('risk');
      expect(result!.severity).toBe('critical');
      expect(result!.domain).toBe('forecast');
      expect(result!.timeHorizon).toBe('immediate');
      expect(result!.message).toContain('liquidity');
      expect(result!.message).toContain('2.5 months');
    });

    it('should detect warning liquidity risk (runway 3-6 months)', () => {
      const signals = generateCashFlowSignals(100000, 20000); // 5 months runway

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.timeHorizon).toBe('near-term');
      expect(result!.message).toContain('liquidity');
      expect(result!.message).toContain('5.0 months');
    });

    it('should detect informational liquidity risk (runway 6-12 months)', () => {
      const signals = generateCashFlowSignals(200000, 20000); // 10 months runway

      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('informational');
      expect(result!.timeHorizon).toBe('medium-term');
      expect(result!.message).toContain('liquidity');
      expect(result!.message).toContain('10.0 months');
    });

    it('should return null for healthy runway (>= 12 months)', () => {
      const signals = generateCashFlowSignals(300000, 20000); // 15 months runway

      const result = rule.evaluate(mockInput, signals);
      expect(result).toBeNull();
    });

    it('should calculate confidence based on data completeness', () => {
      const signals = generateCashFlowSignals(100000, 20000, 90);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.60);
    });

    it('should include appropriate contributing factors', () => {
      const signals = generateCashFlowSignals(50000, 25000);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.contributingFactors.length).toBeGreaterThan(0);
      expect(result!.contributingFactors.some(f => f.factor.includes('burn rate'))).toBe(true);
    });

    it('should include required conditions in alert', () => {
      const signals = generateCashFlowSignals(100000, 20000);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Estimated runway:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Cash balance:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Average monthly burn:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Data points:'))).toBe(true);
      expect(result!.conditions.some(c => c.includes('Recommendations:'))).toBe(true);
    });

    it('should generate appropriate recommendations for critical runway', () => {
      const signals = generateCashFlowSignals(40000, 20000);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('immediate cash preservation'))).toBe(true);
    });

    it('should generate appropriate recommendations for warning runway', () => {
      const signals = generateCashFlowSignals(100000, 20000);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('cost control'))).toBe(true);
    });

    it('should generate appropriate recommendations for informational runway', () => {
      const signals = generateCashFlowSignals(200000, 20000);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('monitoring'))).toBe(true);
    });

    it('should handle edge case with exactly 30 days of data', () => {
      const signals = generateCashFlowSignals(100000, 20000, 30);
      const result = rule.evaluate(mockInput, signals);
      
      expect(result).not.toBeNull();
      expect(result!.conditions.some(c => c.includes('Data points: 30 days'))).toBe(true);
    });

    it('should increase confidence with more data points', () => {
      const signals60Days = generateCashFlowSignals(100000, 20000, 60);
      const signals120Days = generateCashFlowSignals(100000, 20000, 120);

      const result60 = rule.evaluate(mockInput, signals60Days);
      const result120 = rule.evaluate(mockInput, signals120Days);
      
      expect(result60).not.toBeNull();
      expect(result120).not.toBeNull();
      expect(result120!.confidence).toBeGreaterThan(result60!.confidence);
    });
  });
});
