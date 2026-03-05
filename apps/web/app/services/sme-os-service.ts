// Service layer for calling SME OS
// This is the boundary between the platform and SME OS

import { CashEvaluator } from '../../../../core/sme-os/engine/evaluators/cash-evaluator';
import { CashExplainer } from '../../../../core/sme-os/engine/explainers/cash-explainer';
import type { InputContract } from '../../../../core/sme-os/contracts/inputs';
import type { OutputContract } from '../../../../core/sme-os/contracts/outputs';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import { translateToSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityInput } from '../adapters/hospitality-adapter';
import { getHospitalityData } from './hospitality-data-service';
import type { BusinessSetup } from '../contexts/business-setup-context';

/**
 * Service for interacting with SME OS
 * This is the only place the platform calls SME OS
 */
export class SMEOSService {
  private cashEvaluator: CashEvaluator;
  private cashExplainer: CashExplainer;

  constructor() {
    this.cashEvaluator = new CashEvaluator();
    this.cashExplainer = new CashExplainer();
  }

  /**
   * Evaluate hospitality data using real SME OS CashEvaluator
   */
  async evaluateHospitalityData(input: HospitalityInput): Promise<{
    alert: AlertContract | null;
    evaluation: ReturnType<CashEvaluator['evaluate']>['evaluation'];
    explanation: ReturnType<CashExplainer['explain']>;
  }> {
    // Translate hospitality input to SME OS contract
    const smeOSInput = translateToSMEOS(input);
    
    // Call real SME OS CashEvaluator
    const { alert, evaluation } = this.cashEvaluator.evaluate(smeOSInput);
    
    // Get explanation if alert exists
    let explanation;
    if (alert) {
      explanation = this.cashExplainer.explain(alert, evaluation);
    } else {
      explanation = {
        primaryFactor: 'No alert generated',
        contributingFactors: [],
        dataQuality: {
          completeness: `Data completeness: ${Math.round(evaluation.dataCompleteness * 100)}%`,
          historicalCoverage: `Historical data span: ${Math.round(evaluation.historicalSpan)} days`,
          variance: `Historical variance: ${evaluation.historicalVariance.toFixed(2)} coefficient`
        }
      };
    }
    
    return { alert, evaluation, explanation };
  }

  /**
   * Get all alerts for hospitality business
   * For MVP, evaluates current hospitality data and returns alerts
   */
  async getAlerts(setup: BusinessSetup | null = null): Promise<AlertContract[]> {
    const hospitalityData = await getHospitalityData(setup);
    const { alert } = await this.evaluateHospitalityData(hospitalityData);
    
    return alert ? [alert] : [];
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id: string): Promise<AlertContract | null> {
    const alerts = await this.getAlerts();
    return alerts.find(a => a.id === id) || null;
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use evaluateHospitalityData instead
   */
  async evaluateScenario(input: HospitalityInput): Promise<OutputContract> {
    const smeOSInput = translateToSMEOS(input);
    const { alert, evaluation } = this.cashEvaluator.evaluate(smeOSInput);
    
    return {
      evaluation: {
        scenarioId: 'current',
        timestamp: new Date(),
        confidence: evaluation.confidence,
        dataQuality: evaluation.dataCompleteness,
        modelCertainty: evaluation.confidence
      },
      alerts: alert ? [alert] : [],
      explanation: {
        reasoning: alert ? alert.message : 'No alert generated',
        contributingFactors: alert?.contributingFactors.map(cf => ({
          factor: cf.factor,
          impact: cf.weight > 0.7 ? 'high' as const : cf.weight > 0.4 ? 'medium' as const : 'low' as const,
          direction: 'negative' as const // Cash alerts are typically negative
        })) || [],
        context: 'Cash runway evaluation',
        implications: alert ? 'Monitor cash position closely' : 'Cash position appears stable'
      }
    };
  }
}

// Singleton instance
export const smeOSService = new SMEOSService();
