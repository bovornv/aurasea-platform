import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';

interface CashPosition {
  date: Date;
  balance: number;
  daysOfCoverage: number;
}

export class CashRunwayRule {
  evaluate(input: InputContract): AlertContract | null {
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
      
      const daysOfCoverage = avgDailyBurn > 0 ? runningBalance / avgDailyBurn : 999;
      
      positions.push({
        date,
        balance: runningBalance,
        daysOfCoverage: Math.max(0, daysOfCoverage)
      });
    }
    
    // Find critical point
    const lowestBalance = Math.min(...positions.map(p => p.balance));
    const lowestCoverage = Math.min(...positions.map(p => p.daysOfCoverage));
    const criticalPosition = positions.find(p => p.balance === lowestBalance);
    const daysToCritical = criticalPosition 
      ? Math.ceil((criticalPosition.date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      : 999;
    
    // Determine severity
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (lowestBalance < 0 || (lowestCoverage < 7 && daysToCritical <= 7)) {
      severity = 'critical';
    } else if (lowestCoverage < 30 && daysToCritical <= 30) {
      severity = 'warning';
    } else if (lowestCoverage < 60) {
      severity = 'informational';
    } else {
      // Healthy position - still return informational alert
      severity = 'informational';
    }
    
    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'long-term';
    if (daysToCritical <= 7) {
      timeHorizon = 'immediate';
    } else if (daysToCritical <= 30) {
      timeHorizon = 'near-term';
    } else if (daysToCritical <= 90) {
      timeHorizon = 'medium-term';
    }
    
    // Generate message
    let message = '';
    if (lowestBalance < 0) {
      message = `Projected cash balance will fall below critical threshold within ${daysToCritical} days based on current cash flow patterns`;
    } else if (lowestCoverage < 30) {
      message = `Cash coverage drops below 30 days within ${daysToCritical} days`;
    } else if (lowestCoverage < 60) {
      message = `Cash coverage drops below 60 days within ${daysToCritical} days`;
    } else {
      message = `Cash position remains healthy with coverage above 60 days`;
    }
    
    // Calculate contributing factors
    const contributingFactors = [];
    const avgWeeklyOutflow = sortedFlows
      .filter(f => f.direction === 'outflow' && f.date < today)
      .reduce((sum, f) => sum + f.amount, 0) / 4;
    const avgWeeklyInflow = sortedFlows
      .filter(f => f.direction === 'inflow' && f.date < today)
      .reduce((sum, f) => sum + f.amount, 0) / 4;
    
    if (avgWeeklyOutflow > avgWeeklyInflow) {
      contributingFactors.push({
        factor: 'Negative cash flow trend',
        weight: Math.min(1.0, (avgWeeklyOutflow - avgWeeklyInflow) / avgWeeklyOutflow)
      });
    }
    
    const upcomingOutflows = sortedFlows
      .filter(f => f.direction === 'outflow' && f.date > today)
      .reduce((sum, f) => sum + f.amount, 0);
    
    if (upcomingOutflows > currentBalance * 0.3) {
      contributingFactors.push({
        factor: 'Large scheduled outflows',
        weight: Math.min(1.0, upcomingOutflows / currentBalance)
      });
    }
    
    // Create alert
    const alert: AlertContract & { positions?: CashPosition[] } = {
      id: `cash-runway-${Date.now()}`,
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
        `Current balance: ${currentBalance}`,
        `Projected lowest balance: ${lowestBalance}`,
        `Days to critical point: ${daysToCritical}`,
        `Lowest coverage: ${Math.round(lowestCoverage)} days`
      ],
      positions
    };
    
    return alert;
  }
}
