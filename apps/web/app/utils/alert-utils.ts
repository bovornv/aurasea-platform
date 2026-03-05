// Alert utility functions
import type { HospitalityAlert } from '../adapters/hospitality-adapter';

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#ef4444';
    case 'warning':
      return '#f59e0b';
    case 'informational':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
}

export function getSeverityLabel(severity: string, locale: string = 'th'): string {
  const labels: Record<string, Record<string, string>> = {
    critical: { th: 'ระดับวิกฤต', en: 'Critical' },
    warning: { th: 'คำเตือน', en: 'Warning' },
    informational: { th: 'ข้อมูล', en: 'Info' },
  };
  
  return labels[severity]?.[locale] || severity;
}

export function getCategoryLabel(category: string, locale: string = 'th'): string {
  const labels: Record<string, Record<string, string>> = {
    cash: { th: 'กระแสเงินสด', en: 'Cash' },
    staffing: { th: 'ทรัพยากรบุคคล', en: 'Staffing' },
    forecast: { th: 'การคาดการณ์', en: 'Forecast' },
    revenue: { th: 'รายได้', en: 'Revenue' },
    occupancy: { th: 'อัตราการเข้าพัก', en: 'Occupancy' },
  };
  
  return labels[category]?.[locale] || category;
}

export function getTimeHorizonLabel(timeHorizon: string, locale: string = 'th'): string {
  const labels: Record<string, Record<string, string>> = {
    immediate: { th: 'ทันที', en: 'Immediate' },
    'near-term': { th: 'ระยะใกล้', en: 'Near-term' },
    'medium-term': { th: 'ระยะกลาง', en: 'Medium-term' },
    'long-term': { th: 'ระยะยาว', en: 'Long-term' },
  };
  
  return labels[timeHorizon]?.[locale] || timeHorizon;
}

export function getAlertTypeColor(type: string): string {
  switch (type) {
    case 'opportunity':
      return '#10b981'; // Green for opportunities
    case 'risk':
      return '#ef4444'; // Red for risks
    case 'anomaly':
      return '#f59e0b'; // Orange for anomalies
    case 'threshold':
      return '#3b82f6'; // Blue for thresholds
    default:
      return '#6b7280';
  }
}

export function getAlertTypeLabel(type: string, locale: string = 'th'): string {
  const labels: Record<string, Record<string, string>> = {
    opportunity: { th: 'โอกาส', en: 'Opportunity' },
    risk: { th: 'ความเสี่ยง', en: 'Risk' },
    anomaly: { th: 'ความผิดปกติ', en: 'Anomaly' },
    threshold: { th: 'เกณฑ์', en: 'Threshold' },
  };
  
  return labels[type]?.[locale] || type;
}

export function sortAlertsBySeverity(alerts: HospitalityAlert[]): HospitalityAlert[] {
  const severityOrder = { critical: 0, warning: 1, informational: 2 };
  return [...alerts].sort((a, b) => {
    const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
    const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}
