import { AlertContract } from '../../contracts/alerts';

interface DemandDropExplanation {
  primaryFactor: string;
  contributingFactors: string[];
  impactAnalysis: {
    revenueImpact: string;
    occupancyImpact: string;
    volumeImpact: string;
  };
}

interface AlertWithSignals extends AlertContract {
  signals?: {
    revenue7DaysChange: number;
    revenue30DaysChange: number;
    occupancyDrop: number;
    customerVolumeDrop: number;
  };
}

export class DemandDropExplainer {
  explain(alert: AlertContract | null, operationalSignals?: Array<{
    timestamp: Date;
    revenue7Days: number;
    revenue30Days: number;
    occupancyRate?: number;
    customerVolume?: number;
  }>): DemandDropExplanation {
    if (!alert) {
      return {
        primaryFactor: 'No demand drop detected or insufficient data',
        contributingFactors: [],
        impactAnalysis: {
          revenueImpact: 'No significant revenue impact detected',
          occupancyImpact: 'No significant occupancy impact detected',
          volumeImpact: 'No significant volume impact detected'
        }
      };
    }

    const alertWithSignals = alert as AlertWithSignals;
    
    // Extract drop percentages from conditions or calculate from signals
    let revenue7DaysChange = 0;
    let revenue30DaysChange = 0;
    let occupancyDrop = 0;
    let customerVolumeDrop = 0;

    if (alertWithSignals.signals) {
      revenue7DaysChange = alertWithSignals.signals.revenue7DaysChange;
      revenue30DaysChange = alertWithSignals.signals.revenue30DaysChange;
      occupancyDrop = alertWithSignals.signals.occupancyDrop;
      customerVolumeDrop = alertWithSignals.signals.customerVolumeDrop;
    } else if (operationalSignals && operationalSignals.length >= 2) {
      const latest = operationalSignals[0];
      const previous = operationalSignals[1];
      
      revenue7DaysChange = previous.revenue7Days > 0
        ? ((latest.revenue7Days - previous.revenue7Days) / previous.revenue7Days) * 100
        : 0;
      
      revenue30DaysChange = previous.revenue30Days > 0
        ? ((latest.revenue30Days - previous.revenue30Days) / previous.revenue30Days) * 100
        : 0;
      
      if (latest.occupancyRate !== undefined && previous.occupancyRate !== undefined) {
        occupancyDrop = ((latest.occupancyRate - previous.occupancyRate) / previous.occupancyRate) * 100;
      }
      
      if (latest.customerVolume !== undefined && previous.customerVolume !== undefined) {
        customerVolumeDrop = previous.customerVolume > 0
          ? ((latest.customerVolume - previous.customerVolume) / previous.customerVolume) * 100
          : 0;
      }
    }

    // Determine primary factor based on most significant drop
    const drops = [
      { type: 'revenue (7-day)', value: Math.abs(revenue7DaysChange) },
      { type: 'revenue (30-day)', value: Math.abs(revenue30DaysChange) },
      { type: 'occupancy', value: Math.abs(occupancyDrop) },
      { type: 'customer volume', value: Math.abs(customerVolumeDrop) }
    ].filter(drop => drop.value > 0);

    const primaryDrop = drops.reduce((max, current) => 
      current.value > max.value ? current : max, 
      { type: 'demand indicators', value: 0 }
    );

    const primaryFactor = primaryDrop.value > 0
      ? `Primary driver: ${primaryDrop.value.toFixed(1)}% decline in ${primaryDrop.type}`
      : 'Multiple demand indicators showing decline';

    // Identify contributing factors
    const contributingFactors: string[] = [];
    
    if (Math.abs(revenue7DaysChange) > 15) {
      contributingFactors.push(`Short-term revenue decline: ${Math.abs(revenue7DaysChange).toFixed(1)}%`);
    }
    
    if (Math.abs(revenue30DaysChange) > 20) {
      contributingFactors.push(`Sustained revenue decline: ${Math.abs(revenue30DaysChange).toFixed(1)}%`);
    }
    
    if (Math.abs(occupancyDrop) > 10) {
      contributingFactors.push(`Occupancy rate decline: ${Math.abs(occupancyDrop).toFixed(1)}%`);
    }
    
    if (Math.abs(customerVolumeDrop) > 15) {
      contributingFactors.push(`Customer volume decline: ${Math.abs(customerVolumeDrop).toFixed(1)}%`);
    }

    // Analyze timing patterns
    if (Math.abs(revenue7DaysChange) > Math.abs(revenue30DaysChange) * 1.5) {
      contributingFactors.push('Recent acceleration in decline trend');
    } else if (Math.abs(revenue30DaysChange) > Math.abs(revenue7DaysChange) * 1.5) {
      contributingFactors.push('Sustained decline pattern over longer period');
    }

    return {
      primaryFactor,
      contributingFactors,
      impactAnalysis: this.analyzeImpact(revenue7DaysChange, revenue30DaysChange, occupancyDrop, customerVolumeDrop)
    };
  }

  private analyzeImpact(
    revenue7DaysChange: number,
    revenue30DaysChange: number,
    occupancyDrop: number,
    customerVolumeDrop: number
  ): { revenueImpact: string; occupancyImpact: string; volumeImpact: string } {
    const revenueImpact = this.categorizeImpact(Math.max(Math.abs(revenue7DaysChange), Math.abs(revenue30DaysChange)), 'revenue');
    const occupancyImpact = this.categorizeImpact(Math.abs(occupancyDrop), 'occupancy');
    const volumeImpact = this.categorizeImpact(Math.abs(customerVolumeDrop), 'volume');

    return {
      revenueImpact,
      occupancyImpact,
      volumeImpact
    };
  }

  private categorizeImpact(percentage: number, type: string): string {
    if (percentage === 0) {
      return `No significant ${type} impact detected`;
    } else if (percentage < 10) {
      return `Minor ${type} impact: ${percentage.toFixed(1)}% decline`;
    } else if (percentage < 25) {
      return `Moderate ${type} impact: ${percentage.toFixed(1)}% decline`;
    } else {
      return `Severe ${type} impact: ${percentage.toFixed(1)}% decline`;
    }
  }
}
