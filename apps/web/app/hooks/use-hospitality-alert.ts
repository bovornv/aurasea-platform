// Hook for fetching a single hospitality alert by ID
'use client';

import { useEffect, useState } from 'react';
import { smeOSService } from '../services/sme-os-service';
import { translateAlertFromSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import { useI18n } from './use-i18n';

export function useHospitalityAlert(id: string) {
  const [alert, setAlert] = useState<HospitalityAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { locale } = useI18n();

  useEffect(() => {
    async function loadAlert() {
      try {
        setLoading(true);
        setError(null);
        const smeOSAlert = await smeOSService.getAlertById(id);
        
        if (smeOSAlert) {
          const hospitalityAlert = translateAlertFromSMEOS(smeOSAlert, locale);
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
