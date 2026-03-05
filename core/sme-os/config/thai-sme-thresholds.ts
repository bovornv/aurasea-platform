/**
 * Thai SME Threshold Calibration Configuration
 * 
 * Calibrated thresholds for Thai SME business context:
 * - Thinner margins (10-25% typical)
 * - Lower cash reserves (1-3 months typical)
 * - Higher volatility (tourism-dependent)
 * - Strong seasonality (Nov-Feb peak, May-Oct low)
 * 
 * Usage:
 * - Set THAI_SME_MODE=true environment variable
 * - Or pass businessContext: { region: 'thailand', businessSize: 'sme' } to alert rules
 */

export interface ThaiSMEThresholds {
  demandDrop: {
    critical: { sevenDay: number; thirtyDay: number; occupancy: number; customerVolume: number };
    warning: { sevenDay: number; thirtyDay: number; occupancy: number; customerVolume: number };
    trigger: { sevenDay: number; thirtyDay: number; occupancy: number; customerVolume: number };
  };
  costPressure: {
    critical: { costRevenueGap: number; staffChange: number; revenueChange: number };
    warning: { costRevenueGap: number; staffChange: number; revenueChange: number };
    trigger: { costRevenueGap: number; staffChange: number; revenueChange: number };
  };
  marginCompression: {
    critical: { sevenDay: number; thirtyDay: number };
    warning: { sevenDay: number; thirtyDay: number };
    trigger: { sevenDay: number; thirtyDay: number };
  };
  seasonalMismatch: {
    critical: number;
    warning: number;
    trigger: { peakSeason: number; lowSeason: number; other: number };
  };
  dataConfidenceRisk: {
    critical: { confidence: number; dataAge: { cafe: number; resort: number; default: number } };
    warning: { confidence: number; dataAge: { cafe: number; resort: number; default: number } };
  };
  weekendWeekdayImbalance: {
    critical: { occupancy: number; premiumRatio: number; weekdayAdvantage: number };
    warning: { occupancy: number; premiumRatio: number; weekdayAdvantage: number };
  };
  lowWeekdayUtilization: {
    critical: number;
    warning: number;
    informational: number;
  };
  capacityUtilization: {
    critical: { underutilized: number; overutilized: number; peakDays: number };
    warning: { underutilized: number; overutilized: number; peakDays: number };
  };
  weekendWeekdayFnbGap: {
    critical: number;
    warning: number;
    informational: number;
  };
  menuRevenueConcentration: {
    critical: number;
    warning: number;
    informational: number;
  };
  liquidityRunwayRisk: {
    critical: number;
    warning: number;
    informational: number;
    healthy: number;
  };
  revenueConcentration: {
    critical: { weekendShare: number; top5Days: number };
    warning: { weekendShare: number; top5Days: number };
  };
  cashFlowVolatility: {
    critical: number;
    warning: number;
    informational: number;
  };
  breakEvenRisk: {
    critical: number;
    warning: number;
    informational: { min: number; max: number };
  };
  seasonalityRisk: {
    critical: number;
    warning: number;
    informational: number;
  };
  cashRunway: {
    critical: number;
    warning: number;
    informational: number;
  };
}

/**
 * Thai SME Calibrated Thresholds
 * 
 * All thresholds are 10-20% more sensitive than default to account for:
 * - Thinner margins
 * - Lower cash reserves
 * - Higher volatility
 * - Strong seasonality
 */
