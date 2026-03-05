// Shared alert store - Alert data is shared to support navigation and reloads during MVP
// This ensures Alerts list and Alert Detail pages use the SAME source of truth
'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';

interface AlertStoreContextType {
  alerts: AlertContract[];
  setAlerts: (alerts: AlertContract[]) => void;
  getAlertById: (id: string) => AlertContract | null;
  refreshAlerts: () => Promise<void>;
  isLoading: boolean;
}

const AlertStoreContext = createContext<AlertStoreContextType | undefined>(undefined);

export function AlertStoreProvider({ children }: { children: ReactNode }) {
  // STABILITY: Ensure default state is never undefined
  const [alerts, setAlertsState] = useState<AlertContract[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const setAlerts = useCallback((newAlerts: AlertContract[]) => {
    // STABILITY: Ensure we always set a valid array
    const safeAlerts = Array.isArray(newAlerts) ? newAlerts : [];
    setAlertsState(safeAlerts);
    setIsLoading(false);
  }, []);

  const getAlertById = useCallback((id: string): AlertContract | null => {
    // Try exact ID match first
    const exactMatch = alerts.find(a => a.id === id);
    if (exactMatch) return exactMatch;
    
    // If no exact match but there's exactly one alert, use it
    // This handles dynamic alert regeneration during MVP
    if (alerts.length === 1) {
      return alerts[0];
    }
    
    return null;
  }, [alerts]);

  const refreshAlerts = useCallback(async () => {
    // This will be called by hooks that fetch alerts
    // The actual fetching happens in the hooks, they call setAlerts
    setIsLoading(true);
  }, []);

  // STABILITY: Ensure context value is always defined
  const contextValue = {
    alerts: Array.isArray(alerts) ? alerts : [],
    setAlerts,
    getAlertById,
    refreshAlerts,
    isLoading: Boolean(isLoading),
  };

  return (
    <AlertStoreContext.Provider value={contextValue}>
      {children}
    </AlertStoreContext.Provider>
  );
}

export function useAlertStore() {
  const context = useContext(AlertStoreContext);
  if (!context) {
    throw new Error('useAlertStore must be used within AlertStoreProvider');
  }
  return context;
}
