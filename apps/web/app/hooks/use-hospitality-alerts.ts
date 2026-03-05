// Hook for fetching hospitality alerts from SME OS
// Uses shared alert store to ensure Alerts list and Alert Detail pages use the SAME source
'use client';

import { useEffect, useState } from 'react';
import { smeOSService } from '../services/sme-os-service';
import { monitoringService, type AlertSuppressionInfo } from '../services/monitoring-service';
import { translateAlertFromSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import { useI18n } from './use-i18n';
import { useAlertStore } from '../contexts/alert-store-context';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useUserSession } from '../contexts/user-session-context';
import { filterAlertsByPermissions } from '../services/permissions-service';
import { useOrganization } from '../contexts/organization-context';

export function useHospitalityAlerts() {
  const [alerts, setAlerts] = useState<HospitalityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [suppressionInfo, setSuppressionInfo] = useState<AlertSuppressionInfo | null>(null);
  const [alertsInitializing, setAlertsInitializing] = useState(false);
  const { locale } = useI18n();
  const { setAlerts: setStoreAlerts } = useAlertStore();
  const { setup } = useBusinessSetup();
  const { permissions } = useUserSession();
  const { activeOrganizationId } = useOrganization();

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    async function loadAlerts() {
      try {
        if (!mounted) return;
        setLoading(true);
        setError(null);

        if (setup.isCompleted) {
          const { alerts: monitoringAlerts, suppressionInfo: suppression, alertsInitializing: init } = await monitoringService.evaluate(setup, undefined, activeOrganizationId);
          
          if (!mounted) return;
          
          setAlertsInitializing(init === true);
          // Ensure alerts is valid array
          const safeAlerts = Array.isArray(monitoringAlerts) ? monitoringAlerts : [];
          
          // Filter alerts by user permissions (prevent cross-branch data leakage)
          const filteredAlerts = filterAlertsByPermissions(safeAlerts, permissions);
          
          // STABILITY: Shallow equality check before setting state
          // Store raw alerts in shared store (for Alert Detail page to use)
          setStoreAlerts(filteredAlerts);
          
          // Only update suppressionInfo if it changed
          const newSuppressionInfo = suppression || null;
          setSuppressionInfo(prev => {
            if (prev === newSuppressionInfo) return prev;
            if (prev && newSuppressionInfo && JSON.stringify(prev) === JSON.stringify(newSuppressionInfo)) return prev;
            return newSuppressionInfo;
          });
          
          // Translate for UI display
          const hospitalityAlerts = filteredAlerts.map(alert => translateAlertFromSMEOS(alert, locale));
          
          // STABILITY: Only update if alerts actually changed (shallow comparison)
          setAlerts(prev => {
            if (prev.length === hospitalityAlerts.length) {
              const hasChanged = prev.some((p, i) => {
                const n = hospitalityAlerts[i];
                return !n || p.id !== n.id || p.severity !== n.severity;
              });
              if (!hasChanged) return prev;
            }
            return hospitalityAlerts;
          });
        } else {
          setAlertsInitializing(false);
          // Fallback to direct SME OS call if setup not completed
          const smeOSAlerts = await smeOSService.getAlerts(null);
          
          if (!mounted) return;
          
          // Ensure alerts is valid array
          const safeAlerts = Array.isArray(smeOSAlerts) ? smeOSAlerts : [];
          // Filter alerts by user permissions
          const filteredAlerts = filterAlertsByPermissions(safeAlerts, permissions);
          setStoreAlerts(filteredAlerts);
          
          // STABILITY: Only update suppressionInfo if it changed
          setSuppressionInfo(prev => prev === null ? null : null);
          
          const hospitalityAlerts = filteredAlerts.map(alert => translateAlertFromSMEOS(alert, locale));
          
          // STABILITY: Only update if alerts actually changed
          setAlerts(prev => {
            if (prev.length === hospitalityAlerts.length) {
              const hasChanged = prev.some((p, i) => {
                const n = hospitalityAlerts[i];
                return !n || p.id !== n.id || p.severity !== n.severity;
              });
              if (!hasChanged) return prev;
            }
            return hospitalityAlerts;
          });
        }
        
        if (mounted) {
          setLastUpdated(new Date());
        }
      } catch (err) {
        // Set safe defaults on error
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load alerts'));
          setAlerts([]);
          setSuppressionInfo(null);
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

    loadAlerts();

    const handleOrganizationChange = () => {
      if (mounted) {
        setAlerts([]);
        setLoading(true);
        loadAlerts();
      }
    };

    const handleForceRecalculation = () => {
      if (mounted) {
        setAlerts([]);
        setLoading(true);
        loadAlerts();
      }
    };

    window.addEventListener('organizationChanged', handleOrganizationChange);
    window.addEventListener('forceRecalculation', handleForceRecalculation);

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('organizationChanged', handleOrganizationChange);
      window.removeEventListener('forceRecalculation', handleForceRecalculation);
    };
  }, [setup, permissions, locale, setStoreAlerts, activeOrganizationId]);

  const refreshAlerts = async () => {
    try {
      setLoading(true);
      setError(null);

      if (setup.isCompleted) {
        const { alerts: monitoringAlerts, suppressionInfo: suppression, alertsInitializing: init } = await monitoringService.evaluate(setup, undefined, activeOrganizationId || undefined);
        
        setAlertsInitializing(init === true);
        // Filter alerts by user permissions (prevent cross-branch data leakage)
        const filteredAlerts = filterAlertsByPermissions(monitoringAlerts, permissions);
        
        // Store raw alerts in shared store (for Alert Detail page to use)
        setStoreAlerts(filteredAlerts);
        setSuppressionInfo(suppression);
        
        // Translate for UI display
        const hospitalityAlerts = filteredAlerts.map(alert => translateAlertFromSMEOS(alert, locale));
        setAlerts(hospitalityAlerts);
      } else {
        // Fallback to direct SME OS call if setup not completed
        const smeOSAlerts = await smeOSService.getAlerts(null);
        // Filter alerts by user permissions
        const filteredAlerts = filterAlertsByPermissions(smeOSAlerts, permissions);
        setStoreAlerts(filteredAlerts);
        setSuppressionInfo(null);
        const hospitalityAlerts = filteredAlerts.map(alert => translateAlertFromSMEOS(alert, locale));
        setAlerts(hospitalityAlerts);
      }
      
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh alerts'));
      setAlerts([]);
      setSuppressionInfo(null);
      setAlertsInitializing(false);
    } finally {
      setLoading(false);
    }
  };

  // Calculate alert counts by severity
  const alertCounts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    informational: alerts.filter(a => a.severity === 'informational').length,
    total: alerts.length
  };

  return { alerts, loading, error, lastUpdated, alertCounts, refreshAlerts, suppressionInfo, alertsInitializing };
}
