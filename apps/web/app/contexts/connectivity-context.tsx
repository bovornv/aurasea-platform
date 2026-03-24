'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resetTransientNetworkLogs } from '../lib/network/transient-fetch-error';

export const AURASEA_ONLINE_EVENT = 'aurasea:online';

interface ConnectivityContextValue {
  /** Reflects `navigator.onLine` + offline/online events (best-effort). */
  isOnline: boolean;
  /** True while offline, or briefly after coming online while a reconnect pulse runs. */
  showConnectionWarning: boolean;
}

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

function readOnLine(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [reconnectPulse, setReconnectPulse] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearRetryInterval = useCallback(() => {
    if (retryIntervalRef.current != null) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
  }, []);

  const pulseReconnect = useCallback(() => {
    clearReconnectTimer();
    setReconnectPulse(true);
    reconnectTimerRef.current = setTimeout(() => {
      setReconnectPulse(false);
      reconnectTimerRef.current = null;
    }, 2500);
  }, [clearReconnectTimer]);

  const broadcastOnline = useCallback(() => {
    resetTransientNetworkLogs();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AURASEA_ONLINE_EVENT));
    }
    pulseReconnect();
  }, [pulseReconnect]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(readOnLine());

    const onOffline = () => {
      setIsOnline(false);
    };

    const onOnline = () => {
      setIsOnline(true);
      broadcastOnline();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [broadcastOnline]);

  /** While offline, nudge listeners every 8s so hooks can cheaply re-check (navigator may lie). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isOnline) {
      clearRetryInterval();
      return;
    }
    clearRetryInterval();
    retryIntervalRef.current = setInterval(() => {
      if (readOnLine()) {
        setIsOnline(true);
        broadcastOnline();
      } else if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aurasea:offline-poll'));
      }
    }, 8000);
    return () => clearRetryInterval();
  }, [isOnline, broadcastOnline, clearRetryInterval]);

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      clearRetryInterval();
    };
  }, [clearReconnectTimer, clearRetryInterval]);

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      isOnline,
      showConnectionWarning: !isOnline || reconnectPulse,
    }),
    [isOnline, reconnectPulse]
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    throw new Error('useConnectivity must be used within ConnectivityProvider');
  }
  return ctx;
}
