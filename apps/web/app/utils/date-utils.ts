// Date utility functions
export function formatDate(date: Date, locale: string = 'th-TH'): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date, locale: string = 'th-TH'): string {
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getTimeAgo(date: Date, locale: string = 'th-TH'): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return locale === 'th-TH' ? 'เมื่อสักครู่' : 'Just now';
  } else if (diffMins < 60) {
    return locale === 'th-TH' 
      ? `${diffMins} นาทีที่แล้ว` 
      : `${diffMins} minutes ago`;
  } else if (diffHours < 24) {
    return locale === 'th-TH' 
      ? `${diffHours} ชั่วโมงที่แล้ว` 
      : `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return locale === 'th-TH' 
      ? `${diffDays} วันที่แล้ว` 
      : `${diffDays} days ago`;
  } else {
    return formatDate(date, locale);
  }
}
