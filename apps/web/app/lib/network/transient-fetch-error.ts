/**
 * Detect browser/network failures (offline, DNS, CORS layer, etc.) and avoid log spam.
 * Reset via resetTransientNetworkLogs() when the app is back online.
 */

const loggedKeys = new Set<string>();

export function isTransientNetworkError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message)
        : String(err);
  const m = msg.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network error') ||
    m.includes('load failed') ||
    m.includes('net::err') ||
    m.includes('network request failed') ||
    m.includes('fetch failed') ||
    m === 'typeerror: failed to fetch'
  );
}

/** Log at most once per key until {@link resetTransientNetworkLogs} runs (e.g. on `online`). */
export function logTransientNetworkOnce(key: string, err: unknown, label: string): void {
  if (!isTransientNetworkError(err)) return;
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  if (process.env.NODE_ENV === 'development') {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[${label}] offline / network unreachable (logged once until back online): ${detail}`);
  }
}

export function resetTransientNetworkLogs(): void {
  loggedKeys.clear();
}
