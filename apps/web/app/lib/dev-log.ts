/**
 * Development-only logging. No-op in production to avoid console spam and leakage.
 */
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}

export function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(...args);
  }
}

export function devDebug(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug(...args);
  }
}

export const isProd = process.env.NODE_ENV === 'production';
