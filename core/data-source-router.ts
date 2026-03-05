/**
 * Data Source Router
 * 
 * Centralized decision point for data source selection.
 * Ensures single source of truth when simulation is active.
 */

export type DataSource = 'SIMULATION' | 'REAL';

export interface SimulationState {
  active: boolean;
  datasetName?: string | null;
  scenario?: string | null;
  simulatedBranches?: Array<{ branchId: string; [key: string]: any }>;
}

/**
 * Resolve data source based on simulation state
 * 
 * @param simulationState - Current simulation state (from SimulationContext)
 * @returns 'SIMULATION' if simulation is active, 'REAL' otherwise
 */
export function resolveDataSource(simulationState?: SimulationState | null): DataSource {
  if (!simulationState) {
    return 'REAL';
  }
  
  if (simulationState.active === true) {
    return 'SIMULATION';
  }
  
  return 'REAL';
}

/**
 * Check if simulation mode is active
 */
export function isSimulationMode(simulationState?: SimulationState | null): boolean {
  return resolveDataSource(simulationState) === 'SIMULATION';
}

/**
 * Check if real mode is active
 */
export function isRealMode(simulationState?: SimulationState | null): boolean {
  return resolveDataSource(simulationState) === 'REAL';
}
