// Output contracts for SME OS to return results to vertical apps

import type { AlertContract } from './alerts';

export interface ContributingFactor {
  factor: string;
  impact: 'high' | 'medium' | 'low';
  direction: 'positive' | 'negative';
}

export interface Recommendation {
  type: 'consider' | 'monitor' | 'review';
  description: string; // generic description
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term';
  tradeoffs: {
    benefits: string[];
    costs: string[];
  };
}

export interface OutputContract {
  evaluation: {
    scenarioId: string;
    timestamp: Date;
    confidence: number; // 0-1 scale
    dataQuality: number; // 0-1 scale
    modelCertainty: number; // 0-1 scale
  };
  alerts: AlertContract[];
  explanation: {
    reasoning: string; // generic explanation
    contributingFactors: ContributingFactor[];
    context: string;
    implications: string;
  };
  recommendations?: Recommendation[];
}
