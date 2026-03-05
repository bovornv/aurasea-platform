// Hook for fetching full alert detail with explanation from SME OS
// Uses shared alert store to ensure Alerts list and Alert Detail pages use the SAME source
'use client';

import { useEffect, useState } from 'react';
import { smeOSService } from '../services/sme-os-service';
import { getHospitalityData } from '../services/hospitality-data-service';
import { useAlertStore } from '../contexts/alert-store-context';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { explainerService } from '../services/explainer-service';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

interface AlertDetail {
  alert: AlertContract | null;
  explanation: {
    primaryFactor: string;
    contributingFactors: string[];
    dataQuality: {
      completeness: string;
      historicalCoverage: string;
      variance: string;
    };
    impactAnalysis?: {
      revenueImpact?: string;
      occupancyImpact?: string;
      volumeImpact?: string;
    };
    utilizationAnalysis?: {
      averageOccupancy?: string;
      peakDayPattern?: string;
      consistencyPattern?: string;
    };
    profitabilityAnalysis?: {
      breakEvenAssessment?: string;
      revenueGapAnalysis?: string;
      riskLevel?: string;
    };
  };
  evaluation: {
    confidence: number;
    historicalVariance: number;
    dataCompleteness: number;
    historicalSpan: number;
  };
}

export function useHospitalityAlertDetail(id: string) {
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { getAlertById, alerts: storeAlerts, setAlerts: setStoreAlerts } = useAlertStore();
  const { setup } = useBusinessSetup();

  useEffect(() => {
    async function loadDetail() {
      try {
        setLoading(true);
        setNotFound(false);
        
        // Always try to get alert from shared store first (set by Alerts list page)
        let matchingAlert = getAlertById(id);
        
        // If no match found, fetch alerts to populate/refresh store
        // This handles page reloads, direct navigation, and ID mismatches
        if (!matchingAlert) {
          const freshAlerts = await smeOSService.getAlerts(setup.isCompleted ? setup : null);
          setStoreAlerts(freshAlerts);
          
          // Try to find by ID, or use single alert if only one exists
          // This handles dynamic alert regeneration where IDs change
          matchingAlert = freshAlerts.find(a => a.id === id) || (freshAlerts.length === 1 ? freshAlerts[0] : null);
        }
        
        if (!matchingAlert) {
          // Alert not found - this is expected if alert was from a previous session
          // or no longer active. Set notFound flag instead of error.
          setNotFound(true);
          setLoading(false);
          return;
        }
        
        // Check if this is a cash alert (has cash-runway in ID)
        const isCashAlert = matchingAlert.id.includes('cash-runway') || matchingAlert.domain === 'cash';
        
        let explanation;
        let evaluation;
        
        if (isCashAlert) {
          // For cash alerts, get full explanation from cash evaluator
          const hospitalityData = await getHospitalityData(setup.isCompleted ? setup : null);
          const result = await smeOSService.evaluateHospitalityData(hospitalityData);
          explanation = result.explanation;
          evaluation = result.evaluation;
        } else {
          // For other alerts, use explainer service to get proper explanations
          try {
            explanation = await explainerService.explain(matchingAlert);
          } catch (err) {
            console.error('Failed to get explanation from explainer service:', err);
            // Fallback to generic explanation
            explanation = {
              primaryFactor: matchingAlert.message,
              contributingFactors: matchingAlert.contributingFactors.map(cf => cf.factor),
              dataQuality: {
                completeness: `Data completeness: ${Math.round(matchingAlert.confidence * 100)}%`,
                historicalCoverage: 'Historical data span: Based on operational signals',
                variance: 'Historical variance: Calculated from signal trends'
              }
            };
          }
          
          evaluation = {
            confidence: matchingAlert.confidence,
            historicalVariance: 0,
            dataCompleteness: matchingAlert.confidence,
            historicalSpan: 0
          };
        }
        
        setDetail({
          alert: matchingAlert,
          explanation,
          evaluation
        });
      } catch (err) {
        // Only set error for actual failures, not for "not found"
        console.error('Failed to load alert detail:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadDetail();
    }
    // Re-run when store alerts change (when alerts list page populates store)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, storeAlerts.length]);

  return { detail, loading, notFound };
}
