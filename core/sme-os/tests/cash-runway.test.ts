import { CashEvaluator } from '../engine/evaluators/cash-evaluator';
import { CashExplainer } from '../engine/explainers/cash-explainer';
import { InputContract } from '../contracts/inputs';

describe('Cash Runway Alert Tests', () => {
  const evaluator = new CashEvaluator();
  const explainer = new CashExplainer();

  // Test case 1: Critical alert - negative balance
  test('should generate critical alert for negative balance', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 100000,
        cashFlows: [
          // Historical flows for variance calculation
          { date: new Date('2025-12-25'), amount: 50000, direction: 'inflow' },
          { date: new Date('2025-12-26'), amount: 30000, direction: 'outflow' },
          // Future flows causing negative balance
          { date: new Date('2026-02-01'), amount: 120000, direction: 'outflow' },
        ]
      }
    };

    const { alert, evaluation } = evaluator.evaluate(input);
    const explanation = explainer.explain(alert, evaluation);

    expect(alert).toBeTruthy();
    expect(alert?.severity).toBe('critical');
    expect(alert?.domain).toBe('cash');
    expect(explanation.primaryFactor).toContain('negative cash balance');
  });

  // Test case 2: Informational alert - healthy cash position
  test('should generate informational alert for healthy position', () => {
    const input: InputContract = {
      financial: {
        currentBalance: 1000000,
        cashFlows: [
          // Historical flows
          { date: new Date('2025-12-25'), amount: 50000, direction: 'inflow' },
          { date: new Date('2025-12-26'), amount: 30000, direction: 'outflow' },
          // Future flows maintaining healthy balance
          { date: new Date('2026-02-01'), amount: 40000, direction: 'outflow' },
          { date: new Date('2026-02-15'), amount: 60000, direction: 'inflow' },
        ]
      }
    };

    const { alert, evaluation } = evaluator.evaluate(input);
    const explanation = explainer.explain(alert, evaluation);

    expect(alert).toBeTruthy();
    expect(alert?.severity).toBe('informational');
    expect(explanation.primaryFactor).toContain('above 60 days');
    expect(evaluation.confidence).toBeGreaterThan(0);
  });
});
