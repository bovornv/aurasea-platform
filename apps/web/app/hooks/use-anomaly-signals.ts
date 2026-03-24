/**
 * Hook: Branch anomaly signals from branch_anomaly_signals view.
 * Enables early alerts after ~7 days; confidence_score from view.
 */
'use client';

import { useState, useEffect } from 'react';
import {
  getLatestAnomalySignal,
  getAnomalyAlertsFromSignal,
  anomalyAlertsToContracts,
  type BranchAnomalySignalRow,
  type AnomalyAlert,
} from '../services/anomaly-signals-service';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

export interface UseAnomalySignalsResult {
  /** Latest row from branch_anomaly_signals or null */
  anomaly: BranchAnomalySignalRow | null;
  /** Alerts derived from revenue_anomaly_score (< -2 or > 2) */
  anomalyAlerts: AnomalyAlert[];
  /** As AlertContract[] for merging with branch alerts */
  anomalyAlertsAsContracts: AlertContract[];
  /** confidence_score 0–100 from view, or null */
  confidenceScore: number | null;
  loading: boolean;
}

export function useAnomalySignals(
  branchId: string | null,
  locale: 'th' | 'en' = 'en',
  moduleType?: 'accommodation' | 'fnb' | null
): UseAnomalySignalsResult {
  const [anomaly, setAnomaly] = useState<BranchAnomalySignalRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) {
      setAnomaly(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const row = await getLatestAnomalySignal(branchId, {
          uiSurface:
            moduleType === 'fnb' ? 'fnb' : moduleType === 'accommodation' ? 'accommodation' : 'unknown',
        });
        if (!cancelled) setAnomaly(row);
      } catch {
        if (!cancelled) setAnomaly(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, moduleType]);

  const anomalyAlerts = getAnomalyAlertsFromSignal(anomaly, branchId ?? '', locale);
  const anomalyAlertsAsContracts =
    branchId && anomalyAlerts.length > 0
      ? anomalyAlertsToContracts(anomalyAlerts, branchId)
      : [];

  const confidenceScore =
    anomaly?.confidence_score != null
      ? Math.round(Number(anomaly.confidence_score))
      : null;

  return {
    anomaly,
    anomalyAlerts,
    anomalyAlertsAsContracts,
    confidenceScore,
    loading,
  };
}
