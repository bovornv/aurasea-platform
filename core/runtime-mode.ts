/**
 * Runtime mode. Platform runs in REAL mode only; simulation removed.
 */
export type RuntimeMode = 'REAL';

const currentMode: RuntimeMode = 'REAL';

export function setRuntimeMode(_mode: RuntimeMode): void {
  // No-op: always REAL
}

export function getRuntimeMode(): RuntimeMode {
  return currentMode;
}

export function isRealMode(): boolean {
  return true;
}

export function isTestMode(): boolean {
  return false;
}

export function isSimulationMode(): boolean {
  return false;
}
