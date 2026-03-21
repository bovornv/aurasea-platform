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

/** Alert content from alerts_top view (branch overview). */
export interface AlertTopDisplay {
  type: string;
  message: string;
  cause: string | null;
  recommendation: string | null;
  expected_recovery: string | null;
}

const ALERT_TOP_TH: Record<string, { type: string; message: string; cause: string; recommendation: string; expected_recovery: string }> = {
  'Revenue Drop': {
    type: 'รายได้ลดลง',
    message: 'รายได้ลดลง %s% เมื่อวาน',
    cause: 'ต่ำกว่าแนวโน้มล่าสุด',
    recommendation: 'จัดโปรโมชั่นระยะสั้นหรือเพิ่มการมองเห็นใน OTA',
    expected_recovery: 'รายได้ฟื้นตัว +5–10%',
  },
  'Low Occupancy': {
    type: 'อัตราการเข้าพักต่ำ',
    message: 'อัตราการเข้าพักลดลง %s% เทียบกับสัปดาห์ที่แล้ว',
    cause: 'ต่ำกว่าแนวโน้มล่าสุด',
    recommendation: 'ปรับราคาหรือสร้างแพ็กเกจ',
    expected_recovery: 'อัตราการเข้าพักฟื้นตัว +5–8%',
  },
  'Customer Drop': {
    type: 'จำนวนลูกค้าลดลง',
    message: 'จำนวนลูกค้าลดลง %s%',
    cause: 'ต่ำกว่าแนวโน้มล่าสุด',
    recommendation: 'เสนอเซ็ตหรือโปรโมชั่นเฉพาะกลุ่ม',
    expected_recovery: 'จำนวนลูกค้าฟื้นตัว +5–10%',
  },
  'High Demand Opportunity': {
    type: 'โอกาสความต้องการสูง',
    message: 'ความต้องการสูง — รายได้เพิ่มขึ้น',
    cause: 'สูงกว่าแนวโน้มล่าสุด',
    recommendation: 'ปรับราคาขึ้นเล็กน้อยหรือขายอัปเกรด',
    expected_recovery: 'รายได้เพิ่มขึ้น +5–12%',
  },
  'F&B Underperformance': {
    type: 'F&B ทำได้ต่ำกว่าที่ควร',
    message: 'รายได้ F&B ต่ำกว่ารายได้ห้องพักอย่างมีนัยสำคัญ',
    cause: 'ลูกค้าในที่พักใช้บริการน้อยหรือลูกค้านอกน้อย',
    recommendation: 'เสนอเซ็ตอาหารหรือแพ็ก breakfast/dinner',
    expected_recovery: 'รายได้รวม +5–12% จาก F&B',
  },
  'Low Room Revenue Contribution': {
    type: 'รายได้ห้องพักมีส่วนร่วมต่ำ',
    message: 'รายได้ห้องพักยังไม่สูงสุดเทียบกับ F&B',
    cause: 'อัตราการเข้าพักหรือกลยุทธ์ราคาอาจยังไม่เหมาะสม',
    recommendation: 'ปรับราคาหรือโปรโมชั่นห้องเพื่อเพิ่มอัตราการเข้าพัก',
    expected_recovery: 'รายได้ห้องพักฟื้นตัว +5–10%',
  },
};

/** Extract number from messages like "Revenue dropped 14% yesterday" or "Occupancy down 8% vs last week". */
function extractPercentFromMessage(msg: string | null): string | null {
  if (!msg || typeof msg !== 'string') return null;
  const m = msg.match(/(\d+)\s*%/);
  return m ? m[1]! : null;
}

export type AlertTopDisplayContext = {
  /** When `fnb`, Revenue Drop uses F&B actions (no OTA). */
  moduleType?: string | null;
};

/**
 * Localized display strings for an alert from alerts_top / branch_alerts_today.
 */
export function getAlertTopDisplay(
  alert: { alert_type: string | null; alert_message: string | null; cause: string | null; recommendation: string | null; expected_recovery: string | null },
  locale: string,
  context?: AlertTopDisplayContext
): AlertTopDisplay {
  const type = alert.alert_type ?? 'Alert';
  const isTh = locale === 'th';
  const isFnb = context?.moduleType === 'fnb';

  if (isTh && type === 'Revenue Drop' && isFnb) {
    const pct = extractPercentFromMessage(alert.alert_message);
    const message =
      pct != null
        ? `รายได้ลดลง ${pct}% เมื่อเทียบวันก่อน`
        : (alert.alert_message ?? '');
    return {
      type: 'รายได้ลดลง',
      message,
      cause: 'ต่ำกว่าแนวโน้มล่าสุด',
      recommendation: 'จัดโปรหรือแพ็กเมนู และดัน walk-in / เดลิเวอรี่',
      expected_recovery: 'รายได้ฟื้นตัว +5–10%',
    };
  }

  const th = isTh && ALERT_TOP_TH[type];

  if (th) {
    const pct = extractPercentFromMessage(alert.alert_message);
    const message = pct != null && th.message.includes('%s') ? th.message.replace('%s', pct) : (th.message.includes('%s') ? (alert.alert_message ?? th.message) : th.message);
    return {
      type: th.type,
      message,
      cause: th.cause,
      recommendation: th.recommendation,
      expected_recovery: th.expected_recovery,
    };
  }

  let recommendation = alert.recommendation;
  if (isFnb && type === 'Revenue Drop' && recommendation && /ota/i.test(recommendation)) {
    recommendation =
      'Run same-day promos, meal bundles, or boost walk-in and delivery.';
  }

  return {
    type,
    message: alert.alert_message ?? '',
    cause: alert.cause,
    recommendation,
    expected_recovery: alert.expected_recovery,
  };
}
