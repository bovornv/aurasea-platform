/**
 * Centralized data freshness (single source of truth).
 * Used by: Today page (KPI chip) and Enter Data page (badge).
 *
 * Input: metric_date only from raw tables (fnb_daily_metrics / accommodation_daily_metrics).
 * Never use: *_today_summary, *_latest_metrics, or created_at.
 * Today: Asia/Bangkok. Compare: latest === today → "Updated Today".
 */

const BANGKOK_TZ = 'Asia/Bangkok';

export type FreshnessStatus = 'missing' | 'today' | 'yesterday' | 'stale';
export type FreshnessColor = 'green' | 'yellow' | 'red';

export interface DataFreshnessResult {
  status: FreshnessStatus;
  label: string;
  color: FreshnessColor;
  /** Latest metric_date (YYYY-MM-DD) when available; null when missing */
  latest: string | null;
}

function getTodayBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ });
}

/**
 * Compute freshness from an array of metric_date strings (YYYY-MM-DD).
 * Uses Asia/Bangkok for "today". Same logic for accommodation and F&B.
 */
export function getDataFreshnessStatus(
  dates: string[],
  locale: 'en' | 'th' = 'en'
): DataFreshnessResult {
  const normalized = (dates ?? [])
    .map((d) => (d ? String(d).slice(0, 10) : ''))
    .filter(Boolean);
  if (normalized.length === 0) {
    return {
      status: 'missing',
      label: locale === 'th' ? 'ไม่มีข้อมูล' : 'No Data',
      color: 'red',
      latest: null,
    };
  }

  const today = getTodayBangkok();
  const latest = [...normalized].sort().reverse()[0]!;

  if (latest === today) {
    return {
      status: 'today',
      label: locale === 'th' ? 'อัปเดตวันนี้' : 'Updated Today',
      color: 'green',
      latest,
    };
  }

  const diffDays = Math.floor(
    (new Date(today + 'T12:00:00.000Z').getTime() -
      new Date(latest + 'T12:00:00.000Z').getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (diffDays === 1) {
    return {
      status: 'yesterday',
      label: locale === 'th' ? 'ล่าสุด: เมื่อวาน' : 'Last: Yesterday',
      color: 'yellow',
      latest,
    };
  }

  return {
    status: 'stale',
    label: locale === 'th' ? `ล่าสุด: ${latest}` : `Last: ${latest}`,
    color: 'red',
    latest,
  };
}

/**
 * Single source of truth for all freshness indicators (Today KPI chip, Enter Data badge, Last line).
 * Same logic, same label, same date source (metric_date only). Optional locale for i18n.
 */
export function getDataFreshness(dates: string[], locale: 'en' | 'th' = 'en'): DataFreshnessResult {
  return getDataFreshnessStatus(dates, locale);
}
