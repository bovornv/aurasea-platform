// Scenario calculation utilities
export interface ScenarioInputs {
  demand: number; // percentage change
  staffCount: number; // absolute change
  pricing: number; // percentage change
}

export interface ScenarioOutputs {
  riskChange: 'increases' | 'decreases' | 'neutral';
  cashChange: 'improves' | 'declines' | 'neutral';
  forecastChange: 'increases' | 'decreases' | 'neutral';
}

/**
 * Calculate directional impacts based on scenario inputs
 * This is a placeholder - real logic would come from SME OS
 */
export function calculateScenarioImpact(inputs: ScenarioInputs): ScenarioOutputs {
  let riskChange: 'increases' | 'decreases' | 'neutral' = 'neutral';
  let cashChange: 'improves' | 'declines' | 'neutral' = 'neutral';
  let forecastChange: 'increases' | 'decreases' | 'neutral' = 'neutral';

  // Demand impact
  if (inputs.demand > 0) {
    riskChange = 'decreases';
    cashChange = 'improves';
    forecastChange = 'increases';
  } else if (inputs.demand < 0) {
    riskChange = 'increases';
    cashChange = 'declines';
    forecastChange = 'decreases';
  }

  // Staff count impact (costs)
  if (inputs.staffCount > 0) {
    // More staff = higher costs = potential cash decline
    if (cashChange === 'improves') {
      cashChange = 'neutral';
    } else if (cashChange === 'neutral' && inputs.demand <= 0) {
      cashChange = 'declines';
    }
  } else if (inputs.staffCount < 0) {
    // Less staff = lower costs = potential cash improvement
    if (cashChange === 'declines') {
      cashChange = 'neutral';
    } else if (cashChange === 'neutral' && inputs.demand >= 0) {
      cashChange = 'improves';
    }
  }

  // Pricing impact
  if (inputs.pricing > 0) {
    // Higher prices = better cash if demand holds
    if (cashChange === 'neutral' || cashChange === 'declines') {
      cashChange = inputs.demand >= -5 ? 'improves' : cashChange;
    }
    if (forecastChange === 'neutral') {
      forecastChange = 'increases';
    }
  } else if (inputs.pricing < 0) {
    // Lower prices = worse cash unless demand increases significantly
    if (cashChange === 'neutral' || cashChange === 'improves') {
      cashChange = inputs.demand < 5 ? 'declines' : cashChange;
    }
  }

  return { riskChange, cashChange, forecastChange };
}
