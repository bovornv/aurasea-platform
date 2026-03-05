// Hook for monitoring status and trends
'use client';

import { useEffect, useState } from 'react';
import { monitoringService, type MonitoringStatus } from '../services/monitoring-service';
import { operationalSignalsService, type SignalTrend } from '../services/operational-signals-service';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useCurrentBranch } from './use-current-branch';
import { useTestMode } from '../providers/test-mode-provider';
import { businessGroupService } from '../services/business-group-service';

export function useMonitoring() {
  const [status, setStatus] = useState<MonitoringStatus>({
    isActive: false,
    lastEvaluated: null,
    dataCoverageDays: 0,
    evaluationCount: 0,
    lastOperationalUpdateAt: null,
    trackingState: 'stale',
    confidenceImpact: 'none',
    lastReminderSentAt: null,
  });
  const [trends, setTrends] = useState<SignalTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReminder, setShowReminder] = useState(false);
  const { setup } = useBusinessSetup();
  const { branchId, isAllBranches } = useCurrentBranch();
  const { testMode } = useTestMode();
  const businessGroup = businessGroupService.getBusinessGroup();

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    async function loadMonitoring() {
      try {
        if (!mounted) return;
        setLoading(true);

        // REAL mode only: Use real Supabase data
        // FINAL PRODUCTION ARCHITECTURE: Uses daily_metrics via monitoringService.evaluate()
        // Get branch selection for filtering
        const currentBranchId = isAllBranches ? '__all__' : branchId;
        const businessGroupId = businessGroup?.id;
        
        // Always re-evaluate when version changes (especially for simulation mode)
        // This ensures fresh data is evaluated after simulation data is regenerated
        if (setup.isCompleted) {
          // Run evaluation with current testMode/simulation state
          await monitoringService.evaluate(setup, {
            businessType: testMode.businessType,
            scenario: testMode.scenario,
            version: testMode.version,
          });
        }
        
        if (!mounted) return;
        
        const updatedStatus = monitoringService.getStatus(currentBranchId, businessGroupId);
        
        // STABILITY: Only update status if it changed (shallow comparison)
        setStatus(prev => {
          if (prev.isActive === updatedStatus.isActive &&
              prev.lastEvaluated?.getTime() === updatedStatus.lastEvaluated?.getTime() &&
              prev.dataCoverageDays === updatedStatus.dataCoverageDays &&
              prev.evaluationCount === updatedStatus.evaluationCount &&
              prev.trackingState === updatedStatus.trackingState &&
              prev.confidenceImpact === updatedStatus.confidenceImpact) {
            return prev;
          }
          return updatedStatus;
        });
        
        const currentTrends = operationalSignalsService.calculateTrends(currentBranchId, businessGroupId);
        // Ensure trends is valid array
        const safeTrends = Array.isArray(currentTrends) ? currentTrends : [];
        
        // STABILITY: Only update trends if changed
        setTrends(prev => {
          if (prev.length === safeTrends.length) {
            const hasChanged = prev.some((p, i) => {
              const n = safeTrends[i];
              return !n || p.signal !== n.signal || p.direction !== n.direction || p.changePercent !== n.changePercent;
            });
            if (!hasChanged) return prev;
          }
          return safeTrends;
        });
        
        // Check if reminder should be shown
        const shouldShow = monitoringService.shouldShowReminder(updatedStatus.lastOperationalUpdateAt);
        
        // STABILITY: Only update if changed
        setShowReminder(prev => prev === shouldShow ? prev : (shouldShow || false));
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[useMonitoring] Failed to load monitoring status:', err);
        }
        // Set safe defaults on error
        if (mounted) {
          setStatus({
            isActive: false,
            lastEvaluated: null,
            dataCoverageDays: 0,
            evaluationCount: 0,
            lastOperationalUpdateAt: null,
            trackingState: 'stale',
            confidenceImpact: 'none',
            lastReminderSentAt: null,
          });
          setTrends([]);
          setShowReminder(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      }
    }

    loadMonitoring();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [setup.isCompleted, branchId, isAllBranches, businessGroup?.id, testMode.version]);

  const refreshMonitoring = async () => {
    try {
      setLoading(true);
      const currentBranchId = isAllBranches ? '__all__' : branchId;
      const businessGroupId = businessGroup?.id;
      
      // Pass testMode to evaluate for global TEST_MODE support
      const result = await monitoringService.evaluate(setup.isCompleted ? setup : null, {
        businessType: testMode.businessType,
        scenario: testMode.scenario,
        version: testMode.version,
      });
      setStatus(result.status);
      
      const currentTrends = operationalSignalsService.calculateTrends(currentBranchId, businessGroupId);
      setTrends(currentTrends);
      
      // Check if reminder should be shown
      const shouldShow = monitoringService.shouldShowReminder(result.status.lastOperationalUpdateAt);
      setShowReminder(shouldShow);
    } catch (err) {
      console.error('Failed to refresh monitoring:', err);
    } finally {
      setLoading(false);
    }
  };

  const dismissReminder = () => {
    monitoringService.suppressReminder();
    setShowReminder(false);
  };

  return { status, trends, loading, refreshMonitoring, showReminder, dismissReminder };
}
