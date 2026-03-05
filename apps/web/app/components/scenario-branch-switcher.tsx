/**
 * Developer Scenario Branch Switcher
 * 
 * PART 1-7: Refactored to load real daily datasets from Supabase
 * Switches between scenario branches (Healthy/Stressed/Crisis) and loads
 * unified daily_metrics table directly from Supabase.
 * 
 * No simulation dependencies - pure Supabase data.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { businessGroupService } from '../services/business-group-service';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { calculateRollingMetrics } from '../utils/rolling-metrics-calculator';
import { getDailyMetrics } from '../services/db/daily-metrics-service';
import { monitoringService } from '../services/monitoring-service';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useAlertStore } from '../contexts/alert-store-context';
import { useTestMode } from '../providers/test-mode-provider';
import { invalidateAllDerivedState, invalidateBranchState } from '../utils/cache-invalidation';

// PART 2: Scenario-to-branch mapping
const SCENARIO_BRANCHES = {
  accommodation: {
    healthy: 'br-healthy-hotel-001',
    stressed: 'br-stressed-hotel-001',
    crisis: 'br-crisis-hotel-001',
  },
  fnb: {
    healthy: 'br-healthy-fnb-001',
    stressed: 'br-stressed-fnb-001',
    crisis: 'br-crisis-fnb-001',
  },
  accommodation_with_fnb: {
    healthy: 'br-healthy-hotel-fnb-001',
    stressed: 'br-stressed-hotel-fnb-001',
    crisis: 'br-crisis-hotel-fnb-001',
  },
} as const;

type ScenarioType = 'healthy' | 'stressed' | 'crisis';
type BusinessType = 'accommodation' | 'fnb' | 'accommodation_with_fnb';

interface ScenarioBranchSwitcherProps {
  businessType?: BusinessType;
}

export function ScenarioBranchSwitcher({ businessType = 'accommodation' }: ScenarioBranchSwitcherProps) {
  const router = useRouter();
  const { setup } = useBusinessSetup();
  const { testMode } = useTestMode();
  const { setAlerts } = useAlertStore();
  
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<ScenarioType>('healthy');
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [dataConfidence, setDataConfidence] = useState<number>(100);
  const [datasetInfo, setDatasetInfo] = useState<{
    rows: number;
    daysLoaded: number;
    daysMissing7d: number;
    daysMissing30d: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // PART 3: Fetch daily dataset from Supabase
  const loadDailyDataset = useCallback(async (branchId: string, scenario: ScenarioType) => {
    if (!isSupabaseAvailable()) {
      console.error('[SCENARIO_SWITCH] Supabase not available');
      return null;
    }

    try {
      console.log('[SCENARIO_SWITCH]', { 
        selectedBranch: branchId, 
        scenario,
        businessType 
      });

      setIsLoading(true);

      // Unified daily_metrics: Fetch all data from single table
      const dailyMetrics = await getDailyMetrics(branchId, 30);

      // PART 7: Console debug
      console.log('[DATASET_LOADED]', {
        branchId,
        scenario,
        unifiedRows: dailyMetrics.length,
        hasAccommodation: dailyMetrics.some(m => m.roomsSold !== undefined),
        hasFnb: dailyMetrics.some(m => m.customers !== undefined),
      });

      // PART 5: Validation - check if we have enough data (Data Guard)
      if (dailyMetrics.length === 0) {
        console.warn('[SCENARIO_SWITCH] No daily metrics found for branch:', branchId);
        setDataConfidence(0);
        setDatasetInfo({
          rows: 0,
          daysLoaded: 0,
          daysMissing7d: 7,
          daysMissing30d: 30,
        });
        return null;
      }

      // PART 4: Compute rolling metrics from unified daily_metrics
      // All accommodation and F&B data is in the same table
      const rollingMetrics = calculateRollingMetrics(dailyMetrics);

      // PART 5: Calculate confidence with validation rules
      let confidence = rollingMetrics.confidence_score;
      
      // PART 5: Additional validation rules
      if (rollingMetrics.days_loaded < 7) {
        confidence = Math.max(0, confidence - 20); // Reduce by 20% if < 7 days
      }
      if (rollingMetrics.days_loaded < 30) {
        confidence = Math.min(80, confidence); // Cap at 80% if < 30 days
      }
      
      // Check for missing recent days (last 3 days)
      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const recentMetrics = dailyMetrics.filter(m => {
        const metricDate = new Date(m.date);
        return metricDate >= threeDaysAgo;
      });
      
      if (recentMetrics.length < 2) {
        confidence = Math.max(0, confidence - 15); // Reduce further if missing recent days
      }
      
      setDataConfidence(confidence);
      setDatasetInfo({
        rows: dailyMetrics.length,
        daysLoaded: rollingMetrics.days_loaded,
        daysMissing7d: rollingMetrics.days_missing_7d,
        daysMissing30d: rollingMetrics.days_missing_30d,
      });

      // PART 1: Clear all cached state - no simulation dependencies
      invalidateAllDerivedState();
      invalidateBranchState(branchId);

      // PART 4: Set branch in businessGroupService BEFORE calling monitoring
      // This ensures monitoringService.evaluate can find the branch
      businessGroupService.setCurrentBranch(branchId);

      // Small delay to ensure branch is set and cache is cleared
      await new Promise(resolve => setTimeout(resolve, 100));

      // PART 4: Trigger monitoring evaluation
      // monitoringService will use businessGroupService.getCurrentBranchId()
      // It will fetch fresh data from Supabase (no simulation)
      const { alerts } = await monitoringService.evaluate(
        setup.isCompleted ? setup : null,
        {
          businessType: null, // No test mode - PART 1: Remove simulation dependency
          scenario: null, // No test mode
          version: testMode.version,
        },
        null // No organizationId - using branch directly
      );

      setAlerts(alerts);

      // PART 7: Console debug
      console.log('[HEALTH_RECALCULATED]', {
        branchId,
        scenario,
        confidenceScore: confidence,
        alertsCount: alerts.length,
        revenue7d: rollingMetrics.revenue_7d,
        revenue30d: rollingMetrics.revenue_30d,
      });

      return {
        dailyMetrics,
        // Unified: F&B data is in dailyMetrics
        rollingMetrics,
        confidence,
      };
    } catch (error) {
      console.error('[SCENARIO_SWITCH] Failed to load dataset:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [setup, testMode.version, businessType, setAlerts]);

  // Handle scenario change
  const handleScenarioChange = useCallback(async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newScenario = event.target.value as ScenarioType;
    const branchId = SCENARIO_BRANCHES[businessType][newScenario];

    if (!branchId) {
      console.error('[SCENARIO_SWITCH] Invalid branch ID for scenario:', newScenario);
      return;
    }

    setCurrentScenario(newScenario);
    setCurrentBranchId(branchId);

    // PART 6: Show loading spinner, reset graphs
    setIsLoading(true);
    setDataConfidence(0);
    setDatasetInfo(null);

    // Load dataset (this will also set the branch and trigger monitoring)
    const result = await loadDailyDataset(branchId, newScenario);

      if (result) {
        // PART 6: Dispatch events for components that listen
        if (typeof window !== 'undefined') {
          // Dispatch scenario branch changed event
          window.dispatchEvent(new CustomEvent('scenarioBranchChanged', {
            detail: { branchId, scenario: newScenario }
          }));
          
          // Dispatch force recalculation event (same as organization switcher)
          window.dispatchEvent(new CustomEvent('forceRecalculation', {
            detail: { 
              branchId,
              reason: 'scenario_branch_changed'
            }
          }));
        }
        
        // PART 6: Trigger page refresh to update all components
        router.refresh();
      }
  }, [businessType, loadDailyDataset, router]);

  // Load initial scenario on mount
  useEffect(() => {
    if (!mounted) return;

    const currentBranchIdFromService = businessGroupService.getCurrentBranchId();
    
    // Check if current branch matches any scenario branch
    for (const [scenario, branchId] of Object.entries(SCENARIO_BRANCHES[businessType])) {
      if (branchId === currentBranchIdFromService) {
        setCurrentScenario(scenario as ScenarioType);
        setCurrentBranchId(branchId);
        loadDailyDataset(branchId, scenario as ScenarioType);
        return;
      }
    }

    // Default to healthy scenario
    const defaultBranchId = SCENARIO_BRANCHES[businessType].healthy;
    setCurrentScenario('healthy');
    setCurrentBranchId(defaultBranchId);
    loadDailyDataset(defaultBranchId, 'healthy');
  }, [mounted, businessType, loadDailyDataset]);

  // Only show in development mode
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  if (!mounted) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '1rem',
        backgroundColor: '#eff6ff',
        marginBottom: '1.5rem',
      }}
    >
      <label
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
          color: '#1e40af',
        }}
      >
        Developer Scenario Switch (Real Data)
      </label>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <select
          value={currentScenario}
          onChange={handleScenarioChange}
          disabled={isLoading}
          style={{
            padding: '0.5rem',
            borderRadius: '6px',
            border: '1px solid #3b82f6',
            fontSize: '0.875rem',
            backgroundColor: '#ffffff',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            minWidth: '150px',
            fontWeight: 500,
          }}
        >
          <option value="healthy">Healthy</option>
          <option value="stressed">Stressed</option>
          <option value="crisis">Crisis</option>
        </select>

        {isLoading && (
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Loading dataset...
          </span>
        )}

        {datasetInfo && !isLoading && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            <div>Rows: {datasetInfo.rows} | Days: {datasetInfo.daysLoaded}/30</div>
            <div>Confidence: {dataConfidence.toFixed(0)}%</div>
            {datasetInfo.daysMissing7d > 0 && (
              <div style={{ color: '#f59e0b' }}>
                Missing {datasetInfo.daysMissing7d} days in last 7
              </div>
            )}
            {datasetInfo.daysMissing30d > 0 && (
              <div style={{ color: '#ef4444' }}>
                Missing {datasetInfo.daysMissing30d} days in last 30
              </div>
            )}
          </div>
        )}
      </div>

      {currentBranchId && (
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
          Branch: {currentBranchId} | Switching scenario loads daily data from Supabase and recalculates health scores, alerts, and exposure.
        </p>
      )}
    </div>
  );
}