export const THAI_SME_THRESHOLDS: ThaiSMEThresholds = {
  demandDrop: {
    critical: {
      sevenDay: -25,      // Default: -30 (more sensitive)
      thirtyDay: -30,     // Default: -35 (more sensitive)
      occupancy: -18,    // Default: -20 (more sensitive)
      customerVolume: -12, // Default: -15 (more sensitive)
    },
    warning: {
      sevenDay: -15,     // Default: -20 (more sensitive)
      thirtyDay: -20,    // Default: -25 (more sensitive)
      occupancy: -12,    // Default: -15 (more sensitive)
      customerVolume: -10, // Default: -15 (more sensitive)
    },
    trigger: {
      sevenDay: -15,     // Default: -15 (same)
      thirtyDay: -20,    // Default: -20 (same)
      occupancy: -10,    // Default: -10 (same)
      customerVolume: -15, // Default: -15 (same)
    },
  },
  
  costPressure: {
    critical: {
      costRevenueGap: 20,    // Default: 25 (more sensitive)
      staffChange: 15,       // Default: 20 (more sensitive)
      revenueChange: 0,      // Default: 0 (same)
    },
    warning: {
      costRevenueGap: 10,    // Default: 15 (more sensitive)
      staffChange: 10,       // Default: 15 (more sensitive)
      revenueChange: 5,      // Default: 5 (same)
    },
    trigger: {
      costRevenueGap: 10,    // Default: 10 (same)
      staffChange: 10,       // Default: 10 (same)
      revenueChange: 5,      // Default: 5 (same)
    },
  },
  
  marginCompression: {
    critical: {
      sevenDay: -6,      // Default: -8 (more sensitive)
      thirtyDay: -8,     // Default: -10 (more sensitive)
    },
    warning: {
      sevenDay: -3,      // Default: -5 (more sensitive)
      thirtyDay: -5,     // Default: -7 (more sensitive)
    },
    trigger: {
      sevenDay: -3,      // Default: -3 (same)
      thirtyDay: -5,     // Default: -5 (same)
    },
  },
  
  seasonalMismatch: {
    critical: 30,        // Default: 35 (more sensitive)
    warning: 20,         // Default: 25 (more sensitive)
    trigger: {
      peakSeason: -15,   // Default: -20 (more sensitive)
      lowSeason: 25,     // Default: 30 (more sensitive)
      other: 20,         // Default: 25 (more sensitive)
    },
  },
  
  dataConfidenceRisk: {
    critical: {
      confidence: 0.45,  // Default: 0.4 (more sensitive)
      dataAge: {
        cafe: 10,        // Default: 14 (more sensitive)
        resort: 21,     // Default: 30 (more sensitive)
        default: 18,    // Default: 21 (more sensitive)
      },
    },
    warning: {
      confidence: 0.55, // Default: 0.5 (more sensitive)
      dataAge: {
        cafe: 5,         // Default: 7 (more sensitive)
        resort: 10,      // Default: 14 (more sensitive)
        default: 8,      // Default: 10 (more sensitive)
      },
    },
  },
  
  weekendWeekdayImbalance: {
    critical: {
      occupancy: 85,           // Default: 90 (more sensitive)
      premiumRatio: 1.15,      // Default: 1.1 (more sensitive)
      weekdayAdvantage: 0.30,  // Default: 0.30 (same)
    },
    warning: {
      occupancy: 80,           // Default: 85 (more sensitive)
      premiumRatio: 1.25,      // Default: 1.2 (more sensitive)
      weekdayAdvantage: 0.20,  // Default: 0.20 (same)
    },
  },
  
  lowWeekdayUtilization: {
    critical: 35,        // Default: 30 (more sensitive - lower threshold means triggers earlier)
    warning: 40,        // Default: 40 (same)
    informational: 60,  // Default: 60 (same)
  },
  
  capacityUtilization: {
    critical: {
      underutilized: 45,   // Default: 40 (more sensitive)
      overutilized: 85,    // Default: 90 (more sensitive)
      peakDays: 5,         // Default: 7 (more sensitive)
    },
    warning: {
      underutilized: 55,   // Default: 50 (more sensitive)
      overutilized: 80,    // Default: 85 (more sensitive)
      peakDays: 3,         // Default: 5 (more sensitive)
    },
  },
  
  weekendWeekdayFnbGap: {
    critical: 2.5,       // Default: 2.8 (more sensitive)
    warning: 1.8,       // Default: 2.0 (more sensitive)
    informational: 1.3, // Default: 1.5 (more sensitive)
  },
  
  menuRevenueConcentration: {
    critical: 65,        // Default: 70 (more sensitive)
    warning: 50,        // Default: 55 (more sensitive)
    informational: 35,  // Default: 40 (more sensitive)
  },
  
  liquidityRunwayRisk: {
    critical: 2,        // Default: 3 (more sensitive)
    warning: 4,         // Default: 6 (more sensitive)
    informational: 8,   // Default: 12 (more sensitive)
    healthy: 8,         // Default: 12 (lower threshold)
  },
  
  revenueConcentration: {
    critical: {
      weekendShare: 65,  // Default: 70 (more sensitive)
      top5Days: 45,     // Default: 50 (more sensitive)
    },
    warning: {
      weekendShare: 55,  // Default: 60 (more sensitive)
      top5Days: 35,     // Default: 40 (more sensitive)
    },
  },
  
  cashFlowVolatility: {
    critical: 0.70,     // Default: 0.75 (more sensitive)
    warning: 0.45,      // Default: 0.5 (more sensitive)
    informational: 0.20, // Default: 0.25 (more sensitive)
  },
  
  breakEvenRisk: {
    critical: 0.95,     // Default: 0.9 (more sensitive)
    warning: 1.05,      // Default: 1.0 (more sensitive)
    informational: {
      min: 1.05,        // Default: 1.0 (more sensitive)
      max: 1.20,        // Default: 1.15 (more sensitive)
    },
  },
  
  seasonalityRisk: {
    critical: 1.8,      // Default: 2.0 (more sensitive)
    warning: 1.4,       // Default: 1.5 (more sensitive)
    informational: 1.1, // Default: 1.2 (more sensitive)
  },
  
  cashRunway: {
    critical: 10,       // Default: 7 (more sensitive - days)
    warning: 21,        // Default: 30 (more sensitive - days)
    informational: 45,  // Default: 60 (more sensitive - days)
  },
};

/**
 * Check if Thai SME mode is enabled
 */
export function isThaiSMEMode(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.THAI_SME_MODE === 'true' || 
           process.env.NEXT_PUBLIC_THAI_SME_MODE === 'true';
  }
  return false;
}

/**
 * Get threshold value based on mode
 * @param defaultThreshold Default threshold value
 * @param thaiSMEThreshold Thai SME calibrated threshold value
 * @param useThaiSME Whether to use Thai SME thresholds
 */
export function getThreshold(
  defaultThreshold: number,
  thaiSMEThreshold: number,
  useThaiSME?: boolean
): number {
  const shouldUseThaiSME = useThaiSME !== undefined ? useThaiSME : isThaiSMEMode();
  return shouldUseThaiSME ? thaiSMEThreshold : defaultThreshold;
}
