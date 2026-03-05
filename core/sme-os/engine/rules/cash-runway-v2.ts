import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

interface CashPosition {
  date: Date;
  balance: number;
  daysOfCoverage: number;
}

/**
 * Cash Runway Alert Rule V2
 * Detects cash runway risk based on projected cash positions
 * 
 * V2 Changes:
 * - Supports Thai SME threshold calibration
 * - All other logic remains identical to V1
 * 
 * This V2 version maintains all logic from V1 but adds configurable thresholds
 * for Thai SME business context. Original thresholds are used as defaults.
 */
export class CashRunwayRuleV2 {
  evaluate(input: InputContract, operationalSignals?: Array<{
    timestamp: Date;
    dailyRevenue?: number;
    dailyExpenses?: number;
  }>): AlertContract | null {
    // PART 2: Add explicit data length guard (minimum 7 days)
    if (!operationalSignals || operationalSignals.length < 7) {
      return null;
    }
    
    if (!input.financial?.currentBalance || !input.financial?.cashFlows?.length) {
      return null;
    }

    const currentBalance = input.financial.currentBalance;
    const cashFlows = input.financial.cashFlows;
    const today = new Date();
    
    // Ensure timePeriod exists
    const timePeriod = input.timePeriod || {
      start: today,
      end: new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000),
      granularity: 'day' as const
    };
    
    // V2: Determine business type and load thresholds
    const businessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let criticalThreshold: number;
    let warningThreshold: number;
    let informationalThreshold: number;
    
    if (useThaiSME && businessType === 'accommodation') {
      const thresholds = getThresholds('accommodation') as { cashRunwayCriticalDays?: number; cashRunwayWarningDays?: number };
      criticalThreshold = thresholds.cashRunwayCriticalDays ?? 20;
      warningThreshold = thresholds.cashRunwayWarningDays ?? 45;
      informationalThreshold = 60;
    } else {
      // Use default thresholds
      criticalThreshold = 7;
      warningThreshold = 30;
      informationalThreshold = 60;
    }
    
    // Calculate projected balance over time
    const positions: CashPosition[] = [];
    let runningBalance = currentBalance;
    
