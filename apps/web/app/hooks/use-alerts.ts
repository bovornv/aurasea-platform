// Custom hook for managing alerts
'use client';

import { useEffect, useState } from 'react';
import { smeOSService } from '../services/sme-os-service';
import { translateAlertFromSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import { sortAlertsBySeverity } from '../utils/alert-utils';
import { useI18n } from './use-i18n';

export function useAlerts() {
  const [alerts, setAlerts] = useState<HospitalityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { locale } = useI18n();

  useEffect(() => {
    async function loadAlerts() {
      try {
        setLoading(true);
        setError(null);
        const smeOSAlerts = await smeOSService.getAlerts();
        const hospitalityAlerts = smeOSAlerts.map(alert => translateAlertFromSMEOS(alert, locale));
        const sortedAlerts = sortAlertsBySeverity(hospitalityAlerts);
        setAlerts(sortedAlerts);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load alerts'));
        console.error('Failed to load alerts:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAlerts();
  }, [locale]);

  const refreshAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const smeOSAlerts = await smeOSService.getAlerts();
      const hospitalityAlerts = smeOSAlerts.map(alert => translateAlertFromSMEOS(alert, locale));
      const sortedAlerts = sortAlertsBySeverity(hospitalityAlerts);
      setAlerts(sortedAlerts);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh alerts'));
      console.error('Failed to refresh alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  return { alerts, loading, error, refreshAlerts };
}
