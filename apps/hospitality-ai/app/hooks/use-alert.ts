// Custom hook for fetching a single alert
'use client';

import { useEffect, useState } from 'react';
import { smeOSService } from '../services/sme-os-service';
import { translateAlertFromSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import { useI18n } from './use-i18n';

export function useAlert(id: string) {
  const [alert, setAlert] = useState<HospitalityAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { locale } = useI18n();

  useEffect(() => {
    async function loadAlert() {
      try {
        setLoading(true);
        setError(null);
        const smeOSAlerts = await smeOSService.getAlerts();
        const foundAlert = smeOSAlerts.find(a => a.id === id);
        
        if (foundAlert) {
          const hospitalityAlert = translateAlertFromSMEOS(foundAlert, locale);
          setAlert(hospitalityAlert);
        } else {
          setError(new Error('Alert not found'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load alert'));
        console.error('Failed to load alert:', err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadAlert();
    }
  }, [id, locale]);

  return { alert, loading, error };
}
