/**
 * Real Data Guard
 *
 * System operates in REAL mode only. No simulation or test mode.
 */

/**
 * Check if real data only mode is enabled (always true; simulation removed).
 */
export function isRealDataOnlyMode(): boolean {
  return true;
}

/**
 * Always returns real data source; no simulation or test mode.
 */
export function checkRealDataGuard(): {
  simulationActive: boolean;
  testModeActive: boolean;
  dataSource: 'REAL_SUPABASE' | 'SIMULATION' | 'TEST_MODE';
} {
  return {
    simulationActive: false,
    testModeActive: false,
    dataSource: 'REAL_SUPABASE',
  };
}

/**
 * No-op; simulation has been removed.
 */
export function enforceRealDataOnly(): void {}
