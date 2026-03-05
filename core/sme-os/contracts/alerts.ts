// Alert contracts for SME OS to notify vertical apps

export type AlertSeverity = 'critical' | 'warning' | 'informational';
export type AlertType = 'risk' | 'opportunity' | 'anomaly' | 'threshold';
export type AlertDomain = 'cash' | 'risk' | 'labor' | 'forecast';
export type TimeHorizon = 'immediate' | 'near-term' | 'medium-term' | 'long-term';

export interface AlertContract {
  id: string;
  timestamp: Date;
  type: AlertType;
  severity: AlertSeverity;
  domain: AlertDomain;
  timeHorizon: TimeHorizon;
  relevanceWindow: {
    start: Date;
    end: Date;
  };
  message: string;
  confidence: number; // 0-1 scale
  contributingFactors: Array<{
    factor: string;
    weight: number;
  }>;
  conditions: string[];
  relatedAlerts?: string[];
  decisionHistory?: Array<{
    decisionId: string;
    timestamp: Date;
  }>;
  // Multi-branch support (backward compatible - optional fields)
  branchId?: string;
  businessGroupId?: string;
}
