/**
 * Intelligence stage detection — vertical-agnostic, coverage-days only.
 * Used to show intentional empty/initializing state instead of broken 0 scores.
 *
 * Product-level activation layers:
 * 0 → Intelligence Setup
 * 1–6 → Intelligence Learning
 * 7–13 → Soft Alerts Activated
 * 14–29 → Pattern Recognition in Progress
 * 30+ → Full Predictive Intelligence Active
 */

export type IntelligenceStage =
  | 'INITIALIZING'   // 0 days
  | 'COLLECTING'     // 1–6 days
  | 'BASELINE_READY' // 7–29 days
  | 'FULLY_ACTIVE';  // 30+ days

/** Layered activation stage for product UX. */
export type ActivationStage =
  | 'SETUP'              // 0 days
  | 'LEARNING'           // 1–6 days
  | 'SOFT_ALERTS'        // 7–13 days
  | 'PATTERN_RECOGNITION'// 14–29 days
  | 'FULLY_ACTIVE';     // 30+ days

const STAGE_THRESHOLDS = {
  COLLECTING: 7,
  BASELINE_READY: 30,
} as const;

/**
 * Compute stage from number of days with data (from daily_metrics).
 */
export function getIntelligenceStage(coverageDays: number): IntelligenceStage {
  if (coverageDays >= STAGE_THRESHOLDS.BASELINE_READY) return 'FULLY_ACTIVE';
  if (coverageDays >= STAGE_THRESHOLDS.COLLECTING) return 'BASELINE_READY';
  if (coverageDays > 0) return 'COLLECTING';
  return 'INITIALIZING';
}

/**
 * Compute activation stage for layered product UX.
 */
export function getActivationStage(coverageDays: number): ActivationStage {
  if (coverageDays >= 30) return 'FULLY_ACTIVE';
  if (coverageDays >= 14) return 'PATTERN_RECOGNITION';
  if (coverageDays >= 7) return 'SOFT_ALERTS';
  if (coverageDays >= 1) return 'LEARNING';
  return 'SETUP';
}

export function isFullyActive(stage: IntelligenceStage): boolean {
  return stage === 'FULLY_ACTIVE';
}

export const INTELLIGENCE_DAYS_TARGET = 30;

const ACTIVATION_COPY: Record<ActivationStage, { title: { en: string; th: string }; description: { en: string; th: string } }> = {
  SETUP: {
    title: { en: 'Intelligence Setup', th: 'กำลังตั้งค่าระบบวิเคราะห์' },
    description: { en: 'Log your first day of data to start building your operational baseline.', th: 'บันทึกข้อมูลวันแรกเพื่อเริ่มสร้างฐานการดำเนินงาน' },
  },
  LEARNING: {
    title: { en: 'Intelligence Learning', th: 'ระบบกำลังเรียนรู้' },
    description: { en: 'Your data is being analyzed. Micro insights and trends will appear as more days are logged.', th: 'ระบบกำลังวิเคราะห์ข้อมูลของคุณ — จะมีข้อมูลเชิงลึกและแนวโน้มเมื่อมีข้อมูลมากขึ้น' },
  },
  SOFT_ALERTS: {
    title: { en: 'Soft Alerts Activated', th: 'เปิดใช้งานการแจ้งเตือนเบื้องต้นแล้ว' },
    description: { en: 'Early signals are now active. You’ll see preventive and optimization insights.', th: 'สัญญาณเบื้องต้นทำงานแล้ว — คุณจะเห็นข้อมูลเชิงลึกเชิงป้องกันและข้อเสนอปรับปรุง' },
  },
  PATTERN_RECOGNITION: {
    title: { en: 'Pattern Recognition in Progress', th: 'กำลังจดจำรูปแบบ' },
    description: { en: 'Patterns are being identified. Full predictive intelligence unlocks at 30 days.', th: 'ระบบกำลังจดจำรูปแบบ — ความสามารถวิเคราะห์แบบเต็มจะเปิดที่ 30 วัน' },
  },
  FULLY_ACTIVE: {
    title: { en: 'Full Predictive Intelligence Active', th: 'ระบบวิเคราะห์ทำงานเต็มที่' },
    description: { en: 'You have a full baseline. All insights and alerts are available.', th: 'คุณมีฐานข้อมูลครบ — ข้อมูลเชิงลึกและการแจ้งเตือนทั้งหมดพร้อมใช้งาน' },
  },
};

export function getActivationTitle(stage: ActivationStage, locale: 'en' | 'th'): string {
  return ACTIVATION_COPY[stage].title[locale];
}

export function getActivationDescription(stage: ActivationStage, locale: 'en' | 'th'): string {
  return ACTIVATION_COPY[stage].description[locale];
}

/**
 * Next milestone to unlock (days and label).
 */
export function getNextMilestone(coverageDays: number, locale: 'en' | 'th'): { days: number; label: string } | null {
  if (coverageDays >= 30) return null;
  if (coverageDays < 1) return { days: 1, label: locale === 'th' ? 'บันทึกวันแรก' : 'Log first day' };
  if (coverageDays < 3) return { days: 3, label: locale === 'th' ? 'แนวโน้มระยะสั้น' : 'Trend insights' };
  if (coverageDays < 5) return { days: 5, label: locale === 'th' ? 'การวิเคราะห์ความแปรปรวน' : 'Variability insights' };
  if (coverageDays < 7) return { days: 7, label: locale === 'th' ? 'การแจ้งเตือนเบื้องต้น' : 'Soft alerts' };
  if (coverageDays < 14) return { days: 14, label: locale === 'th' ? 'จดจำรูปแบบ' : 'Pattern recognition' };
  return { days: 30, label: locale === 'th' ? 'ความสามารถเต็มรูปแบบ' : 'Full intelligence' };
}
