// Formatting utilities
/**
 * Format currency number with commas, no decimals, no currency symbol
 * Example: 1234567 -> "1,234,567"
 */
export function formatCurrency(amount: number | null | undefined, locale: string = 'en-US'): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0';
  if (!isFinite(amount)) {
    // Handle Infinity and -Infinity
    if (amount === Infinity) return '∞';
    if (amount === -Infinity) return '-∞';
    return '0';
  }
  return Math.round(amount).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, locale: string = 'th-TH'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
