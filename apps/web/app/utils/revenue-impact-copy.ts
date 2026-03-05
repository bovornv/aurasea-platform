// Revenue Impact Copy Utility
// Provides owner-friendly revenue impact explanations for alerts based on severity

export interface RevenueImpactCopy {
  summary: string;
  explanation: string;
}

/**
 * Get revenue impact copy based on alert severity
 * Uses owner-friendly language, avoids formulas and technical terms
 */
export function getRevenueImpactCopy(
  severity: 'critical' | 'warning' | 'informational',
  locale: 'en' | 'th' = 'en'
): RevenueImpactCopy {
  if (locale === 'th') {
    switch (severity) {
      case 'critical':
        return {
          summary: 'นี่กำลังทำให้คุณสูญเสียรายได้',
          explanation: 'ปัญหานี้กำลังทำให้คุณสูญเสียเงินในตอนนี้ ควรแก้ไขทันทีเพื่อหยุดการสูญเสียรายได้',
        };
      case 'warning':
        return {
          summary: 'นี่เพิ่มความเสี่ยงของการสูญเสียรายได้ในอนาคต',
          explanation: 'ปัญหานี้เพิ่มความเสี่ยงที่จะทำให้คุณสูญเสียรายได้ในอนาคต ควรแก้ไขก่อนที่จะกลายเป็นปัญหาใหญ่',
        };
      case 'informational':
        return {
          summary: 'นี่เป็นโอกาสในการปรับปรุงผลการดำเนินงาน',
          explanation: 'นี่เป็นโอกาสในการปรับปรุงผลการดำเนินงานและเพิ่มรายได้ของคุณ',
        };
      default:
        return {
          summary: 'นี่เป็นโอกาสในการปรับปรุงผลการดำเนินงาน',
          explanation: 'นี่เป็นโอกาสในการปรับปรุงผลการดำเนินงานและเพิ่มรายได้ของคุณ',
        };
    }
  }

  // English (default)
  switch (severity) {
    case 'critical':
      return {
        summary: 'This is actively costing you money',
        explanation: 'This issue is actively costing you money right now. Address it immediately to stop revenue loss.',
      };
    case 'warning':
      return {
        summary: 'This increases the risk of future revenue loss',
        explanation: 'This issue increases the risk of future revenue loss. Address it before it becomes a bigger problem.',
      };
    case 'informational':
      return {
        summary: 'This is an opportunity to improve performance',
        explanation: 'This is an opportunity to improve performance and increase your revenue.',
      };
    default:
      return {
        summary: 'This is an opportunity to improve performance',
        explanation: 'This is an opportunity to improve performance and increase your revenue.',
      };
  }
}

/**
 * Get summary sentence for alert lists
 */
export function getAlertListSummary(
  alertCount: number,
  locale: 'en' | 'th' = 'en'
): string {
  if (locale === 'th') {
    return `นี่คือปัญหา ${alertCount} รายการที่กำลังทำให้คุณสูญเสียเงินในเดือนนี้`;
  }
  return `Here are ${alertCount} issue${alertCount !== 1 ? 's' : ''} costing you money this month.`;
}
