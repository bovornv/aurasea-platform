/**
 * Simulation removed. Platform runs on REAL Supabase data only.
 * Stub exports for backwards compatibility; no simulation state or logic.
 */
'use client';

import type { ReactNode } from 'react';

export interface SimulationState {
  active: false;
  datasetName: null;
  scenario: string;
  simulatedBranches: [];
  version: number;
  dailyMetrics?: undefined;
  startDate?: undefined;
  endDate?: undefined;
}

const INERT_STATE: SimulationState = {
  active: false,
  datasetName: null,
  scenario: 'healthy',
  simulatedBranches: [],
  version: 0,
};

export function SimulationProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useSimulation(): SimulationState {
  return INERT_STATE;
}
