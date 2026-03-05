// Monitoring service - handles continuous monitoring and trend detection
'use client';

import { operationalSignalsService, type OperationalSignal, type MenuItemSignal, convertSignalToMetrics, convertMetricsToSignal } from './operational-signals-service';
import { smeOSService } from './sme-os-service';
import { getHospitalityData } from './hospitality-data-service';
import type { BusinessSetup } from '../contexts/business-setup-context';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import { getFreshnessConfig, type FreshnessConfig } from './freshness-config';
import type { BranchMetrics } from '../models/branch-metrics';
import { validateMetricsForAlert, type AlertKey } from '../models/branch-metrics';
import { BRANCH_SELECT } from '../lib/db-selects';
import { DemandDropRule } from '../../../../core/sme-os/engine/rules/demand-drop';
import { CostPressureRule } from '../../../../core/sme-os/engine/rules/cost-pressure';
import { MarginCompressionRule } from '../../../../core/sme-os/engine/rules/margin-compression';
import { SeasonalMismatchRule } from '../../../../core/sme-os/engine/rules/seasonal-mismatch';
import { DataConfidenceRiskRule } from '../../../../core/sme-os/engine/rules/data-confidence-risk';
import { WeekendWeekdayImbalanceRule } from '../../../../core/sme-os/engine/rules/weekend-weekday-imbalance';
import { LowWeekdayUtilizationRule } from '../../../../core/sme-os/engine/rules/low-weekday-utilization';
import { CapacityUtilizationRule } from '../../../../core/sme-os/engine/rules/capacity-utilization';
import { WeekendWeekdayFnbGapRule } from '../../../../core/sme-os/engine/rules/weekend-weekday-fnb-gap';
import { MenuRevenueConcentrationRule } from '../../../../core/sme-os/engine/rules/menu-revenue-concentration';
import { LiquidityRunwayRiskRule } from '../../../../core/sme-os/engine/rules/liquidity-runway-risk';
import { RevenueConcentrationRule } from '../../../../core/sme-os/engine/rules/revenue-concentration';
import { CashFlowVolatilityRule } from '../../../../core/sme-os/engine/rules/cash-flow-volatility';
import { BreakEvenRiskRule } from '../../../../core/sme-os/engine/rules/break-even-risk';
import { SeasonalityRiskRule } from '../../../../core/sme-os/engine/rules/seasonality-risk';
import { CashRunwayRule } from '../../../../core/sme-os/engine/rules/cash-runway';
import { translateToSMEOS } from '../adapters/hospitality-adapter';

export interface MonitoringStatus {
  isActive: boolean;
  lastEvaluated: Date | null;
  dataCoverageDays: number;
  evaluationCount: number;
  lastOperationalUpdateAt: Date | null;
  trackingState: 'active' | 'degraded' | 'stale';
  confidenceImpact: 'none' | 'reduced';
  lastReminderSentAt: Date | null;
}

export interface ConfidenceDecay {
  confidenceRaw: number;
  confidenceAdjusted: number;
  confidenceDecayReason: string;
  dataAgeDays: number;
}

/** Product-level alert category for layered UX. */
export type AlertCategory = 'positive_optimization' | 'preventive_early_signal' | 'risk_pattern_emerging';

export interface ExtendedAlertContract extends AlertContract {
  confidenceRaw?: number;
  confidenceAdjusted?: number;
  confidenceDecayReason?: string;
  revenueImpact?: number; // Monthly revenue impact in THB
  revenueImpactTitle?: string; // Owner-facing title for revenue impact
  revenueImpactDescription?: string; // Owner-facing description
  /** Thai copy (respectful, forward-looking); used when locale is th. */
  messageTh?: string;
  revenueImpactTitleTh?: string;
  /** Product category: optimization (healthy), preventive (low-risk), risk (high-risk). */
  alertCategory?: AlertCategory;
  // Health Score v2: Action → Impact Projection
  projectedRecovery?: number; // Projected revenue recovery in THB/month (same as revenueImpact for now)
  projectedHealthIncrease?: number; // Projected health score increase (0-100)
  status?: string; // e.g. 'resolved'
  resolvedAt?: string | null;
}

export interface ConfidenceSnapshot {
  date: Date;
  confidenceAdjusted: number;
  dataAgeDays: number;
}

export interface AlertSuppressionInfo {
  isSuppressed: boolean;
  reason: string;
  suppressedCount: number;
  suppressedAlerts?: unknown[];
  suppressionReasons?: Record<string, string>;
}

// Export types for use in other modules
export type { ExtendedAlertContract as ExtendedAlert };

class MonitoringService {
  private statusKey = 'hospitality_monitoring_status';
  private reminderKey = 'hospitality_reminder_state';
  private confidenceHistoryKey = 'hospitality_confidence_history';
  private demandDropRule = new DemandDropRule();
  private costPressureRule = new CostPressureRule();
  private marginCompressionRule = new MarginCompressionRule();
  private seasonalMismatchRule = new SeasonalMismatchRule();
  private dataConfidenceRiskRule = new DataConfidenceRiskRule();
  private weekendWeekdayImbalanceRule = new WeekendWeekdayImbalanceRule();
  private lowWeekdayUtilizationRule = new LowWeekdayUtilizationRule();
  // Newly activated alerts
  private capacityUtilizationRule = new CapacityUtilizationRule();
  private weekendWeekdayFnbGapRule = new WeekendWeekdayFnbGapRule();
  private menuRevenueConcentrationRule = new MenuRevenueConcentrationRule();
  private liquidityRunwayRiskRule = new LiquidityRunwayRiskRule();
  private revenueConcentrationRule = new RevenueConcentrationRule();
  private cashFlowVolatilityRule = new CashFlowVolatilityRule();
  private breakEvenRiskRule = new BreakEvenRiskRule();
  private seasonalityRiskRule = new SeasonalityRiskRule();
  private cashRunwayRule = new CashRunwayRule();

  /**
   * Check if branch modules match alert scope
   * @param modules Branch modules array
   * @param alertScope Alert scope ('accommodation' or 'fnb')
   */
  private matchesAlertScope(
    modules: string[] | null | undefined,
    alertScope?: string
  ): boolean {
    if (!alertScope) return true; // No scope = general alert, applies to all
    
    if (!modules || modules.length === 0) {
      return false; // No modules = no alerts
    }
    
    if (alertScope === 'cafe_restaurant' || alertScope === 'fnb') {
      return modules.includes('fnb');
    }
    
    if (alertScope === 'hotel_resort' || alertScope === 'accommodation') {
      return modules.includes('accommodation');
    }
    
    return true; // Unknown scope, allow by default
  }

  /**
   * Get branch modules for current branch
   * Falls back to businessType from setup for backward compatibility
   */
  private getBranchModules(setup: BusinessSetup | null, branchId?: string | null): string[] {
    // Try to get modules from current branch
    try {
      if (branchId && typeof window !== 'undefined') {
        const { businessGroupService } = require('./business-group-service');
        const branch = businessGroupService.getAllBranches().find((b: any) => b.id === branchId);
        if (branch && branch.modules && Array.isArray(branch.modules)) {
          return branch.modules;
        }
      }
    } catch (e) {
      // Fallback to businessType migration
    }
    
    // Fallback: migrate from businessType
    if (setup?.businessType) {
      const { migrateBusinessTypeToModules } = require('../models/business-group');
      return migrateBusinessTypeToModules(setup.businessType as any);
    }
    
    return ['fnb']; // Default fallback
  }

