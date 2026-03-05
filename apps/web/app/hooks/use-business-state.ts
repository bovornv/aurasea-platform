// Custom hook for fetching business state summary
'use client';

import { useEffect, useState } from 'react';
import { businessStateService } from '../services/business-state-service';
import type { BusinessStateSummary } from '../services/business-state-service';

export function useBusinessState() {
  const [summary, setSummary] = useState<BusinessStateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadSummary() {
      try {
        setLoading(true);
        setError(null);
        const data = await businessStateService.getSummary();
        setSummary(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load business state'));
        console.error('Failed to load business state:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, []);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await businessStateService.getSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh business state'));
      console.error('Failed to refresh business state:', err);
    } finally {
      setLoading(false);
    }
  };

  return { summary, loading, error, refresh };
}
