/**
 * Simulation Configuration
 * 
 * Global configuration for simulation mode.
 * Simulation must be explicitly enabled - no auto-detection.
 */

/**
 * Global simulation flag
 * Set to true ONLY when simulation is explicitly enabled.
 * Default: false (real data mode)
 */
export const IS_SIMULATION = false;

/**
 * Check if simulation mode is enabled
 * Only returns true if explicitly enabled via IS_SIMULATION constant
 */
export function isSimulationEnabled(): boolean {
  return IS_SIMULATION;
}