  /**
   * Calculate confidence decay based on data age and modules
   */
  private calculateConfidenceDecay(
    lastUpdateAt: Date | null,
    modules: string[] | null,
    fallbackBusinessType?: BusinessSetup['businessType'] | null
  ): ConfidenceDecay | null {
    if (!lastUpdateAt) {
      return null;
    }

    const now = new Date();
    const dataAgeMs = now.getTime() - lastUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));

    // Map modules to businessType for freshness config (backward compatibility)
    let businessTypeForConfig: BusinessSetup['businessType'] = 'cafe_restaurant';
    if (modules) {
      if (modules.includes('accommodation') && modules.includes('fnb')) {
        businessTypeForConfig = 'hotel_with_cafe';
      } else if (modules.includes('accommodation')) {
        businessTypeForConfig = 'hotel_resort';
      } else {
        businessTypeForConfig = 'cafe_restaurant';
      }
    } else if (fallbackBusinessType) {
      businessTypeForConfig = fallbackBusinessType;
    }

    const config = getFreshnessConfig(businessTypeForConfig);
    const { thresholds, decayMultipliers } = config;

    // No decay before mild decay threshold
    if (dataAgeDays <= thresholds.mildDecayDays) {
      return null;
    }

    let decayPercent = 0;
    let reason = '';

    if (dataAgeDays > thresholds.mildDecayDays && dataAgeDays <= thresholds.warningDays) {
      decayPercent = (1 - decayMultipliers.mild) * 100;
      reason = `Data is ${dataAgeDays} days old (mild decay)`;
    } else if (dataAgeDays > thresholds.warningDays && dataAgeDays <= thresholds.strongDecayDays) {
      decayPercent = (1 - decayMultipliers.moderate) * 100;
      reason = `Data is ${dataAgeDays} days old (moderate decay)`;
    } else if (dataAgeDays > thresholds.strongDecayDays && dataAgeDays <= thresholds.confidenceCapDays) {
      decayPercent = (1 - decayMultipliers.strong) * 100;
      reason = `Data is ${dataAgeDays} days old (strong decay)`;
    } else if (dataAgeDays > thresholds.confidenceCapDays) {
      decayPercent = (1 - decayMultipliers.cap) * 100;
      reason = `Data is ${dataAgeDays} days old (confidence capped at ${decayMultipliers.cap * 100}%)`;
    }

    return {
      confidenceRaw: 1.0, // Will be replaced with actual confidence
      confidenceAdjusted: 0, // Will be calculated
      confidenceDecayReason: reason,
      dataAgeDays,
    };
  }

  /**
   * Apply confidence decay to an alert using industry-specific thresholds
   */
  private applyConfidenceDecay(
    alert: AlertContract,
    lastUpdateAt: Date | null,
    modules: string[] | null,
    fallbackBusinessType?: BusinessSetup['businessType'] | null
  ): ExtendedAlertContract {
    const decay = this.calculateConfidenceDecay(lastUpdateAt, modules, fallbackBusinessType);
    
    if (!decay) {
      return {
        ...alert,
        confidenceRaw: alert.confidence,
        confidenceAdjusted: alert.confidence,
      };
    }

    const rawConfidence = alert.confidence;
    
    // Map modules to businessType for freshness config (backward compatibility)
    let businessTypeForConfig: BusinessSetup['businessType'] = 'cafe_restaurant';
    if (modules) {
      if (modules.includes('accommodation') && modules.includes('fnb')) {
        businessTypeForConfig = 'hotel_with_cafe';
      } else if (modules.includes('accommodation')) {
        businessTypeForConfig = 'hotel_resort';
      } else {
        businessTypeForConfig = 'cafe_restaurant';
      }
    } else if (fallbackBusinessType) {
      businessTypeForConfig = fallbackBusinessType;
    }
    
    const config = getFreshnessConfig(businessTypeForConfig);
    const { thresholds, decayMultipliers } = config;
    
    let decayMultiplier = 1.0;
    
    // Calculate decay multiplier based on industry-specific thresholds
    if (decay.dataAgeDays > thresholds.mildDecayDays && decay.dataAgeDays <= thresholds.warningDays) {
      decayMultiplier = decayMultipliers.mild;
    } else if (decay.dataAgeDays > thresholds.warningDays && decay.dataAgeDays <= thresholds.strongDecayDays) {
      decayMultiplier = decayMultipliers.moderate;
    } else if (decay.dataAgeDays > thresholds.strongDecayDays && decay.dataAgeDays <= thresholds.confidenceCapDays) {
      decayMultiplier = decayMultipliers.strong;
    } else if (decay.dataAgeDays > thresholds.confidenceCapDays) {
      decayMultiplier = decayMultipliers.cap;
    }
    
    let adjustedConfidence = rawConfidence * decayMultiplier;
    
    // Cap at minimum if over confidence cap threshold
    if (decay.dataAgeDays > thresholds.confidenceCapDays) {
      adjustedConfidence = Math.max(decayMultipliers.cap, adjustedConfidence);
    }

    return {
      ...alert,
      confidenceRaw: rawConfidence,
      confidenceAdjusted: Math.max(0, Math.min(1, adjustedConfidence)),
      confidenceDecayReason: decay.confidenceDecayReason,
    };
  }

  /** Assign product category: positive_optimization (healthy), preventive_early_signal (low-risk), risk_pattern_emerging (high-risk). */
  private assignAlertCategories(alerts: ExtendedAlertContract[]): void {
    alerts.forEach((a) => {
      const ext = a as ExtendedAlertContract;
      if (ext.alertCategory) return;
      if (a.severity === 'critical') {
        ext.alertCategory = 'risk_pattern_emerging';
      } else if (a.severity === 'warning') {
        ext.alertCategory = a.type === 'opportunity' ? 'preventive_early_signal' : 'risk_pattern_emerging';
      } else {
        ext.alertCategory = a.type === 'opportunity' ? 'positive_optimization' : 'preventive_early_signal';
      }
    });
  }

  /** Micro (Day 1), trend (Day 3), variability (Day 5) insights so alerts are available from Day 1. */
  private injectPhaseBasedInsights(
    alerts: ExtendedAlertContract[],
    coverageDays: number,
    branchId?: string,
    businessGroupId?: string
  ): void {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const hasMicro = alerts.some((a) => (a as any).id?.startsWith('phase-micro'));
    if (coverageDays >= 1 && !hasMicro) {
      alerts.push({
        id: `phase-micro-${branchId ?? 'org'}-${now.getTime()}`,
        timestamp: now,
        type: 'opportunity',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: { start: now, end: windowEnd },
        message: 'Data received. Baseline is building — keep logging daily for better insights.',
        messageTh: 'ระบบรับข้อมูลแล้ว กำลังสร้างฐานอ้างอิง — บันทึกข้อมูลทุกวันเพื่อข้อมูลเชิงลึกที่ดียิ่งขึ้น',
        confidence: 0.6,
        contributingFactors: [{ factor: 'First days of data', weight: 0.5 }],
        conditions: ['Coverage 1+ days'],
        branchId,
        businessGroupId,
        alertCategory: 'positive_optimization',
        revenueImpactTitle: 'Keep logging to unlock trend and variability insights.',
        revenueImpactTitleTh: 'บันทึกข้อมูลต่อเพื่อปลดล็อกแนวโน้มและความแปรปรวน',
      } as ExtendedAlertContract);
    }
    const hasTrend = alerts.some((a) => (a as any).id?.startsWith('phase-trend'));
    if (coverageDays >= 3 && !hasTrend) {
      alerts.push({
        id: `phase-trend-${branchId ?? 'org'}-${now.getTime()}`,
        timestamp: now,
        type: 'anomaly',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'near-term',
        relevanceWindow: { start: now, end: windowEnd },
        message: 'Short-term trends are now visible. Watch for 2-day downward slopes or 5% deviation from your rolling average.',
        messageTh: 'แนวโน้มระยะสั้นแสดงแล้ว — สังเกตการลดลงต่อเนื่อง 2 วัน หรือความเบี่ยงเบน 5% จากค่าเฉลี่ย',
        confidence: 0.65,
        contributingFactors: [{ factor: '3+ days of data', weight: 0.5 }],
        conditions: ['Coverage 3+ days'],
        branchId,
        businessGroupId,
        alertCategory: 'preventive_early_signal',
        revenueImpactTitle: 'Trend insights active. Margin and demand patterns will surface with more data.',
        revenueImpactTitleTh: 'ข้อมูลแนวโน้มทำงานแล้ว — รูปแบบกำไรและความต้องการจะชัดขึ้นเมื่อมีข้อมูลมากขึ้น',
      } as ExtendedAlertContract);
    }
    const hasVariability = alerts.some((a) => (a as any).id?.startsWith('phase-variability'));
    if (coverageDays >= 5 && !hasVariability) {
      alerts.push({
        id: `phase-variability-${branchId ?? 'org'}-${now.getTime()}`,
        timestamp: now,
        type: 'anomaly',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: { start: now, end: windowEnd },
        message: 'Variability insights are available. We look for margin compression and revenue deviation from baseline.',
        messageTh: 'ข้อมูลความแปรปรวนพร้อมแล้ว — ระบบจะสังเกตการบีบอัดกำไรและความเบี่ยงเบนของรายได้จากฐาน',
        confidence: 0.7,
        contributingFactors: [{ factor: '5+ days of data', weight: 0.5 }],
        conditions: ['Coverage 5+ days'],
        branchId,
        businessGroupId,
        alertCategory: 'preventive_early_signal',
        revenueImpactTitle: 'Variability and soft alerts unlock at 7 days.',
        revenueImpactTitleTh: 'การแจ้งเตือนเบื้องต้นปลดล็อกที่ 7 วัน',
      } as ExtendedAlertContract);
    }
  }

  /**
   * Generate data freshness warnings using industry-specific thresholds
   */
  private generateFreshnessWarnings(
    lastUpdateAt: Date | null,
    businessType: BusinessSetup['businessType'],
    locale: 'en' | 'th' = 'th'
  ): AlertContract[] {
    if (!lastUpdateAt) {
      return [];
    }

    const now = new Date();
    const dataAgeMs = now.getTime() - lastUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));

    const config = getFreshnessConfig(businessType);
    const { thresholds } = config;

    const warnings: AlertContract[] = [];

    // Warning threshold based on industry type
    if (dataAgeDays >= thresholds.warningDays && dataAgeDays < thresholds.strongDecayDays) {
      warnings.push({
        id: `freshness-warning-7days-${Date.now()}`,
        timestamp: now,
        type: 'anomaly',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: now,
          end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        message: locale === 'th' 
          ? `ข้อมูลไม่ได้อัปเดต ${thresholds.warningDays} วัน — การแจ้งเตือนนี้เกี่ยวกับความสดของข้อมูล ไม่ใช่ความเสี่ยงทางธุรกิจ`
          : `Data has not been updated for ${thresholds.warningDays} days — This warning is about data freshness, not business danger.`,
        confidence: 1.0,
        contributingFactors: [
          { factor: 'Data age', weight: 0.3 },
        ],
        conditions: [
          `Last update: ${dataAgeDays} days ago`,
          'This is a monitoring integrity alert, not a business risk alert',
        ],
      });
    } else if (dataAgeDays >= thresholds.strongDecayDays && dataAgeDays < thresholds.confidenceCapDays) {
      warnings.push({
        id: `freshness-warning-14days-${Date.now()}`,
        timestamp: now,
        type: 'anomaly',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: now,
          end: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
        message: locale === 'th'
          ? `ความแม่นยำเริ่มลดลง — ข้อมูลไม่ได้อัปเดต ${thresholds.strongDecayDays} วัน การแจ้งเตือนนี้เกี่ยวกับความสดของข้อมูล ไม่ใช่ความเสี่ยงทางธุรกิจ`
          : `Accuracy is starting to decline — Data has not been updated for ${thresholds.strongDecayDays} days. This warning is about data freshness, not business danger.`,
        confidence: 1.0,
        contributingFactors: [
          { factor: 'Data age', weight: 0.5 },
        ],
        conditions: [
          `Last update: ${dataAgeDays} days ago`,
          'This is a monitoring integrity alert, not a business risk alert',
        ],
      });
    } else if (dataAgeDays >= thresholds.confidenceCapDays) {
      warnings.push({
        id: `freshness-warning-30days-${Date.now()}`,
        timestamp: now,
        type: 'anomaly',
        severity: 'informational',
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: now,
          end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        message: locale === 'th'
          ? `การติดตามไม่เชื่อถือได้ — ข้อมูลไม่ได้อัปเดต ${thresholds.confidenceCapDays}+ วัน การแจ้งเตือนนี้เกี่ยวกับความสดของข้อมูล ไม่ใช่ความเสี่ยงทางธุรกิจ`
          : `Monitoring is unreliable — Data has not been updated for ${thresholds.confidenceCapDays}+ days. This warning is about data freshness, not business danger.`,
        confidence: 1.0,
        contributingFactors: [
          { factor: 'Data age', weight: 0.7 },
        ],
        conditions: [
          `Last update: ${dataAgeDays} days ago`,
          'This is a monitoring integrity alert, not a business risk alert',
        ],
      });
    }

    return warnings;
  }

  /**
   * Check if reminder should be shown
   */
  shouldShowReminder(lastUpdateAt: Date | null): boolean {
    if (!lastUpdateAt) {
      return false;
    }

    const reminderState = this.getReminderState();
    if (reminderState.reminderSuppressed) {
      return false;
    }

    const now = new Date();
    const dataAgeMs = now.getTime() - lastUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));

    // Show reminder if 7+ days since last update
    if (dataAgeDays < 7) {
      return false;
    }

    // If reminder was sent, check if 7 days have passed since then
    if (reminderState.lastReminderSentAt) {
      const reminderAgeMs = now.getTime() - reminderState.lastReminderSentAt.getTime();
      const reminderAgeDays = Math.floor(reminderAgeMs / (1000 * 60 * 60 * 24));
      return reminderAgeDays >= 7;
    }

    return true;
  }

  /**
   * Mark reminder as sent
   */
  markReminderSent(): void {
    const state = {
      lastReminderSentAt: new Date(),
      reminderSuppressed: false,
    };
    localStorage.setItem(this.reminderKey, JSON.stringify(state));
  }

  /**
   * Suppress reminder (user dismissed it)
   */
  suppressReminder(): void {
    const state = this.getReminderState();
    state.reminderSuppressed = true;
    localStorage.setItem(this.reminderKey, JSON.stringify(state));
  }

  /**
   * Reset reminder state (called after data update)
   */
  resetReminderState(): void {
    localStorage.removeItem(this.reminderKey);
  }

  /**
   * Get reminder state
   */
  private getReminderState(): { lastReminderSentAt: Date | null; reminderSuppressed: boolean } {
    try {
      const stored = localStorage.getItem(this.reminderKey);
      if (!stored) {
        return { lastReminderSentAt: null, reminderSuppressed: false };
      }
      const parsed = JSON.parse(stored);
      return {
        lastReminderSentAt: parsed.lastReminderSentAt ? new Date(parsed.lastReminderSentAt) : null,
        reminderSuppressed: parsed.reminderSuppressed || false,
      };
    } catch (e) {
      return { lastReminderSentAt: null, reminderSuppressed: false };
    }
  }

  /**
   * Safely evaluate an alert with dependency validation
   * @param alertKey Alert key for validation
   * @param metrics BranchMetrics for validation
   * @param evaluator Function that evaluates the alert
   * @param alertName Human-readable alert name for logging
   * @returns AlertContract | null
   */
  private safeEvaluateAlert(
    alertKey: AlertKey,
    metrics: BranchMetrics | null,
    evaluator: () => AlertContract | null,
    alertName: string
  ): AlertContract | null {
    // If no metrics, skip validation but still try to evaluate (for backward compatibility)
    if (metrics) {
      const { canEvaluate } = validateMetricsForAlert(alertKey, metrics);
      if (!canEvaluate) {
        return null;
      }
    }

    try {
      return evaluator();
    } catch (error) {
      // Only log when calculation throws (real exception), not for expected missing data
      console.error(`[ALERT_ERROR] Failed to evaluate ${alertName}:`, error);
      return null;
    }
  }

  /**
   * Run monitoring evaluation. Real Supabase data only; no simulation or test mode.
   */
  async evaluate(
    setup: BusinessSetup | null,
    _testMode?: unknown,
    organizationId?: string | null,
    /** Dev-only: inject metrics for alert validation tests; bypasses real data fetch. */
    testMetrics?: BranchMetrics | null
  ): Promise<{
    alerts: ExtendedAlertContract[];
    status: MonitoringStatus;
    suppressionInfo: AlertSuppressionInfo;
    /** True when daily_metrics coverage < 7 days; skip alert evaluation and show init message. */
    alertsInitializing?: boolean;
    // Health Score v2: Financial Decision Engine
    decision?: {
      totalExposure: number; // Total revenue exposure in THB/month
      exposurePercent: number; // Exposure as percentage (0-100)
      healthScoreV2: number; // Money-weighted health score (0-100)
      improvementPotential: number; // Total potential health score increase
    };
  }> {
    // Get current branch selection for multi-branch support
    let currentBranchId: string | null | undefined;
    let businessGroupId: string | undefined;
    let isAllBranches = false;
    
    // PART 4: Prioritize active organization ID over businessGroupService
    if (organizationId) {
      businessGroupId = organizationId;
    }
    
    try {
      const { businessGroupService } = await import('./business-group-service');
      const branchId = businessGroupService.getCurrentBranchId();
      const businessGroup = businessGroupService.getBusinessGroup();
      isAllBranches = businessGroupService.isAllBranchesSelected();
      
      if (!isAllBranches && branchId) {
        currentBranchId = branchId;
        // Only use businessGroup.id if organizationId wasn't provided
        if (!businessGroupId) {
          businessGroupId = businessGroup?.id;
        }
      } else {
        // "All Branches" selected - will filter later
        // Only use businessGroup.id if organizationId wasn't provided
        if (!businessGroupId) {
          businessGroupId = businessGroup?.id;
        }
      }
    } catch (e) {
      // BusinessGroupService not available, continue without branchId (backward compatibility)
    }

    // Dev-only: Alert validation test mode — use injected metrics and skip real fetch
    if (testMetrics && process.env.NODE_ENV === 'development') {
      currentBranchId = testMetrics.branchId;
      businessGroupId = testMetrics.groupId;
    }

    // Simulation mode is now handled transparently via operational-signals-service
    // No need to generate/cache here - metrics are generated on-demand via pure function

    // Get latest metrics (prefer new BranchMetrics format, fallback to legacy OperationalSignal)
    let latestMetrics: BranchMetrics | null = null;
    let latestSignal: OperationalSignal | null = null;
    
    // PART 1.1: Check if monitoring is enabled for this branch
    let monitoringEnabled = true; // Default to enabled
    if (currentBranchId) {
      try {
        const { getBranchMonitoringSettings } = await import('./db/branch-monitoring-service');
        const settings = await getBranchMonitoringSettings(currentBranchId);
        // Only disable if explicitly set to false (null/undefined means use default = enabled)
        if (settings.monitoringEnabled === false) {
          monitoringEnabled = false;
        }
        // If error indicates missing columns, silently use default (enabled)
        // The service already handles this gracefully
      } catch (e) {
        // Fallback to enabled if check fails (columns may not exist)
        // Don't log as error - this is expected if migration hasn't run
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Monitoring] Failed to check monitoring_enabled, assuming enabled:', e);
        }
      }
    }
    
    // PART 1.1: If monitoring is disabled, return empty alerts
    if (!monitoringEnabled && currentBranchId) {
      return {
        alerts: [],
        status: {
          isActive: false,
          lastEvaluated: new Date(),
          dataCoverageDays: 0,
          evaluationCount: 0,
          lastOperationalUpdateAt: null,
          trackingState: 'stale',
          confidenceImpact: 'none',
          lastReminderSentAt: null,
        },
        suppressionInfo: {
          isSuppressed: false,
          reason: '',
          suppressedCount: 0,
          suppressedAlerts: [],
          suppressionReasons: {},
        },
      };
    }

    // Data coverage for phase-based insights (alerts available from Day 1)
    let dataCoverageDays = 0;
    try {
      const { getDailyMetrics } = await import('./db/daily-metrics-service');
      const branchIdsToCheck: string[] = [];
      if (!isAllBranches && currentBranchId) {
        branchIdsToCheck.push(currentBranchId);
      } else if (businessGroupId) {
        try {
          const { businessGroupService } = await import('./business-group-service');
          const branches = businessGroupService.getAllBranches().filter((b) => b.businessGroupId === businessGroupId);
          branchIdsToCheck.push(...branches.slice(0, 10).map((b) => b.id));
        } catch {
          // ignore
        }
      }
      if (branchIdsToCheck.length > 0) {
        const coverages = await Promise.all(
          branchIdsToCheck.map(async (bid) => {
            const rows = await getDailyMetrics(bid, 90);
            const distinctDates = new Set((rows || []).map((r) => r.date));
            return distinctDates.size;
          })
        );
        dataCoverageDays = coverages.length > 0 ? Math.min(...coverages) : 0;
      }
    } catch (_) {
      dataCoverageDays = 0;
    }

    if (testMetrics && process.env.NODE_ENV === 'development') {
      latestMetrics = testMetrics;
      dataCoverageDays = 30;
      latestSignal = convertMetricsToSignal(latestMetrics);
    }

    if (!testMetrics && !isAllBranches && currentBranchId && businessGroupId) {
      // Try to get BranchMetrics first (new format)
      try {
        const { businessGroupService } = await import('./business-group-service');
        const branch = businessGroupService.getBranchById(currentBranchId);
        latestMetrics = operationalSignalsService.getLatestMetrics(
          currentBranchId,
          businessGroupId,
          branch?.modules
        );
      } catch (e) {
        // Fall through to legacy signal
      }
    } else if (isAllBranches && businessGroupId) {
      // "All Branches" view - try to get first branch's metrics
      // PART 4: If organizationId is provided, fetch branches from Supabase
      if (organizationId && typeof window !== 'undefined') {
        try {
          const { getSupabaseClient, isSupabaseAvailable } = await import('../lib/supabase/client');
          if (isSupabaseAvailable()) {
            const supabase = getSupabaseClient();
            if (supabase) {
              const { data: orgBranches, error } = await supabase
                .from('branches')
                .select(BRANCH_SELECT)
                .eq('organization_id', organizationId)
                .order('sort_order', { ascending: true })
                .limit(1);
              
              if (!error && orgBranches && orgBranches.length > 0) {
                const firstBranch = orgBranches[0] as { id: string; module_type?: string | null };
                const mt = (firstBranch?.module_type || '').toLowerCase();
                const modules: string[] = mt === 'accommodation' ? ['accommodation'] : mt === 'fnb' ? ['fnb'] : [];
                
                latestMetrics = operationalSignalsService.getLatestMetrics(
                  firstBranch.id,
                  businessGroupId,
                  modules.length > 0 ? modules : undefined
                );
              }
            }
          }
        } catch (e) {
          console.error('[MonitoringService] Failed to fetch organization branches:', e);
        }
      }
    }

    // If no metrics found, get legacy signal
    if (!latestMetrics) {
      latestSignal = operationalSignalsService.getLatestSignal(
        isAllBranches ? '__all__' : currentBranchId, 
        businessGroupId
      );
      
      // Convert legacy signal to metrics if available
      if (latestSignal && currentBranchId && businessGroupId) {
        try {
          const { businessGroupService } = await import('./business-group-service');
          const branch = businessGroupService.getBranchById(currentBranchId);
          latestMetrics = convertSignalToMetrics(
            latestSignal,
            currentBranchId,
            businessGroupId,
            branch?.modules
          );
        } catch (e) {
          // Keep latestSignal as fallback
        }
      }
    } else {
      // Convert metrics to signal for backward compatibility with existing alert logic
      latestSignal = convertMetricsToSignal(latestMetrics);
    }
    
    // If no signals/metrics yet, create one from current setup
    if (!latestSignal && !latestMetrics && setup?.isCompleted && currentBranchId && businessGroupId) {
      const initialMetrics: BranchMetrics = {
        branchId: currentBranchId,
        groupId: businessGroupId,
        updatedAt: new Date().toISOString(),
        financials: {
          cashBalanceTHB: setup.currentCashBalance || 0,
          revenueLast30DaysTHB: 0,
          costsLast30DaysTHB: setup.monthlyFixedCosts || 0,
          revenueLast7DaysTHB: 0,
          costsLast7DaysTHB: setup.monthlyFixedCosts ? (setup.monthlyFixedCosts / 30) * 7 : 0,
        },
        modules: {},
        metadata: {
          dataConfidence: 0,
        },
      };
      
      operationalSignalsService.saveMetrics(initialMetrics);
      latestMetrics = initialMetrics;
      latestSignal = convertMetricsToSignal(initialMetrics);
    }

    // Get hospitality data from setup
    const hospitalityData = await getHospitalityData(setup);
    
    // CRITICAL: Override hospitality data with actual metrics/signal values if available
    // This ensures SME OS evaluates using the user's entered data, not mock data
    // Prefer BranchMetrics structure when available
    if ((latestMetrics || latestSignal) && setup?.isCompleted) {
      // Use the actual metrics/signal data - this is what the user entered
      const cashBalance = latestMetrics?.financials.cashBalanceTHB ?? latestSignal?.cashBalance ?? 0;
      const revenue30Days = latestMetrics?.financials.revenueLast30DaysTHB ?? latestSignal?.revenue30Days ?? 0;
      const revenue7Days = latestMetrics?.financials.revenueLast7DaysTHB ?? latestSignal?.revenue7Days ?? 0;
      const costs30Days = latestMetrics?.financials.costsLast30DaysTHB ?? latestSignal?.costs30Days ?? 0;
      const costs7Days = latestMetrics?.financials.costsLast7DaysTHB ?? latestSignal?.costs7Days ?? 0;
      
      hospitalityData.financial.currentBalance = cashBalance;
      
      // Update revenue to reflect metrics/signal data
      // Convert 7-day and 30-day revenue to daily averages for hospitality data structure
      const avgDailyRevenue7 = revenue7Days / 7;
      const avgDailyRevenue30 = revenue30Days / 30;
      const avgDailyRevenue = avgDailyRevenue30 > 0 ? avgDailyRevenue30 : avgDailyRevenue7;
      
      // Split revenue across sources based on setup
      const revenueSources = setup.revenueSources || { rooms: true, food: true, beverages: true, other: false };
      const totalSelected = Object.values(revenueSources).filter(v => v).length || 4;
      const revenuePerSource = avgDailyRevenue / totalSelected;
      
      hospitalityData.revenue.roomRevenue = revenueSources.rooms ? revenuePerSource : 0;
      hospitalityData.revenue.foodRevenue = revenueSources.food ? revenuePerSource : 0;
      hospitalityData.revenue.beverageRevenue = revenueSources.beverages ? revenuePerSource : 0;
      hospitalityData.revenue.otherRevenue = revenueSources.other ? revenuePerSource : 0;
      
      // Update expenses to reflect signal cost data
      // Remove old expenses and add new ones based on signal
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // CRITICAL: Generate revenue dates for cash flow construction
      // Cash flows require revenue.dates array to be populated
      // Generate dates for last 30 days to match expense dates
      hospitalityData.revenue.dates = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(thirtyDaysAgo);
        date.setDate(date.getDate() + i);
        return date;
      });
      
      // Replace expenses with metrics/signal-based costs
      hospitalityData.financial.expenses = [
        // 7-day costs spread over 7 days
        ...Array.from({ length: 7 }, (_, i) => {
          const date = new Date(sevenDaysAgo);
          date.setDate(date.getDate() + i);
          return {
            date,
            amount: costs7Days / 7,
            category: 'operational'
          };
        }),
        // 30-day costs (including fixed monthly costs)
        ...Array.from({ length: 30 }, (_, i) => {
          const date = new Date(thirtyDaysAgo);
          date.setDate(date.getDate() + i);
          // Add monthly fixed cost on day 0 and day 15
          const isFixedCostDay = i === 0 || i === 15;
          const dailyCost = (costs30Days - (setup.monthlyFixedCosts || 0)) / 30;
          return {
            date,
            amount: isFixedCostDay ? dailyCost + (setup.monthlyFixedCosts || 0) : dailyCost,
            category: isFixedCostDay ? 'fixed_cost' : 'operational'
          };
        })
      ];
      
      // CRITICAL: Ensure cashFlows are constructed for alert evaluation
      // translateToSMEOS will use revenue.dates and financial.expenses to build cashFlows
      // This is essential for cash runway and liquidity alerts
    }
    
    // Get last operational update timestamp
    const lastUpdateAt = latestMetrics 
      ? new Date(latestMetrics.updatedAt)
      : (latestSignal?.timestamp || null);

    // Get cash runway alert from SME OS (legacy alert, wrapped in try-catch)
    let alert: AlertContract | null = null;
    try {
      const result = await smeOSService.evaluateHospitalityData(hospitalityData);
      alert = result.alert || null;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ALERT_ERROR] Failed to evaluate SME OS cash runway alert:', error);
      }
      alert = null;
    }

    // Get all operational signals for trend analysis (filtered by branch if available)
    const allSignals = operationalSignalsService.getAllSignals(
      isAllBranches ? '__all__' : currentBranchId,
      businessGroupId
    );
    
    // PART 1.4: Get alert sensitivity from branch settings
    let alertSensitivity: 'low' | 'medium' | 'high' = 'medium';
    if (currentBranchId) {
      try {
        const { getBranchMonitoringSettings } = await import('./db/branch-monitoring-service');
        const settings = await getBranchMonitoringSettings(currentBranchId);
        if (settings.alertSensitivity) {
          alertSensitivity = settings.alertSensitivity;
        }
      } catch (e) {
        // Fallback to medium if fetch fails
        console.warn('[Monitoring] Failed to get alert sensitivity, using medium:', e);
      }
    }
    
    // Generate all new alert types with alert sensitivity
    const smeOSInput = translateToSMEOS(hospitalityData, alertSensitivity);
    
    // Trend-based alerts require at least 2 real signals; no synthetic signals
    const signalsForTrendAlerts = allSignals.length >= 2 ? allSignals : [];

    // Evaluate alerts with validation and error handling
    const demandDropAlert = latestMetrics 
      ? this.safeEvaluateAlert('demand_drop', latestMetrics, () => this.demandDropRule.evaluate(smeOSInput, signalsForTrendAlerts), 'Demand Drop')
      : this.demandDropRule.evaluate(smeOSInput, signalsForTrendAlerts);
    
    const costPressureAlert = latestMetrics
      ? this.safeEvaluateAlert('cost_pressure', latestMetrics, () => {
          const alert = this.costPressureRule.evaluate(smeOSInput, signalsForTrendAlerts);
          
          // Calculate revenue impact for cost pressure
          if (alert && latestMetrics) {
            const revenue = latestMetrics.financials.revenueLast30DaysTHB;
            const costs = latestMetrics.financials.costsLast30DaysTHB;
            
            // Cost pressure impact = excess costs eating into profit
            // Estimate as 2-5% of revenue depending on severity
            let monthlyRevenueImpact = 0;
            if (alert.severity === 'critical') {
              monthlyRevenueImpact = revenue * 0.05; // 5% of revenue
            } else if (alert.severity === 'warning') {
              monthlyRevenueImpact = revenue * 0.03; // 3% of revenue
            } else {
              monthlyRevenueImpact = revenue * 0.02; // 2% of revenue
            }
            
            if (monthlyRevenueImpact > 0) {
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact);
              
              (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
              (alert as ExtendedAlertContract).revenueImpactTitle = 'Rising costs are reducing profitability';
              (alert as ExtendedAlertContract).revenueImpactDescription = `Cost pressure is costing approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month in reduced profit.`;
            }
          }
          
          return alert;
        }, 'Cost Pressure')
      : this.costPressureRule.evaluate(smeOSInput, signalsForTrendAlerts);
    
    const marginCompressionAlert = latestMetrics
      ? this.safeEvaluateAlert('margin_compression', latestMetrics, () => {
          const alert = this.marginCompressionRule.evaluate(smeOSInput, signalsForTrendAlerts);
          
          // Calculate revenue impact for margin compression
          if (alert && latestMetrics) {
            const revenue = latestMetrics.financials.revenueLast30DaysTHB;
            const costs = latestMetrics.financials.costsLast30DaysTHB;
            const margin = revenue > 0 ? (revenue - costs) / revenue : 0;
            
            // Revenue impact = lost margin opportunity
            // For stressed scenario: margin compression means we're losing potential profit
            let monthlyRevenueImpact = 0;
            if (margin < 0) {
              // Operating at a loss - impact is the loss amount
              monthlyRevenueImpact = Math.abs(revenue - costs);
            } else if (margin < 0.15) {
              // Low margin - estimate impact as 5-10% of revenue
              monthlyRevenueImpact = revenue * 0.075; // 7.5% of revenue
            } else if (margin < 0.25) {
              // Moderate margin compression - estimate 3-5% impact
              monthlyRevenueImpact = revenue * 0.04; // 4% of revenue
            }
            
            if (monthlyRevenueImpact > 0) {
              const severityMultiplier = alert.severity === 'critical' ? 1.0 : alert.severity === 'warning' ? 0.7 : 0.4;
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact * severityMultiplier);
              
              (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
              (alert as ExtendedAlertContract).revenueImpactTitle = margin < 0 
                ? 'Operating at a loss due to margin compression'
                : 'Profit margin compression is reducing revenue';
              (alert as ExtendedAlertContract).revenueImpactDescription = margin < 0
                ? `Current operations are losing approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month.`
                : `Margin compression is costing approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month in lost profit.`;
            }
          }
          
          return alert;
        }, 'Margin Compression')
      : this.marginCompressionRule.evaluate(smeOSInput, signalsForTrendAlerts);
    
    const seasonalMismatchAlert = latestMetrics
      ? this.safeEvaluateAlert('seasonal_mismatch', latestMetrics, () => this.seasonalMismatchRule.evaluate(smeOSInput, signalsForTrendAlerts), 'Seasonal Mismatch')
      : this.seasonalMismatchRule.evaluate(smeOSInput, signalsForTrendAlerts);
    
    // Weekend-Weekday Imbalance Alert (Revenue Opportunity - Paid Feature)
    // Prefer BranchMetrics structure when available, fallback to OperationalSignal
    const weekendWeekdayAlert = latestMetrics
      ? this.safeEvaluateAlert('weekend_weekday_imbalance', latestMetrics, () => {
          const weekendWeekdaySignals = allSignals.map(signal => {
            let dailyRevenue = signal.revenue7Days / 7;
            let occupancyRate = signal.occupancyRate || 0;
            let averageDailyRate = signal.averageDailyRate || 0;
            
            if (latestMetrics.modules.accommodation) {
              const acc = latestMetrics.modules.accommodation;
              occupancyRate = acc.occupancyRateLast30DaysPct / 100;
              averageDailyRate = acc.averageDailyRoomRateTHB;
              dailyRevenue = latestMetrics.financials.revenueLast30DaysTHB / 30;
            } else {
              if (signal.weekdayRevenue30d !== undefined && signal.weekendRevenue30d !== undefined) {
                const weekdayDailyAvg = signal.weekdayRevenue30d / (30 * 4/7);
                const weekendDailyAvg = signal.weekendRevenue30d / (30 * 3/7);
                dailyRevenue = (weekdayDailyAvg + weekendDailyAvg) / 2;
              }
              
              if (!averageDailyRate && signal.revenue7Days > 0 && signal.occupancyRate) {
                averageDailyRate = (signal.revenue7Days / 7) / (signal.occupancyRate || 1);
              }
            }
            
            return {
              timestamp: signal.timestamp,
              dailyRevenue,
              occupancyRate,
              averageDailyRate,
            };
          });
          
          if (weekendWeekdaySignals.length < 28) {
            return null;
          }
          
          return this.weekendWeekdayImbalanceRule.evaluate(smeOSInput, weekendWeekdaySignals);
        }, 'Weekend-Weekday Imbalance')
      : (() => {
          try {
            const weekendWeekdaySignals = allSignals.map(signal => {
              let dailyRevenue = signal.revenue7Days / 7;
              let occupancyRate = signal.occupancyRate || 0;
              let averageDailyRate = signal.averageDailyRate || 0;
              
              if (signal.weekdayRevenue30d !== undefined && signal.weekendRevenue30d !== undefined) {
                const weekdayDailyAvg = signal.weekdayRevenue30d / (30 * 4/7);
                const weekendDailyAvg = signal.weekendRevenue30d / (30 * 3/7);
                dailyRevenue = (weekdayDailyAvg + weekendDailyAvg) / 2;
              }
              
              if (!averageDailyRate && signal.revenue7Days > 0 && signal.occupancyRate) {
                averageDailyRate = (signal.revenue7Days / 7) / (signal.occupancyRate || 1);
              }
              
              return {
                timestamp: signal.timestamp,
                dailyRevenue,
                occupancyRate,
                averageDailyRate,
              };
            });
            
            if (weekendWeekdaySignals.length < 28) {
              return null;
            }
            
            return this.weekendWeekdayImbalanceRule.evaluate(smeOSInput, weekendWeekdaySignals);
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[ALERT_ERROR] Failed to evaluate Weekend-Weekday Imbalance:', error);
            }
            return null;
          }
        })();
    
    // Low Weekday Utilization Alert (for café/restaurant F&B operations)
    // Convert OperationalSignal[] to format expected by rule (with dailyRevenue)
    // The rule needs at least 14 unique weekday days
    // If café-specific fields are available, use them to create more accurate signals
    const lowWeekdayUtilizationAlertRaw = latestMetrics
      ? this.safeEvaluateAlert('low_weekday_utilization', latestMetrics, () => {
          const lowWeekdayUtilizationSignals = allSignals.map(signal => {
            const dailyRevenue = signal.avgWeekdayRevenue14d !== undefined 
              ? signal.avgWeekdayRevenue14d 
              : signal.revenue7Days / 7;
            
            return {
              timestamp: signal.timestamp,
              dailyRevenue,
            };
          });
          
          if (lowWeekdayUtilizationSignals.length < 14) {
            return null;
          }
          
          return this.lowWeekdayUtilizationRule.evaluate(smeOSInput, lowWeekdayUtilizationSignals);
        }, 'Low Weekday Utilization')
      : (() => {
          try {
            const lowWeekdayUtilizationSignals = allSignals.map(signal => {
              const dailyRevenue = signal.avgWeekdayRevenue14d !== undefined 
                ? signal.avgWeekdayRevenue14d 
                : signal.revenue7Days / 7;
              
              return {
                timestamp: signal.timestamp,
                dailyRevenue,
              };
            });
            
            if (lowWeekdayUtilizationSignals.length < 14) {
              return null;
            }
            
            return this.lowWeekdayUtilizationRule.evaluate(smeOSInput, lowWeekdayUtilizationSignals);
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[ALERT_ERROR] Failed to evaluate Low Weekday Utilization:', error);
            }
            return null;
          }
        })();
    
    // Transform alert to match AlertContract format (convert impact to weight)
    // The rule returns contributingFactors with impact/direction, but AlertContract expects weight
    const lowWeekdayUtilizationAlert: AlertContract | null = lowWeekdayUtilizationAlertRaw ? {
      id: (lowWeekdayUtilizationAlertRaw as any).id,
      timestamp: (lowWeekdayUtilizationAlertRaw as any).timestamp,
      type: (lowWeekdayUtilizationAlertRaw as any).type,
      severity: (lowWeekdayUtilizationAlertRaw as any).severity,
      domain: (lowWeekdayUtilizationAlertRaw as any).domain,
      timeHorizon: (lowWeekdayUtilizationAlertRaw as any).timeHorizon,
      relevanceWindow: (lowWeekdayUtilizationAlertRaw as any).relevanceWindow,
      message: (lowWeekdayUtilizationAlertRaw as any).message,
      confidence: (lowWeekdayUtilizationAlertRaw as any).confidence,
      conditions: (lowWeekdayUtilizationAlertRaw as any).conditions,
      contributingFactors: ((lowWeekdayUtilizationAlertRaw as any).contributingFactors || []).map((factor: any) => ({
        factor: factor.factor,
        weight: factor.impact === 'high' ? 0.8 : factor.impact === 'medium' ? 0.5 : 0.3
      })),
      relatedAlerts: (lowWeekdayUtilizationAlertRaw as any).relatedAlerts,
      decisionHistory: (lowWeekdayUtilizationAlertRaw as any).decisionHistory,
    } : null;
    
    // Calculate average confidence from existing alerts for data confidence rule
    const existingAlerts = [alert, demandDropAlert, costPressureAlert, marginCompressionAlert].filter(Boolean) as AlertContract[];
    const avgConfidence = existingAlerts.length > 0
      ? existingAlerts.reduce((sum, a) => sum + a.confidence, 0) / existingAlerts.length
      : 0.75;
    
    // Get branch modules (needed for alert scope checks and legacy type mapping)
    const branchModules = this.getBranchModules(setup, currentBranchId);
    
    // Map modules to legacy format expected by DataConfidenceRiskRule
    const legacyBusinessType = branchModules.includes('accommodation') 
      ? 'hotel' as 'hotel' | 'cafe' | 'resort' | 'restaurant'
      : branchModules.includes('fnb')
      ? 'cafe' as 'hotel' | 'cafe' | 'resort' | 'restaurant'
      : undefined;

    const dataConfidenceAlert = latestMetrics
      ? this.safeEvaluateAlert('data_confidence_risk', latestMetrics, () => this.dataConfidenceRiskRule.evaluate(
          smeOSInput,
          lastUpdateAt,
          avgConfidence,
          legacyBusinessType
        ), 'Data Confidence Risk')
      : this.dataConfidenceRiskRule.evaluate(smeOSInput, lastUpdateAt, avgConfidence, legacyBusinessType);

    // ===== NEWLY ACTIVATED ALERTS =====
    // 1. Capacity Utilization Alert (Accommodation module only)
    // Requires: occupancyRate, >=21 days
    // Optional but recommended: totalRooms, averageDailyRate (for revenue impact calculation)
    // Prefer BranchMetrics structure when available
    let capacityUtilizationAlert: AlertContract | null = null;
    if (this.matchesAlertScope(branchModules, 'accommodation') && latestMetrics) {
      capacityUtilizationAlert = this.safeEvaluateAlert('capacity_utilization', latestMetrics, () => {
        // Get accommodation data from BranchMetrics if available, otherwise from OperationalSignal
        const latestSignalForCapacity = allSignals[0];
        const occupancyRate = latestMetrics.modules.accommodation?.occupancyRateLast30DaysPct 
          ? latestMetrics.modules.accommodation.occupancyRateLast30DaysPct / 100
          : latestSignalForCapacity?.occupancyRate;
        
        const totalRooms = latestMetrics.modules.accommodation?.totalRoomsAvailable 
          ?? latestSignalForCapacity?.totalRooms;
        
        const averageDailyRate = latestMetrics.modules.accommodation?.averageDailyRoomRateTHB 
          ?? latestSignalForCapacity?.averageDailyRate;
        
        // Safety checks: Ensure we have required hotel-specific data
        const hasRequiredData = occupancyRate !== undefined;
        
        // Optional but recommended fields for enhanced alert quality
        const hasEnhancedData = totalRooms !== undefined && averageDailyRate !== undefined;
        
        if (!hasRequiredData) {
          return null;
        }
        
        const capacitySignals = allSignals
          .filter(s => s.occupancyRate !== undefined)
          .map(s => ({
            timestamp: s.timestamp,
            occupancyRate: s.occupancyRate!,
          }));
          
        if (capacitySignals.length < 21) {
          return null;
        }
        
        const alert = this.capacityUtilizationRule.evaluate(smeOSInput, capacitySignals);
        
        // Enhance alert with revenue impact if we have totalRooms and ADR
        if (alert && hasEnhancedData) {
          const avgOccupancy = capacitySignals.reduce((sum, s) => sum + s.occupancyRate, 0) / capacitySignals.length;
          const rooms = totalRooms!;
          const adr = averageDailyRate!;
          
          // Calculate revenue impact based on utilization gap
          let monthlyRevenueImpact: number | null = null;
          let revenueImpactTitle: string | null = null;
          let revenueImpactDescription: string | null = null;
          
          if (alert.type === 'opportunity' && avgOccupancy < 0.75) {
            const targetUtilization = 0.75;
            const utilizationGap = targetUtilization - avgOccupancy;
            monthlyRevenueImpact = rooms * adr * 30 * utilizationGap;
            
            if (monthlyRevenueImpact > 0) {
              const confidenceMultiplier = alert.confidence < 0.70 
                ? alert.confidence / 0.70 
                : 1.0;
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact * confidenceMultiplier);
              
              revenueImpactTitle = 'Unused room capacity is costing you revenue';
              revenueImpactDescription = `At current occupancy, you are leaving approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month on the table.`;
            }
          } else if (alert.type === 'risk' && avgOccupancy > 0.85) {
            const optimalOccupancy = 0.85;
            const excessUtilization = avgOccupancy - optimalOccupancy;
            monthlyRevenueImpact = rooms * adr * 30 * excessUtilization;
            
            if (monthlyRevenueImpact > 0) {
              const confidenceMultiplier = alert.confidence < 0.70 
                ? alert.confidence / 0.70 
                : 1.0;
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact * confidenceMultiplier);
              
              revenueImpactTitle = 'High occupancy may be limiting pricing power';
              revenueImpactDescription = `Optimizing pricing could unlock approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month.`;
            }
          }
          
          if (monthlyRevenueImpact !== null && monthlyRevenueImpact > 0) {
            (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
            (alert as ExtendedAlertContract).revenueImpactTitle = revenueImpactTitle || '';
            (alert as ExtendedAlertContract).revenueImpactDescription = revenueImpactDescription || '';
            
            const revenueImpactText = revenueImpactDescription || `Estimated monthly impact: ฿${monthlyRevenueImpact.toLocaleString('en-US')}`;
            alert.message = `${alert.message}. ${revenueImpactText}`;
            
            if (alert.conditions) {
              alert.conditions.push(`Revenue impact: ${revenueImpactText}`);
            }
          }
        }
        
        return alert;
      }, 'Capacity Utilization');
    }
    
    // 2. Weekend-Weekday F&B Gap Alert (Cafe/Restaurant only) - ACTIVATED
    // PART 2: Activate Weekend–Weekday F&B Gap Alert
    // Requires: dailyRevenue, weekday vs weekend breakdown, >=14 days
    let weekendWeekdayFnbGapAlert: AlertContract | null = null;
    if (this.matchesAlertScope(branchModules, 'fnb') && latestMetrics) {
      weekendWeekdayFnbGapAlert = this.safeEvaluateAlert('fnb_gap', latestMetrics, () => {
        // Weekend-Weekday F&B Gap Alert
        // Use café-specific weekday/weekend revenue fields if available for more accurate evaluation
        const fnbGapSignals = allSignals.map(signal => {
          const dayOfWeek = signal.timestamp.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          const dailyRevenue = isWeekend 
            ? (signal.avgWeekendRevenue14d !== undefined ? signal.avgWeekendRevenue14d : signal.revenue7Days / 7)
            : (signal.avgWeekdayRevenue14d !== undefined ? signal.avgWeekdayRevenue14d : signal.revenue7Days / 7);
          
          return {
            timestamp: signal.timestamp,
            dailyRevenue,
          };
        });
        
        if (fnbGapSignals.length < 14) {
          return null;
        }
        
        const alert = this.weekendWeekdayFnbGapRule.evaluate(smeOSInput, fnbGapSignals);
        
        // Calculate revenue impact for Weekend-Weekday F&B Gap
        if (alert && latestSignal) {
          const weekdayRevenues: number[] = [];
          const weekendRevenues: number[] = [];
          
          fnbGapSignals.forEach(signal => {
            const dayOfWeek = signal.timestamp.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              weekendRevenues.push(signal.dailyRevenue);
            } else {
              weekdayRevenues.push(signal.dailyRevenue);
            }
          });
          
          const weekdayAvg = weekdayRevenues.length > 0 
            ? weekdayRevenues.reduce((sum, rev) => sum + rev, 0) / weekdayRevenues.length 
            : 0;
          const weekendAvg = weekendRevenues.length > 0 
            ? weekendRevenues.reduce((sum, rev) => sum + rev, 0) / weekendRevenues.length 
            : 0;
          
          if (weekdayAvg > 0 && weekendAvg > weekdayAvg) {
            const gap = weekendAvg - weekdayAvg;
            const monthlyRevenueImpact = Math.round(gap * 20);
            
            if (monthlyRevenueImpact > 0) {
              const confidenceMultiplier = alert.confidence < 0.70 
                ? alert.confidence / 0.70 
                : 1.0;
              const adjustedImpact = Math.round(monthlyRevenueImpact * confidenceMultiplier);
              
              (alert as ExtendedAlertContract).revenueImpact = adjustedImpact;
              (alert as ExtendedAlertContract).revenueImpactTitle = 'Weekday sales are underperforming';
              (alert as ExtendedAlertContract).revenueImpactDescription = `If weekday performance matched weekends, you could gain approximately ฿${adjustedImpact.toLocaleString('en-US')}/month.`;
              
              alert.message = `${alert.message}. ${(alert as ExtendedAlertContract).revenueImpactDescription}`;
              
              if (alert.conditions) {
                alert.conditions.push(`Revenue impact: ฿${adjustedImpact.toLocaleString('en-US')}/month`);
              }
            }
          }
        }
        
        return alert;
      }, 'Weekend-Weekday F&B Gap');
    }
    
    // 3. Menu Revenue Concentration Alert (Cafe/Restaurant only)
    // Requires: menu item revenue data with menuItemId, menuItemName, revenue per item per day
    // Minimum: >=14 days, 5+ unique menu items
    let menuRevenueConcentrationAlert: AlertContract | null = null;
    if (this.matchesAlertScope(branchModules, 'fnb') && latestMetrics) {
      menuRevenueConcentrationAlert = this.safeEvaluateAlert('menu_revenue_concentration', latestMetrics, () => {
        // Get menu item breakdown signals (detailed per-item, per-day data)
        const menuItemSignals = operationalSignalsService.getMenuItemSignalsForDateRange(14, currentBranchId);
        
        if (menuItemSignals.length === 0) {
          return null;
        }
        
        // Group by date to count unique days
        const uniqueDates = new Set(menuItemSignals.map(s => s.timestamp.toISOString().split('T')[0]));
        const uniqueItems = new Set(menuItemSignals.map(s => s.menuItemId));
        
        if (uniqueDates.size < 14 || uniqueItems.size < 5) {
          return null;
        }
        
        const alert = this.menuRevenueConcentrationRule.evaluate(smeOSInput, menuItemSignals);
        
        // Calculate revenue impact for menu revenue concentration
        if (alert && latestMetrics) {
          const revenue = latestMetrics.financials.revenueLast30DaysTHB;
          const concentration = latestMetrics.modules.fnb?.top3MenuRevenueShareLast30DaysPct || 0;
          
          // Revenue impact = risk of revenue loss if top items decline
          // Higher concentration = higher risk
          let monthlyRevenueImpact = 0;
          if (concentration > 70) {
            monthlyRevenueImpact = revenue * 0.08; // 8% of revenue at risk
          } else if (concentration > 60) {
            monthlyRevenueImpact = revenue * 0.05; // 5% of revenue at risk
          } else if (concentration > 50) {
            monthlyRevenueImpact = revenue * 0.03; // 3% of revenue at risk
          }
          
          if (monthlyRevenueImpact > 0) {
            const severityMultiplier = alert.severity === 'critical' ? 1.0 : alert.severity === 'warning' ? 0.7 : 0.4;
            monthlyRevenueImpact = Math.round(monthlyRevenueImpact * severityMultiplier);
            
            (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
            (alert as ExtendedAlertContract).revenueImpactTitle = 'High menu concentration creates revenue risk';
            (alert as ExtendedAlertContract).revenueImpactDescription = `Menu concentration risk could impact approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month if top items decline.`;
          }
        }
        
        if (alert && currentBranchId) {
          alert.branchId = currentBranchId;
        }
        
        return alert;
      }, 'Menu Revenue Concentration');
    }
    
    // 4. Liquidity Runway Risk Alert (General)
    // Requires: cashBalance, netCashFlow, >=30 days
    const liquidityRunwayAlert = latestMetrics
      ? this.safeEvaluateAlert('liquidity_runway', latestMetrics, () => {
          const liquiditySignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            cashBalance: signal.cashBalance,
            netCashFlow: signal.revenue30Days - signal.costs30Days,
          }));
          
          if (liquiditySignals.length < 30) {
            return null;
          }
          
          const alert = this.liquidityRunwayRiskRule.evaluate(smeOSInput, liquiditySignals);
          
          // Calculate revenue impact for liquidity runway risk
          if (alert && latestMetrics) {
            const revenue = latestMetrics.financials.revenueLast30DaysTHB;
            const cashBalance = latestMetrics.financials.cashBalanceTHB;
            const monthlyCosts = latestMetrics.financials.costsLast30DaysTHB;
            
            // Calculate runway months
            const netCashFlow = revenue - monthlyCosts;
            const runwayMonths = netCashFlow < 0 ? cashBalance / Math.abs(netCashFlow) : 999;
            
            // Revenue impact = risk of business disruption
            // Critical (< 3 months): 8-10% of revenue
            // Warning (3-6 months): 4-6% of revenue
            // Informational (6-12 months): 2-3% of revenue
            let monthlyRevenueImpact = 0;
            if (runwayMonths < 3) {
              monthlyRevenueImpact = revenue * 0.09; // 9% of revenue
            } else if (runwayMonths < 6) {
              monthlyRevenueImpact = revenue * 0.05; // 5% of revenue
            } else if (runwayMonths < 12) {
              monthlyRevenueImpact = revenue * 0.025; // 2.5% of revenue
            }
            
            if (monthlyRevenueImpact > 0) {
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact);
              
              (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
              (alert as ExtendedAlertContract).revenueImpactTitle = 'Low cash runway creates business risk';
              (alert as ExtendedAlertContract).revenueImpactDescription = `Cash runway risk could impact approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month in operations.`;
            }
          }
          
          return alert;
        }, 'Liquidity Runway Risk')
      : (() => {
          const liquiditySignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            cashBalance: signal.cashBalance,
            netCashFlow: signal.revenue30Days - signal.costs30Days,
          }));
          if (liquiditySignals.length < 30) {
            return null;
          }
          return this.liquidityRunwayRiskRule.evaluate(smeOSInput, liquiditySignals);
        })();
    
    // 5. Revenue Concentration Alert (General)
    // Requires: dailyRevenue, >=21 days
    const revenueConcentrationAlert = latestMetrics
      ? this.safeEvaluateAlert('revenue_concentration', latestMetrics, () => {
          const revenueConcentrationSignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
          }));
          if (revenueConcentrationSignals.length < 21) {
            return null;
          }
          return this.revenueConcentrationRule.evaluate(smeOSInput, revenueConcentrationSignals);
        }, 'Revenue Concentration')
      : (() => {
          const revenueConcentrationSignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
          }));
          if (revenueConcentrationSignals.length < 21) {
            return null;
          }
          return this.revenueConcentrationRule.evaluate(smeOSInput, revenueConcentrationSignals);
        })();
    
    // 6. Cash Flow Volatility Alert (General)
    // Requires: dailyRevenue, >=60 days
    const cashFlowVolatilityAlert = latestMetrics
      ? this.safeEvaluateAlert('cash_flow_volatility', latestMetrics, () => {
          const cashFlowVolatilitySignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
          }));
          if (cashFlowVolatilitySignals.length < 60) {
            return null;
          }
          return this.cashFlowVolatilityRule.evaluate(smeOSInput, cashFlowVolatilitySignals);
        }, 'Cash Flow Volatility')
      : (() => {
          const cashFlowVolatilitySignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
          }));
          if (cashFlowVolatilitySignals.length < 60) {
            return null;
          }
          return this.cashFlowVolatilityRule.evaluate(smeOSInput, cashFlowVolatilitySignals);
        })();
    
    // 7. Break-Even Risk Alert (General)
    // Requires: dailyRevenue, dailyExpenses, >=30 days
    const breakEvenAlert = latestMetrics
      ? this.safeEvaluateAlert('break_even_risk', latestMetrics, () => {
          const breakEvenSignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
            dailyExpenses: signal.costs7Days / 7,
          }));
          if (breakEvenSignals.length < 30) {
            return null;
          }
          
          const alert = this.breakEvenRiskRule.evaluate(smeOSInput, breakEvenSignals);
          
          // Calculate revenue impact for break-even risk
          if (alert && latestMetrics) {
            const revenue = latestMetrics.financials.revenueLast30DaysTHB;
            const costs = latestMetrics.financials.costsLast30DaysTHB;
            const breakEvenRatio = revenue > 0 ? revenue / costs : 0;
            
            // Revenue impact = gap to break-even or excess costs
            let monthlyRevenueImpact = 0;
            if (breakEvenRatio < 0.9) {
              // Critical: far below break-even
              monthlyRevenueImpact = Math.abs(revenue - costs) * 1.2; // Loss amount + 20% risk premium
            } else if (breakEvenRatio < 1.0) {
              // Warning: below break-even
              monthlyRevenueImpact = Math.abs(revenue - costs) * 0.8; // Loss amount + risk
            } else if (breakEvenRatio < 1.05) {
              // Informational: very close to break-even
              monthlyRevenueImpact = revenue * 0.03; // 3% of revenue at risk
            }
            
            if (monthlyRevenueImpact > 0) {
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact);
              
              (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
              (alert as ExtendedAlertContract).revenueImpactTitle = breakEvenRatio < 1.0
                ? 'Operating below break-even point'
                : 'Very close to break-even point';
              (alert as ExtendedAlertContract).revenueImpactDescription = breakEvenRatio < 1.0
                ? `Operating below break-even is costing approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month.`
                : `Break-even risk could impact approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month.`;
            }
          }
          
          return alert;
        }, 'Break-Even Risk')
      : (() => {
          const breakEvenSignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
            dailyExpenses: signal.costs7Days / 7,
          }));
          if (breakEvenSignals.length < 30) {
            return null;
          }
          return this.breakEvenRiskRule.evaluate(smeOSInput, breakEvenSignals);
        })();
    
    // 8. Seasonality Risk Alert (General)
    // Requires: dailyRevenue, >=90 days
    const seasonalityRiskAlert = latestMetrics
      ? this.safeEvaluateAlert('seasonality_risk', latestMetrics, () => {
          const seasonalitySignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
          }));
          if (seasonalitySignals.length < 90) {
            return null;
          }
          return this.seasonalityRiskRule.evaluate(smeOSInput, seasonalitySignals);
        }, 'Seasonality Risk')
      : (() => {
          const seasonalitySignals = allSignals.map(signal => ({
            timestamp: signal.timestamp,
            dailyRevenue: signal.revenue7Days / 7,
          }));
          if (seasonalitySignals.length < 90) {
            return null;
          }
          return this.seasonalityRiskRule.evaluate(smeOSInput, seasonalitySignals);
        })();

    // 9. Cash Runway Alert (General)
    // Requires: cashBalance, cashFlows
    // Cash flows are constructed in translateToSMEOS from revenue.dates and financial.expenses
    const cashRunwayAlert = latestMetrics
      ? this.safeEvaluateAlert('cash_runway', latestMetrics, () => {
          // CashRunwayRule uses InputContract.financial.cashFlows
          // Cash flows are constructed in translateToSMEOS, so check smeOSInput
          if (!smeOSInput.financial?.cashFlows || smeOSInput.financial.cashFlows.length === 0) {
            // Debug: log why cash flows are missing
            if (process.env.NODE_ENV === 'development') {
              console.warn('[CASH_RUNWAY] No cash flows available:', {
                hasRevenueDates: hospitalityData.revenue.dates?.length > 0,
                hasExpenses: hospitalityData.financial.expenses?.length > 0,
                revenueDatesCount: hospitalityData.revenue.dates?.length || 0,
                expensesCount: hospitalityData.financial.expenses?.length || 0,
              });
            }
            return null;
          }
          const alert = this.cashRunwayRule.evaluate(smeOSInput);
          
          // Calculate revenue impact for cash runway
          if (alert && latestMetrics) {
            const revenue = latestMetrics.financials.revenueLast30DaysTHB;
            const cashBalance = latestMetrics.financials.cashBalanceTHB;
            
            // Revenue impact based on severity
            let monthlyRevenueImpact = 0;
            if (alert.severity === 'critical') {
              monthlyRevenueImpact = revenue * 0.08; // 8% of revenue
            } else if (alert.severity === 'warning') {
              monthlyRevenueImpact = revenue * 0.04; // 4% of revenue
            } else {
              monthlyRevenueImpact = revenue * 0.02; // 2% of revenue
            }
            
            if (monthlyRevenueImpact > 0) {
              monthlyRevenueImpact = Math.round(monthlyRevenueImpact);
              
              (alert as ExtendedAlertContract).revenueImpact = monthlyRevenueImpact;
              (alert as ExtendedAlertContract).revenueImpactTitle = 'Cash runway risk threatens operations';
              (alert as ExtendedAlertContract).revenueImpactDescription = `Cash runway risk could impact approximately ฿${monthlyRevenueImpact.toLocaleString('en-US')}/month in operations.`;
            }
          }
          
          return alert;
        }, 'Cash Runway')
      : (() => {
          try {
            if (!smeOSInput.financial?.cashFlows || smeOSInput.financial.cashFlows.length === 0) {
              return null;
            }
            return this.cashRunwayRule.evaluate(smeOSInput);
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[ALERT_ERROR] Failed to evaluate Cash Runway:', error);
            }
            return null;
          }
        })();
    // ===== END NEWLY ACTIVATED ALERTS =====

    // All Branches view: use real data only; no simulation multi-branch evaluation
    const allBranchAlerts: AlertContract[] = [];

    // Collect all alerts (for single branch view or fallback)
    const trendAlerts: AlertContract[] = [];
    if (demandDropAlert) trendAlerts.push(demandDropAlert);
    if (costPressureAlert) trendAlerts.push(costPressureAlert);
    if (marginCompressionAlert) trendAlerts.push(marginCompressionAlert);
    if (seasonalMismatchAlert) trendAlerts.push(seasonalMismatchAlert);
    if (weekendWeekdayAlert) trendAlerts.push(weekendWeekdayAlert);
    if (lowWeekdayUtilizationAlert) trendAlerts.push(lowWeekdayUtilizationAlert);
    if (dataConfidenceAlert) trendAlerts.push(dataConfidenceAlert);
    // All activated alerts
    if (capacityUtilizationAlert) trendAlerts.push(capacityUtilizationAlert);
    if (weekendWeekdayFnbGapAlert) trendAlerts.push(weekendWeekdayFnbGapAlert);
    if (menuRevenueConcentrationAlert) trendAlerts.push(menuRevenueConcentrationAlert);
    if (liquidityRunwayAlert) trendAlerts.push(liquidityRunwayAlert);
    if (revenueConcentrationAlert) trendAlerts.push(revenueConcentrationAlert);
    if (cashFlowVolatilityAlert) trendAlerts.push(cashFlowVolatilityAlert);
    if (breakEvenAlert) trendAlerts.push(breakEvenAlert);
    if (seasonalityRiskAlert) trendAlerts.push(seasonalityRiskAlert);
    if (cashRunwayAlert) trendAlerts.push(cashRunwayAlert);
    
    // Use multi-branch alerts if available, otherwise use single-branch alerts
    const alertsToUse = allBranchAlerts.length > 0 ? allBranchAlerts : trendAlerts;

    // Apply confidence decay to all alerts using industry-specific thresholds
    // Add branchId and businessGroupId to all alerts
    const allAlerts: ExtendedAlertContract[] = [];
    if (alert) {
      const decayedAlert = this.applyConfidenceDecay(alert, lastUpdateAt, branchModules, setup?.businessType || null);
      if (currentBranchId) {
        decayedAlert.branchId = currentBranchId;
        if (businessGroupId) {
          decayedAlert.businessGroupId = businessGroupId;
        }
      }
      allAlerts.push(decayedAlert);
    }
    alertsToUse.forEach(trendAlert => {
      const decayedAlert = this.applyConfidenceDecay(trendAlert, lastUpdateAt, branchModules, setup?.businessType || null);
      // branchId should already be set for multi-branch alerts
      if (!decayedAlert.branchId && currentBranchId) {
        decayedAlert.branchId = currentBranchId;
      }
      if (businessGroupId && !decayedAlert.businessGroupId) {
        decayedAlert.businessGroupId = businessGroupId;
      }
      allAlerts.push(decayedAlert);
    });

    // Generate data freshness warnings using industry-specific thresholds
    // These are informational and should always be shown, so add them before filtering
    // Map modules to businessType for backward compatibility with freshness config
    const businessTypeForFreshness = branchModules.includes('accommodation') && branchModules.includes('fnb')
      ? 'hotel_with_cafe'
      : branchModules.includes('accommodation')
      ? 'hotel_resort'
      : 'cafe_restaurant';
    const freshnessWarnings = this.generateFreshnessWarnings(lastUpdateAt, businessTypeForFreshness as any, 'th');
    freshnessWarnings.forEach(warning => {
      if (currentBranchId) {
        warning.branchId = currentBranchId;
        if (businessGroupId) {
          warning.businessGroupId = businessGroupId;
        }
      }
    });
    allAlerts.push(...freshnessWarnings);

    // Hard assertions: severity, revenueImpact, recommendation (message), no duplicates
    const validSeverities = new Set<string>(['informational', 'warning', 'critical']);
    for (const a of allAlerts) {
      if (!validSeverities.has(a.severity)) {
        throw new Error(`Alert engine: invalid severity "${a.severity}" (must be informational | warning | critical)`);
      }
      const rev = (a as ExtendedAlertContract).revenueImpact;
      if (rev !== undefined && rev !== null && (typeof rev !== 'number' || Number.isNaN(rev) || rev < 0)) {
        throw new Error(`Alert engine: revenueImpact must be >= 0 and not NaN, got ${rev}`);
      }
      if (a.message === undefined || a.message === null || String(a.message).trim() === '') {
        throw new Error(`Alert engine: missing or empty recommendation/message for alert ${a.id}`);
      }
    }
    const businessAlertsForDedup = allAlerts.filter((a) => !a.id?.includes('freshness-warning'));
    const alertTypes = businessAlertsForDedup.map((a) => a.id.split('-').filter((p) => !/^\d+$/.test(p)).join('-'));
    const uniqueTypes = new Set(alertTypes);
    if (uniqueTypes.size !== businessAlertsForDedup.length) {
      throw new Error('Alert engine: duplicate alerts detected (same type emitted more than once)');
    }

    // Assign product-level category and inject phase-based insights (Day 1 micro, Day 3 trend, Day 5 variability)
    this.assignAlertCategories(allAlerts);
    this.injectPhaseBasedInsights(
      allAlerts,
      dataCoverageDays,
      currentBranchId ?? undefined,
      businessGroupId
    );

    // Store confidence snapshot for history (once per day max)
    this.storeConfidenceSnapshot(setup?.businessType || null, lastUpdateAt, allAlerts);

    // Filter alerts based on confidence threshold (suppress Critical/Warning if confidence < 50%)
    // Freshness warnings are informational and will pass through filter
    const filteredAlerts = this.filterAlertsByConfidence(allAlerts);

    // Filter alerts by branch selection AND user permissions
    let branchFilteredAlerts = filteredAlerts.filtered;
    
    // First, apply permission filtering to prevent cross-branch data leakage
    // Note: This is a fallback - the main filtering happens in useHospitalityAlerts hook
    // This ensures alerts are filtered even if hook is bypassed
    try {
      const { getUserPermissions } = require('./permissions-service');
      // Get user email from localStorage (same as user session context)
      const currentUserEmail = typeof window !== 'undefined' 
        ? localStorage.getItem('hospitality_user_email')
        : null;
      const userPermissions = getUserPermissions(currentUserEmail);
      
      // Filter by permissions (owners see all, manager/branch see only assigned branches)
      if (userPermissions.role !== 'owner' && userPermissions.branchIds && userPermissions.branchIds.length > 0) {
        const allowedBranchIds = userPermissions.branchIds;
        branchFilteredAlerts = branchFilteredAlerts.filter(alert => {
          if (!alert.branchId) return false; // Non-owner roles cannot see alerts without branchId
          return allowedBranchIds.includes(alert.branchId);
        });
      }
    } catch (e) {
      // Permissions service not available, continue without filtering
    }
    
    // Then apply branch selection filtering
    if (!isAllBranches && currentBranchId) {
      // Show only alerts for selected branch
      branchFilteredAlerts = branchFilteredAlerts.filter(
        alert => alert.branchId === currentBranchId
      );
    } else if (isAllBranches && businessGroupId) {
      // Show all alerts for the business group (already filtered by permissions above)
      branchFilteredAlerts = branchFilteredAlerts.filter(
        alert => !alert.branchId || alert.businessGroupId === businessGroupId
      );
    }

    // When no critical/warning (healthy): ensure at least one positive_optimization insight so we don't show only high score
    const hasOptimization = branchFilteredAlerts.some((a) => (a as ExtendedAlertContract).alertCategory === 'positive_optimization');
    const hasCriticalOrWarning = branchFilteredAlerts.some((a) => a.severity === 'critical' || a.severity === 'warning');
    if (!hasOptimization && !hasCriticalOrWarning && branchFilteredAlerts.length > 0 && (currentBranchId || businessGroupId)) {
      const now = new Date();
      branchFilteredAlerts = [
        ...branchFilteredAlerts,
        {
          id: `optimization-healthy-${currentBranchId ?? businessGroupId}-${now.getTime()}`,
          timestamp: now,
          type: 'opportunity' as const,
          severity: 'informational' as const,
          domain: 'risk' as const,
          timeHorizon: 'medium-term' as const,
          relevanceWindow: { start: now, end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
          message: 'Operations are within normal range. Consider reviewing margin and occupancy to spot optimization opportunities.',
          messageTh: 'การดำเนินงานอยู่ในช่วงปกติ — พิจารณาตรวจสอบอัตรากำไรและอัตราการเข้าพักเพื่อหาโอกาสปรับปรุง',
          confidence: 0.75,
          contributingFactors: [{ factor: 'Stable metrics', weight: 0.5 }],
          conditions: [],
          branchId: currentBranchId ?? undefined,
          businessGroupId,
          alertCategory: 'positive_optimization' as const,
          revenueImpactTitle: 'Suggest reviewing pricing or cost structure for incremental gains.',
          revenueImpactTitleTh: 'แนะนำตรวจสอบราคาหรือโครงสร้างต้นทุนเพื่อผลกำไรเพิ่ม',
        } as ExtendedAlertContract,
      ];
    }

    // Reset reminder state if data was just updated (within last hour)
    if (lastUpdateAt) {
      const updateAgeMs = new Date().getTime() - lastUpdateAt.getTime();
      const updateAgeHours = updateAgeMs / (1000 * 60 * 60);
      if (updateAgeHours < 1) {
        this.resetReminderState();
      }
    }

    // Generate health score snapshots (once per day)
    // Only generate if we have businessGroupId and alerts are finalized
    if (businessGroupId && typeof window !== 'undefined') {
      try {
        const {
          generateHealthScoreSnapshot,
          generateAlertSnapshots,
          saveHealthScoreSnapshot,
          saveAlertSnapshots,
          hasSnapshotForToday,
        } = require('../../../../core/sme-os/engine/services/health-score-trend-service');

        // Generate snapshots for group level (if all branches selected)
        if (isAllBranches) {
          // Group-level snapshot (aggregate all alerts)
          if (!hasSnapshotForToday(businessGroupId)) {
            const groupSnapshot = generateHealthScoreSnapshot(
              branchFilteredAlerts,
              businessGroupId
            );
            saveHealthScoreSnapshot(groupSnapshot);

            const groupAlertSnapshots = generateAlertSnapshots(
              branchFilteredAlerts,
              businessGroupId
            );
            saveAlertSnapshots(groupAlertSnapshots);
          }
        } else if (currentBranchId) {
          // Branch-level snapshot
          const branchAlerts = branchFilteredAlerts.filter(
            a => a.branchId === currentBranchId
          );
          if (branchAlerts.length > 0 && !hasSnapshotForToday(businessGroupId, currentBranchId)) {
            const branchSnapshot = generateHealthScoreSnapshot(
              branchAlerts,
              businessGroupId,
              currentBranchId
            );
            saveHealthScoreSnapshot(branchSnapshot);

            const branchAlertSnapshots = generateAlertSnapshots(
              branchAlerts,
              businessGroupId,
              currentBranchId
            );
            saveAlertSnapshots(branchAlertSnapshots);
          }
        }
      } catch (e) {
        // Snapshot service not available or error - continue without snapshots
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to generate health score snapshots:', e);
        }
      }
    }

    // Update monitoring status (pass branch selection for proper data coverage calculation)
    const status = this.updateStatus(
      lastUpdateAt,
      isAllBranches ? '__all__' : (currentBranchId || undefined),
      businessGroupId
    );

    // Ensure consistent shape: return empty array if no alerts
    const finalAlerts: ExtendedAlertContract[] = branchFilteredAlerts.map(alert => {
      // Ensure consistent shape with required fields
      const extended: ExtendedAlertContract = {
        ...alert,
        revenueImpact: (alert as ExtendedAlertContract).revenueImpact || 0,
        revenueImpactTitle: (alert as ExtendedAlertContract).revenueImpactTitle || '',
        revenueImpactDescription: (alert as ExtendedAlertContract).revenueImpactDescription || '',
      };
      
      return extended;
    });
    
    // STEP 2 & 3: Force Alerts Under Crisis
    // Ensure crisis scenario triggers at least 2-4 alerts based on metrics conditions
    if (latestMetrics && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('aurasea_test_mode');
        if (stored) {
          const parsed = JSON.parse(stored);
          // Detect crisis from metrics only (no simulation scenario)
          const isCrisisScenario = false;
          
          // STEP 2: Detect crisis from metrics conditions (runway < 2 months, revenue drop > 30%)
          const revenue30d = latestMetrics.financials.revenueLast30DaysTHB;
          const costs30d = latestMetrics.financials.costsLast30DaysTHB;
          const cashBalance = latestMetrics.financials.cashBalanceTHB;
          const monthlyBurnRate = costs30d - revenue30d;
          const runwayMonths = monthlyBurnRate > 0 ? cashBalance / monthlyBurnRate : Infinity;
          
          // Detect revenue drop (compare to base if available, or use margin as proxy)
          const margin = revenue30d > 0 ? ((revenue30d - costs30d) / revenue30d) * 100 : 0;
          const revenueDropDetected = margin < 0 || (revenue30d > 0 && costs30d > revenue30d * 1.3); // Revenue < 77% of costs = >30% drop
          
          // Crisis detected from metrics: runway < 2 months OR revenue drop > 30%
          const crisisFromMetrics = runwayMonths < 2 || revenueDropDetected;
          
          if (isCrisisScenario || crisisFromMetrics) {
            // STEP 7: Debug logging
            if (process.env.NODE_ENV === 'development') {
              console.log('[CRISIS DEBUG] Detecting crisis conditions:', {
                isCrisisScenario,
                crisisFromMetrics,
                runwayMonths: runwayMonths.toFixed(2),
                revenueDropDetected,
                margin: margin.toFixed(1) + '%',
                monthlyBurnRate: Math.round(monthlyBurnRate).toLocaleString(),
              });
            }
            let targetBranchId = currentBranchId;
            // If still no targetBranchId, try to get from latestMetrics or first branch
            if (!targetBranchId && latestMetrics && businessGroupId) {
              try {
                const { businessGroupService } = require('./business-group-service');
                const branches = businessGroupService.getAllBranches();
                if (branches.length > 0) {
                  targetBranchId = branches[0].id;
                }
              } catch (e) {
                // Ignore
              }
            }
            
            const branchAlerts = finalAlerts.filter(a => 
              !targetBranchId || a.branchId === targetBranchId || (!a.branchId && !targetBranchId)
            );
            const criticalCount = branchAlerts.filter(a => a.severity === 'critical').length;
            const warningCount = branchAlerts.filter(a => a.severity === 'warning').length;
            const totalAlertCount = criticalCount + warningCount;
            
            // CRISIS SCENARIO: Always ensure required alerts exist
            // For crisis scenarios, we MUST have liquidity_runway and demand_drop alerts
            const forcedAlerts: ExtendedAlertContract[] = [];
            // Recalculate metrics (already calculated above, but ensure consistency)
            const rev30dInner = latestMetrics.financials.revenueLast30DaysTHB;
            const costs30dInner = latestMetrics.financials.costsLast30DaysTHB;
            const cashBalInner = latestMetrics.financials.cashBalanceTHB;
            const marginInner = rev30dInner > 0 ? ((rev30dInner - costs30dInner) / rev30dInner) * 100 : 0;
            const burnRateInner = costs30dInner - rev30dInner; // Positive = burning cash
            // STEP 2: Calculate runway properly: cash / monthly burn rate
            const crisisRunwayMonths = burnRateInner > 0 
              ? cashBalInner / burnRateInner 
              : Infinity; // If not burning cash, infinite runway
            
            // Check existing alert types to avoid duplicates
            const existingAlertTypes = new Set(branchAlerts.map(a => {
              const id = a.id.toLowerCase();
              if (id.includes('liquidity') || id.includes('runway')) return 'liquidity';
              if (id.includes('demand') || id.includes('drop')) return 'demand';
              if (id.includes('margin') || id.includes('compression')) return 'margin';
              if (id.includes('occupancy') || id.includes('low')) return 'occupancy';
              return '';
            }));
            
            // STEP 2: ALWAYS ensure liquidity runway risk alert exists in crisis
            // Force liquidity alert if runway < 2 months (crisis condition)
            if (!existingAlertTypes.has('liquidity') && crisisRunwayMonths < 2) {
              // Use actual runway if available, otherwise assume < 1 month for crisis
              const actualRunway = crisisRunwayMonths < Infinity ? crisisRunwayMonths : 0.8;
              const severity: 'critical' | 'warning' = actualRunway < 1 ? 'critical' : 'warning';
              // Calculate revenue impact - ensure it meets minimum threshold
              const baseImpact = burnRateInner > 0 
                ? burnRateInner * Math.min(actualRunway, 3) // Burn rate × runway months
                : rev30dInner * 0.20; // Fallback: 20% of revenue if no burn rate
              // Ensure minimum impact for crisis scenarios (at least 30k THB/month)
              const minImpact = 30000;
              const revenueImpact = Math.max(baseImpact, minImpact);
              
              // STEP 7: Debug logging
              if (process.env.NODE_ENV === 'development') {
                console.log('[CRISIS DEBUG] Generating liquidity_runway alert:', {
                  runwayMonths: actualRunway.toFixed(2),
                  monthlyBurnRate: Math.round(burnRateInner).toLocaleString(),
                  revenueImpact: Math.round(revenueImpact).toLocaleString(),
                  severity,
                });
              }
              const alert = {
                id: `liquidity-runway-${Date.now()}`,
                branchId: targetBranchId || '',
                businessGroupId: businessGroupId || '',
                severity,
                message: `Liquidity runway risk: ${actualRunway.toFixed(1)} months remaining`,
                timestamp: new Date(),
                timeHorizon: severity === 'critical' ? 'immediate' : 'near-term',
                confidence: 0.85,
                domain: 'cash',
                conditions: [],
                revenueImpact,
                revenueImpactTitle: 'Liquidity runway risk',
                revenueImpactDescription: `Cash runway of ${actualRunway.toFixed(1)} months poses significant liquidity risk.`,
              } as unknown as ExtendedAlertContract;
              forcedAlerts.push(alert);
            }
            
            // STEP 2: ALWAYS ensure demand drop alert exists in crisis
            // Force demand drop alert if revenue drop > 30% (crisis condition)
            // Revenue drop detected if: margin < 0 OR costs > revenue * 1.3 OR revenue significantly lower than costs
            const hasRevenueDrop = marginInner < 0 || costs30dInner > rev30dInner * 1.3 || (rev30dInner > 0 && (costs30dInner - rev30dInner) / rev30dInner > 0.3);
            
            if (!existingAlertTypes.has('demand') && hasRevenueDrop) {
              // Force demand drop alert - use actual margin if available, otherwise assume degraded
              const actualMargin = marginInner !== 0 ? marginInner : -5; // Default to -5% (loss) for crisis
              const severity: 'critical' | 'warning' = actualMargin < 0 ? 'critical' : 'warning';
              // Calculate revenue impact - ensure it meets minimum threshold
              const baseImpact = rev30dInner * (actualMargin < 0 ? 0.25 : 0.15); // Higher impact for crisis
              // Ensure minimum impact for crisis scenarios (at least 20k THB/month)
              const minImpact = 20000;
              const revenueImpact = Math.max(baseImpact, minImpact);
              
              // STEP 7: Debug logging
              if (process.env.NODE_ENV === 'development') {
                console.log('[CRISIS DEBUG] Generating demand_drop alert:', {
                  revenueDropPercent: actualMargin.toFixed(1) + '%',
                  margin: actualMargin.toFixed(1) + '%',
                  revenueImpact: Math.round(revenueImpact).toLocaleString(),
                  severity,
                });
              }
              const alert = {
                id: `demand-drop-${Date.now()}`,
                branchId: targetBranchId || '',
                businessGroupId: businessGroupId || '',
                severity,
                message: actualMargin < 0 
                  ? 'Operating at a loss: demand collapse'
                  : `Demand drop: profit margin compressed to ${actualMargin.toFixed(1)}%`,
                timestamp: new Date(),
                timeHorizon: severity === 'critical' ? 'immediate' : 'near-term',
                confidence: 0.80,
                domain: 'risk',
                conditions: [],
                revenueImpact,
                revenueImpactTitle: 'Demand collapse',
                revenueImpactDescription: `Revenue decline is costing approximately ฿${Math.round(revenueImpact).toLocaleString('en-US')}/month.`,
              } as unknown as ExtendedAlertContract;
              forcedAlerts.push(alert);
            }
            
            // 3. Additional alerts if we have fewer than 2 total alerts
            if (totalAlertCount + forcedAlerts.length < 2) {
              
              // 3. Margin compression alert (if margin < 15%)
              if (marginInner < 15 && !existingAlertTypes.has('margin')) {
                const severity: 'critical' | 'warning' = marginInner < 0 ? 'critical' : 'warning';
                  const alert = {
                    id: `margin-compression-crisis-${Date.now()}`,
                    branchId: targetBranchId || '',
                    businessGroupId: businessGroupId || '',
                    severity,
                    message: marginInner < 0
                      ? `Operating at a loss: costs exceed revenue by ฿${Math.abs(rev30dInner - costs30dInner).toLocaleString('en-US')}/month`
                      : `Profit margin compressed to ${marginInner.toFixed(1)}%`,
                    timestamp: new Date(),
                    timeHorizon: severity === 'critical' ? 'immediate' : 'near-term',
                    confidence: 0.85,
                    domain: 'margin',
                    conditions: [],
                    revenueImpact: marginInner < 0 
                      ? Math.abs(rev30dInner - costs30dInner)
                      : rev30dInner * 0.08,
                    revenueImpactTitle: 'Margin compression',
                    revenueImpactDescription: marginInner < 0
                      ? `Operating at a loss is costing approximately ฿${Math.abs(rev30dInner - costs30dInner).toLocaleString('en-US')}/month.`
                      : `Margin compression is costing approximately ฿${Math.round(rev30dInner * 0.08).toLocaleString('en-US')}/month.`,
                  } as unknown as ExtendedAlertContract;
                forcedAlerts.push(alert);
              }
              
              // 4. Low occupancy alert (if accommodation and occupancy < 50%)
              if (latestMetrics.modules?.accommodation && !existingAlertTypes.has('occupancy')) {
                const occupancy = latestMetrics.modules.accommodation.occupancyRateLast30DaysPct;
                if (occupancy < 50) {
                  const severity: 'critical' | 'warning' = occupancy < 40 ? 'critical' : 'warning';
                  const rooms = latestMetrics.modules.accommodation.totalRoomsAvailable || 0;
                  const adr = latestMetrics.modules.accommodation.averageDailyRoomRateTHB || 0;
                  const targetOccupancy = 70; // Target occupancy
                  const occupancyGap = targetOccupancy - occupancy;
                  const lostRevenue = (occupancyGap / 100) * rooms * adr * 30;
                  
                  const alert = {
                    id: `low-occupancy-crisis-${Date.now()}`,
                    branchId: targetBranchId || '',
                    businessGroupId: businessGroupId || '',
                    severity,
                    message: `Low occupancy: ${occupancy.toFixed(1)}% (target: 70%)`,
                    timestamp: new Date(),
                    timeHorizon: severity === 'critical' ? 'immediate' : 'near-term',
                    confidence: 0.85,
                    domain: 'risk',
                    conditions: [],
                    revenueImpact: lostRevenue,
                    revenueImpactTitle: 'Low occupancy',
                    revenueImpactDescription: `Occupancy at ${occupancy.toFixed(1)}% is costing approximately ฿${Math.round(lostRevenue).toLocaleString('en-US')}/month in lost revenue.`,
                  } as unknown as ExtendedAlertContract;
                  forcedAlerts.push(alert);
                }
              }
            }
            
            // Add forced alerts to finalAlerts (always add required alerts, limit others to 4 total)
            if (forcedAlerts.length > 0) {
              // Always add liquidity and demand alerts (first 2), then add others up to limit
              const requiredAlerts = forcedAlerts.filter(a => 
                a.id.includes('liquidity-runway') || a.id.includes('demand-drop')
              );
              const optionalAlerts = forcedAlerts.filter(a => 
                !a.id.includes('liquidity-runway') && !a.id.includes('demand-drop')
              );
              
              // Add required alerts first
              finalAlerts.push(...requiredAlerts);
              
              // Add optional alerts up to limit (max 4 total alerts)
              const remainingSlots = Math.max(0, 4 - totalAlertCount - requiredAlerts.length);
              if (remainingSlots > 0 && optionalAlerts.length > 0) {
                finalAlerts.push(...optionalAlerts.slice(0, remainingSlots));
              }
              
              // STEP 7: Debug logging
              if (process.env.NODE_ENV === 'development') {
                const totalRevenueImpact = requiredAlerts.reduce((sum, a) => sum + (a.revenueImpact || 0), 0);
                console.log(`[CRISIS] Forced ${requiredAlerts.length} required alerts + ${Math.min(optionalAlerts.length, remainingSlots)} optional (had ${totalAlertCount} existing)`);
                console.log(`[CRISIS] Target branchId: ${targetBranchId || 'none'}, currentBranchId: ${currentBranchId || 'none'}, isAllBranches: ${isAllBranches}`);
                console.log(`[CRISIS] Required alerts revenue impact: ฿${Math.round(totalRevenueImpact).toLocaleString('en-US')}/month`);
                requiredAlerts.forEach(a => {
                  console.log(`  - ${a.id}: ${a.severity}, branchId: ${a.branchId}, impact: ฿${Math.round(a.revenueImpact || 0).toLocaleString('en-US')}/month`);
                });
                console.log(`[CRISIS DEBUG] Final alerts count after adding forced: ${finalAlerts.length}`);
                console.log(`[CRISIS DEBUG] All final alerts:`, finalAlerts.map(a => ({
                  id: a.id,
                  severity: a.severity,
                  branchId: a.branchId,
                  revenueImpact: (a as ExtendedAlertContract).revenueImpact || 0,
                })));
                
                // STEP 4 & 6: Verify alerts will be visible
                const alertsForCurrentBranch = finalAlerts.filter(a => 
                  !targetBranchId || a.branchId === targetBranchId || (!a.branchId && !targetBranchId)
                );
                console.log(`[CRISIS DEBUG] Alerts for current branch (${targetBranchId || 'all'}):`, alertsForCurrentBranch.length);
                alertsForCurrentBranch.forEach(a => {
                  console.log(`[CRISIS DEBUG]   - ${a.id}: ${a.severity}, impact: ฿${Math.round((a as ExtendedAlertContract).revenueImpact || 0).toLocaleString('en-US')}/month`);
                });
              }
            }
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[MONITORING] Failed to force crisis alerts:', e);
        }
      }
    }
    
    // Ensure status is valid
    const safeStatus: MonitoringStatus = {
      isActive: status.isActive || false,
      lastEvaluated: status.lastEvaluated || null,
      dataCoverageDays: Math.max(0, status.dataCoverageDays || 0),
      evaluationCount: Math.max(0, status.evaluationCount || 0),
      lastOperationalUpdateAt: status.lastOperationalUpdateAt || null,
      trackingState: status.trackingState || 'stale',
      confidenceImpact: status.confidenceImpact || 'none',
      lastReminderSentAt: status.lastReminderSentAt || null,
    };

    // Calculate financial decision engine metrics (Health Score v2)
    // For "All Branches" view, aggregate metrics from all branches
    let decision: {
      totalExposure: number;
      exposurePercent: number;
      healthScoreV2: number;
      improvementPotential: number;
    } | undefined;
    
    // For single branch view, use existing logic
    if (!decision && latestMetrics) {
      try {
        const { calculateRevenueExposure } = await import('../../../../core/sme-os/engine/services/revenue-exposure-engine');
        const { calculateMoneyWeightedHealthScore } = await import('../../../../core/sme-os/engine/health/money-weighted-health-score');
        
        // Calculate revenue exposure
        const exposureResult = calculateRevenueExposure(latestMetrics, finalAlerts);
        
        // Calculate money-weighted health score
        const healthScoreResult = calculateMoneyWeightedHealthScore(latestMetrics, finalAlerts);
        
        // Calculate improvement potential (sum of all projected health increases)
        const improvementPotential = finalAlerts.reduce((sum, alert) => {
          return sum + (alert.projectedHealthIncrease || 0);
        }, 0);
        
        const rawScore = healthScoreResult.score;
        const clampedScore = typeof rawScore === 'number' && !Number.isNaN(rawScore)
          ? Math.max(0, Math.min(100, rawScore))
          : 0;
        decision = {
          totalExposure: exposureResult.totalMonthlyLeakage,
          exposurePercent: exposureResult.exposurePercent,
          healthScoreV2: clampedScore,
          improvementPotential: Math.round(improvementPotential * 10) / 10,
        };
      } catch (e) {
        // If engines not available, skip decision calculation
        if (process.env.NODE_ENV === 'development') {
          console.warn('[MONITORING] Financial decision engine not available:', e);
        }
      }
    }
    
    return {
      alerts: Array.isArray(finalAlerts) && finalAlerts.length > 0 ? finalAlerts : [],
      status: safeStatus,
      suppressionInfo: filteredAlerts.suppressionInfo || {
        isSuppressed: false,
        reason: '',
        suppressedCount: 0,
      },
      alertsInitializing: dataCoverageDays < 7,
      decision,
    };
  }

  /**
   * Store confidence snapshot for history visualization (once per day max)
   */
  private storeConfidenceSnapshot(
    businessType: BusinessSetup['businessType'],
    lastUpdateAt: Date | null,
    alerts: ExtendedAlertContract[]
  ): void {
    if (!lastUpdateAt) return;

    const history = this.getConfidenceHistory();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if we already have a snapshot for today
    const todaySnapshot = history.find(s => {
      const snapshotDate = new Date(s.date);
      snapshotDate.setHours(0, 0, 0, 0);
      return snapshotDate.getTime() === today.getTime();
    });

    if (todaySnapshot) {
      return; // Already stored today
    }

    // Calculate average adjusted confidence from alerts (excluding freshness warnings)
    const businessAlerts = alerts.filter(a => !a.id?.includes('freshness-warning'));
    const avgConfidence = businessAlerts.length > 0
      ? businessAlerts.reduce((sum, a) => sum + (a.confidenceAdjusted ?? a.confidence ?? 0), 0) / businessAlerts.length
      : 1.0;

    const dataAgeMs = today.getTime() - lastUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));

    const snapshot: ConfidenceSnapshot = {
      date: today,
      confidenceAdjusted: avgConfidence,
      dataAgeDays,
    };

    // Keep only last 30 days
    const updatedHistory = [snapshot, ...history]
      .filter(s => {
        const snapshotDate = new Date(s.date);
        const daysDiff = (today.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    localStorage.setItem(this.confidenceHistoryKey, JSON.stringify(updatedHistory));
  }

  /**
   * Get confidence history for visualization
   */
  getConfidenceHistory(): ConfidenceSnapshot[] {
    try {
      const stored = localStorage.getItem(this.confidenceHistoryKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return parsed.map((s: any) => ({
        date: new Date(s.date),
        confidenceAdjusted: s.confidenceAdjusted,
        dataAgeDays: s.dataAgeDays,
      }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Filter alerts based on confidence threshold
   * Suppress Critical/Warning alerts when confidence < 50%
   */
  private filterAlertsByConfidence(
    alerts: ExtendedAlertContract[]
  ): { filtered: ExtendedAlertContract[]; suppressionInfo: AlertSuppressionInfo } {
    const suppressed: ExtendedAlertContract[] = [];
    const allowed: ExtendedAlertContract[] = [];

    alerts.forEach(alert => {
      const confidence = alert.confidenceAdjusted ?? alert.confidence ?? 1.0;
      const isInformational = alert.severity === 'informational';
      const isFreshnessWarning = alert.id?.includes('freshness-warning');

      // Always allow informational alerts and freshness warnings (they're system messages, not business alerts)
      if (isInformational || isFreshnessWarning) {
        allowed.push(alert);
        return;
      }

      // Suppress Critical/Warning if confidence < 50%
      // This prevents misleading alerts when data quality is too low
      if (confidence < 0.5) {
        suppressed.push(alert);
      } else {
        allowed.push(alert);
      }
    });

    return {
      filtered: allowed,
      suppressionInfo: {
        isSuppressed: suppressed.length > 0,
        reason: suppressed.length > 0
          ? suppressed.length === 1
            ? '1 alert suppressed due to low data confidence (< 50%)'
            : `${suppressed.length} alerts suppressed due to low data confidence (< 50%)`
          : '',
        suppressedCount: suppressed.length,
      },
    };
  }

  /**
   * Detect trend-based early warning alerts
   */
  private detectTrendAlerts(branchId?: string | null, businessGroupId?: string): AlertContract[] {
    const signals = operationalSignalsService.getAllSignals(branchId, businessGroupId);
    if (signals.length < 3) return []; // Need at least 3 evaluations for trends

    const alerts: AlertContract[] = [];
    const recentSignals = signals.slice(0, 3); // Last 3 evaluations
    const today = new Date();

    // Check for cash runway declining for 3 consecutive evaluations
    const cashDeclining = recentSignals.every((s, i) => {
      if (i === 0) return true;
      return s.cashBalance < recentSignals[i - 1].cashBalance;
    });
    if (cashDeclining) {
      const declinePercent = ((recentSignals[0].cashBalance - recentSignals[2].cashBalance) / recentSignals[2].cashBalance) * 100;
      const severity = declinePercent > 10 ? 'critical' as const : 'warning' as const;
      alerts.push({
        id: `trend-cash-declining-${Date.now()}`,
        timestamp: today,
        type: 'risk',
        severity,
        domain: 'cash',
        timeHorizon: 'near-term',
        relevanceWindow: {
          start: today,
          end: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        message: `Cash balance has declined for 3 consecutive evaluations (${Math.round(declinePercent)}% decrease). This indicates a deteriorating cash position compared to your baseline.`,
        confidence: 0.7,
        contributingFactors: [
          { factor: 'Consecutive cash balance decline', weight: Math.min(1.0, Math.abs(declinePercent) / 20) },
        ],
        conditions: [
          `Cash balance decreased by ${Math.round(declinePercent)}% over 3 evaluations`,
          `Current balance: ${recentSignals[0].cashBalance}`,
          `Baseline balance: ${recentSignals[2].cashBalance}`,
        ],
      });
    }

    // Check for occupancy/customer volume dropping faster than normal
    const demandDeclining = recentSignals.every((s, i) => {
      if (i === 0) return true;
      const prevRevenue = recentSignals[i - 1].revenue7Days;
      const currRevenue = s.revenue7Days;
      return currRevenue < prevRevenue;
    });
    if (demandDeclining && recentSignals[2].revenue7Days > 0) {
      const declinePercent = ((recentSignals[0].revenue7Days - recentSignals[2].revenue7Days) / recentSignals[2].revenue7Days) * 100;
      const severity = declinePercent > 15 ? 'warning' as const : 'informational' as const;
      alerts.push({
        id: `trend-demand-declining-${Date.now()}`,
        timestamp: today,
        type: 'risk',
        severity,
        domain: 'risk',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: today,
          end: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000), // 60 days
        },
        message: `Customer demand has declined for 3 consecutive evaluations (${Math.round(declinePercent)}% decrease). This is faster than typical seasonal variation.`,
        confidence: 0.65,
        contributingFactors: [
          { factor: 'Revenue decline trend', weight: Math.min(1.0, Math.abs(declinePercent) / 30) },
        ],
        conditions: [
          `7-day revenue decreased by ${Math.round(declinePercent)}% over 3 evaluations`,
          `Current 7-day revenue: ${recentSignals[0].revenue7Days}`,
          `Baseline 7-day revenue: ${recentSignals[2].revenue7Days}`,
        ],
      });
    }

    // Check for costs rising while revenue flat
    const costsRising = recentSignals.every((s, i) => {
      if (i === 0) return true;
      return s.costs7Days > recentSignals[i - 1].costs7Days;
    });
    const revenueFlat = recentSignals.every((s, i) => {
      if (i === 0) return true;
      const change = Math.abs(s.revenue7Days - recentSignals[i - 1].revenue7Days) / (recentSignals[i - 1].revenue7Days || 1);
      return change < 0.02; // Less than 2% change
    });
    if (costsRising && revenueFlat) {
      const costIncreasePercent = ((recentSignals[0].costs7Days - recentSignals[2].costs7Days) / (recentSignals[2].costs7Days || 1)) * 100;
      alerts.push({
        id: `trend-costs-rising-${Date.now()}`,
        timestamp: today,
        type: 'risk',
        severity: 'warning',
        domain: 'cash',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: today,
          end: new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000), // 45 days
        },
        message: 'Operating costs are rising while revenue remains flat. This indicates cost pressure that may affect cash position.',
        confidence: 0.7,
        contributingFactors: [
          { factor: 'Cost increase without revenue growth', weight: Math.min(1.0, Math.abs(costIncreasePercent) / 20) },
        ],
        conditions: [
          `7-day costs increased by ${Math.round(costIncreasePercent)}% over 3 evaluations`,
          `Revenue remained flat (less than 2% change)`,
          `Current 7-day costs: ${recentSignals[0].costs7Days}`,
        ],
      });
    }

    // Check for staff count increased without demand increase
    const staffIncreased = recentSignals[0].staffCount > recentSignals[2].staffCount;
    const demandNotIncreased = recentSignals[0].revenue7Days <= recentSignals[2].revenue7Days * 1.05; // Less than 5% increase
    if (staffIncreased && demandNotIncreased && recentSignals[2].staffCount > 0) {
      alerts.push({
        id: `trend-staff-mismatch-${Date.now()}`,
        timestamp: today,
        type: 'risk',
        severity: 'informational',
        domain: 'labor',
        timeHorizon: 'medium-term',
        relevanceWindow: {
          start: today,
          end: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000), // 60 days
        },
        message: 'Staff count has increased without a corresponding increase in customer demand. This may increase fixed costs without revenue growth.',
        confidence: 0.6,
        contributingFactors: [
          { factor: 'Staff increase without demand growth', weight: 0.5 },
        ],
        conditions: [
          `Staff count increased from ${recentSignals[2].staffCount} to ${recentSignals[0].staffCount}`,
          `Revenue did not increase proportionally (less than 5% increase)`,
        ],
      });
    }

    return alerts;
  }

  /**
   * Update and return monitoring status
   */
  private updateStatus(
    lastOperationalUpdateAt: Date | null,
    branchId?: string | null,
    businessGroupId?: string
  ): MonitoringStatus {
    const signals = operationalSignalsService.getAllSignals(branchId, businessGroupId);
    const dataCoverage = operationalSignalsService.getDataCoverage(branchId, businessGroupId);
    
    // Determine tracking state based on data age
    let trackingState: 'active' | 'degraded' | 'stale' = 'active';
    let confidenceImpact: 'none' | 'reduced' = 'none';
    
    if (lastOperationalUpdateAt) {
      const now = new Date();
      const dataAgeMs = now.getTime() - lastOperationalUpdateAt.getTime();
      const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
      
      if (dataAgeDays > 30) {
        trackingState = 'stale';
        confidenceImpact = 'reduced';
      } else if (dataAgeDays > 7) {
        trackingState = 'degraded';
        confidenceImpact = 'reduced';
      }
    }
    
    const status: MonitoringStatus = {
      isActive: signals.length > 0,
      lastEvaluated: signals.length > 0 ? new Date(signals[0].timestamp) : null,
      dataCoverageDays: dataCoverage,
      evaluationCount: signals.length,
      lastOperationalUpdateAt,
      trackingState,
      confidenceImpact,
      lastReminderSentAt: this.getReminderState().lastReminderSentAt,
    };

    // Save status
    localStorage.setItem(this.statusKey, JSON.stringify(status));

    return status;
  }

  /**
   * Get current monitoring status
   */
  getStatus(branchId?: string | null, businessGroupId?: string): MonitoringStatus {
    try {
      const stored = localStorage.getItem(this.statusKey);
      const latestSignal = operationalSignalsService.getLatestSignal(branchId, businessGroupId);
      const lastUpdateAt = latestSignal?.timestamp || null;
      
      if (!stored) {
        return {
          isActive: false,
          lastEvaluated: null,
          dataCoverageDays: 0,
          evaluationCount: 0,
          lastOperationalUpdateAt: lastUpdateAt,
          trackingState: lastUpdateAt ? 'active' : 'stale',
          confidenceImpact: 'none',
          lastReminderSentAt: null,
        };
      }
      const parsed = JSON.parse(stored);
      
      // Recalculate tracking state if needed
      let trackingState: 'active' | 'degraded' | 'stale' = parsed.trackingState || 'active';
      let confidenceImpact: 'none' | 'reduced' = parsed.confidenceImpact || 'none';
      
      if (lastUpdateAt) {
        const now = new Date();
        const dataAgeMs = now.getTime() - lastUpdateAt.getTime();
        const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
        
        if (dataAgeDays > 30) {
          trackingState = 'stale';
          confidenceImpact = 'reduced';
        } else if (dataAgeDays > 7) {
          trackingState = 'degraded';
          confidenceImpact = 'reduced';
        } else {
          trackingState = 'active';
          confidenceImpact = 'none';
        }
      }
      
      return {
        ...parsed,
        lastEvaluated: parsed.lastEvaluated ? new Date(parsed.lastEvaluated) : null,
        lastOperationalUpdateAt: parsed.lastOperationalUpdateAt ? new Date(parsed.lastOperationalUpdateAt) : lastUpdateAt,
        trackingState,
        confidenceImpact,
        lastReminderSentAt: parsed.lastReminderSentAt ? new Date(parsed.lastReminderSentAt) : null,
      };
    } catch (e) {
      console.error('Failed to load monitoring status:', e);
      const latestSignal = operationalSignalsService.getLatestSignal(branchId, businessGroupId);
      return {
        isActive: false,
        lastEvaluated: null,
        dataCoverageDays: 0,
        evaluationCount: 0,
        lastOperationalUpdateAt: latestSignal?.timestamp || null,
        trackingState: 'stale',
        confidenceImpact: 'none',
        lastReminderSentAt: null,
      };
    }
  }
}

export const monitoringService = new MonitoringService();