    // Sort cash flows by date and ensure all have required fields
    const sortedFlows = [...cashFlows]
      .map(flow => ({
        ...flow,
        category: flow.category || 'unknown'
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Calculate positions for next 90 days
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      
      // Apply flows for this date
      sortedFlows.forEach(flow => {
        if (flow.date.toDateString() === date.toDateString()) {
          runningBalance += flow.direction === 'inflow' ? flow.amount : -flow.amount;
        }
      });
      
      // Calculate average daily burn rate from historical outflows
      const historicalOutflows = sortedFlows.filter(
        f => f.direction === 'outflow' && f.date < today
      );
      const avgDailyBurn = historicalOutflows.length > 0
        ? historicalOutflows.reduce((sum, f) => sum + f.amount, 0) / 30
        : Math.abs(runningBalance) / 90;
      
      // PART 2: Ensure division guard for avgDailyBurn
      if (!avgDailyBurn || avgDailyBurn <= 0) {
        positions.push({
          date,
          balance: runningBalance,
          daysOfCoverage: 999
        });
        continue;
      }
      
      const daysOfCoverage = runningBalance / avgDailyBurn;
      
      // PART 3: Explicit NaN/Infinity protection
      if (isNaN(daysOfCoverage) || !isFinite(daysOfCoverage)) {
        positions.push({
          date,
          balance: runningBalance,
          daysOfCoverage: 999
        });
        continue;
      }
      
      positions.push({
        date,
        balance: runningBalance,
        daysOfCoverage: Math.max(0, daysOfCoverage)
      });
    }
    
    // Find critical point
    const balances = positions.map(p => p.balance).filter(b => isFinite(b) && !isNaN(b));
    const coverages = positions.map(p => p.daysOfCoverage).filter(c => isFinite(c) && !isNaN(c));
    
    if (balances.length === 0 || coverages.length === 0) {
      return null;
    }
    
    const lowestBalance = Math.min(...balances);
    const lowestCoverage = Math.min(...coverages);
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(lowestBalance) || !isFinite(lowestBalance) || 
        isNaN(lowestCoverage) || !isFinite(lowestCoverage)) {
      return null;
    }
    const criticalPosition = positions.find(p => p.balance === lowestBalance);
    const daysToCritical = criticalPosition 
      ? Math.ceil((criticalPosition.date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      : 999;
    
    // PART 3: Explicit NaN/Infinity protection for daysToCritical
    if (isNaN(daysToCritical) || !isFinite(daysToCritical)) {
      return null;
    }
    
    // Determine severity using resolved thresholds
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (lowestBalance < 0 || (lowestCoverage < criticalThreshold && daysToCritical <= criticalThreshold)) {
      severity = 'critical';
    } else if (lowestCoverage < warningThreshold && daysToCritical <= warningThreshold) {
      severity = 'warning';
    } else if (lowestCoverage < informationalThreshold) {
      severity = 'informational';
    } else {
      // Healthy position - still return informational alert
      severity = 'informational';
    }
    
    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'long-term';
    if (daysToCritical <= criticalThreshold) {
      timeHorizon = 'immediate';
    } else if (daysToCritical <= warningThreshold) {
      timeHorizon = 'near-term';
    } else if (daysToCritical <= 90) {
      timeHorizon = 'medium-term';
    }
    
    // Generate message
    let message = '';
    const timePhrase = daysToCritical === 0 
      ? 'immediately' 
      : daysToCritical === 1 
        ? 'within 1 day' 
        : `within ${daysToCritical} days`;
    
    if (lowestBalance < 0) {
      message = `Projected cash balance will fall below critical threshold ${timePhrase} based on current cash flow patterns`;
    } else if (lowestCoverage < warningThreshold) {
      message = `Cash coverage drops below ${warningThreshold} days ${timePhrase}`;
    } else if (lowestCoverage < informationalThreshold) {
      message = `Cash coverage drops below ${informationalThreshold} days ${timePhrase}`;
    } else {
      message = `Cash position remains healthy with coverage above ${informationalThreshold} days`;
    }
    
    // Calculate contributing factors
    const contributingFactors = [];
    const historicalOutflows = sortedFlows.filter(f => f.direction === 'outflow' && f.date < today);
    const historicalInflows = sortedFlows.filter(f => f.direction === 'inflow' && f.date < today);
    
    // PART 2: Safe division guard
    const avgWeeklyOutflow = historicalOutflows.length > 0 
      ? historicalOutflows.reduce((sum, f) => sum + f.amount, 0) / 4 
      : 0;
    const avgWeeklyInflow = historicalInflows.length > 0
      ? historicalInflows.reduce((sum, f) => sum + f.amount, 0) / 4
      : 0;
    
    // PART 3: Explicit NaN/Infinity protection
    let safeAvgWeeklyOutflow = avgWeeklyOutflow;
    let safeAvgWeeklyInflow = avgWeeklyInflow;
    if (isNaN(avgWeeklyOutflow) || !isFinite(avgWeeklyOutflow)) {
      safeAvgWeeklyOutflow = 0;
    }
    if (isNaN(avgWeeklyInflow) || !isFinite(avgWeeklyInflow)) {
      safeAvgWeeklyInflow = 0;
    }
    
    if (safeAvgWeeklyOutflow > safeAvgWeeklyInflow && safeAvgWeeklyOutflow > 0) {
      const weight = Math.min(1.0, (safeAvgWeeklyOutflow - safeAvgWeeklyInflow) / safeAvgWeeklyOutflow);
      // PART 3: Guard against NaN in weight calculation
      if (!isNaN(weight) && isFinite(weight)) {
        contributingFactors.push({
          factor: 'Negative cash flow trend',
          weight
        });
      }
    }
    
    const upcomingOutflows = sortedFlows
      .filter(f => f.direction === 'outflow' && f.date > today)
      .reduce((sum, f) => sum + f.amount, 0);
    
    // PART 3: Guard against NaN in upcomingOutflows
    if (!isNaN(upcomingOutflows) && isFinite(upcomingOutflows) && currentBalance > 0) {
      if (upcomingOutflows > currentBalance * 0.3) {
        const weight = Math.min(1.0, upcomingOutflows / currentBalance);
        // PART 3: Guard against NaN in weight
        if (!isNaN(weight) && isFinite(weight)) {
          contributingFactors.push({
            factor: 'Large scheduled outflows',
            weight
          });
        }
      }
    }
    
    // Create alert
    const alert: AlertContract & { positions?: CashPosition[] } = {
      id: `cash-runway-v2-${Date.now()}`,
      timestamp: today,
      type: 'risk',
      severity,
      domain: 'cash',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence: 0.75,
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Current cash position analysis', weight: 1.0 }
      ],
      conditions: [
        `Current balance: ${isFinite(currentBalance) ? currentBalance.toFixed(2) : '0.00'}`,
        `Projected lowest balance: ${isFinite(lowestBalance) ? lowestBalance.toFixed(2) : '0.00'}`,
        `Days to critical point: ${isFinite(daysToCritical) ? daysToCritical : 999}`,
        `Lowest coverage: ${isFinite(lowestCoverage) ? Math.round(lowestCoverage) : 0} days`
      ],
      positions
    };
    
    return alert;
  }
}
