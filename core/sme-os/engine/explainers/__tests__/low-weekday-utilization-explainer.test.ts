import { LowWeekdayUtilizationExplainer } from '../low-weekday-utilization-explainer';
import { AlertContract } from '../../../contracts/alerts';

describe('LowWeekdayUtilizationExplainer', () => {
  let explainer: LowWeekdayUtilizationExplainer;

  beforeEach(() => {
    explainer = new LowWeekdayUtilizationExplainer();
  });

  describe('no alert scenarios', () => {
    it('should handle null alert gracefully', () => {
      const result = explainer.explain(null);
      
      expect(result.primaryFactor).toBe('No weekday utilization issues detected or insufficient data');
      expect(result.contributingFactors).toEqual([]);
      expect(result.utilizationAnalysis.utilizationRate).toBe('Insufficient data to calculate utilization rate');
      expect(result.recommendations.immediate).toContain('Ensure adequate weekday revenue data collection');
    });

    it('should handle alert without weekday data', () => {
      const mockAlert = createMockAlert('warning');
      const result = explainer.explain(mockAlert);
      
      expect(result.primaryFactor).toContain('Significant weekday underutilization');
      expect(result.utilizationAnalysis.utilizationRate).toContain('0.0% utilization rate');
    });
  });

  describe('critical severity explanations', () => {
    it('should provide critical severity explanation', () => {
      const mockAlert = createMockAlert('critical');
      const weekdayData = generateWeekdayData(25); // 25% utilization
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.primaryFactor).toContain('Critical weekday underutilization');
      expect(result.primaryFactor).toContain('25.0%');
      expect(result.contributingFactors).toContain('Extremely low utilization indicates fundamental weekday demand challenges');
      expect(result.recommendations.immediate).toContain('Launch emergency weekday customer acquisition campaign');
    });

    it('should identify high variability in critical scenarios', () => {
      const mockAlert = createMockAlert('critical');
      const weekdayData = generateVariableWeekdayData();
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.contributingFactors.some(f => 
        f.includes('High revenue variability')
      )).toBe(true);
      expect(result.utilizationAnalysis.consistencyPattern).toContain('High variability');
    });
  });

  describe('warning severity explanations', () => {
    it('should provide warning severity explanation', () => {
      const mockAlert = createMockAlert('warning');
      const weekdayData = generateWeekdayData(40); // 40% utilization
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.primaryFactor).toContain('Significant weekday underutilization');
      expect(result.primaryFactor).toContain('40.0%');
      expect(result.contributingFactors).toContain('Low utilization suggests significant weekday market opportunity');
      expect(result.recommendations.immediate).toContain('Implement targeted weekday marketing campaigns');
    });
  });

  describe('informational severity explanations', () => {
    it('should provide informational severity explanation', () => {
      const mockAlert = createMockAlert('informational');
      const weekdayData = generateWeekdayData(60); // 60% utilization
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.primaryFactor).toContain('Moderate weekday underutilization');
      expect(result.primaryFactor).toContain('60.0%');
      expect(result.contributingFactors).toContain('Moderate utilization indicates room for weekday optimization');
      expect(result.recommendations.immediate).toContain('Monitor weekday performance trends closely');
    });
  });

  describe('utilization analysis', () => {
    it('should correctly analyze utilization metrics', () => {
      const mockAlert = createMockAlert('warning');
      const weekdayData = generateWeekdayData(35); // 35% utilization
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.utilizationAnalysis.utilizationRate).toContain('35.0% utilization rate');
      expect(result.utilizationAnalysis.utilizationRate).toContain('low weekday performance');
      expect(result.utilizationAnalysis.revenueGap).toContain('daily revenue gap');
      expect(result.utilizationAnalysis.revenueGap).toContain('$650');
    });

    it('should handle consistent performance patterns', () => {
      const mockAlert = createMockAlert('informational');
      const weekdayData = generateConsistentWeekdayData();
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.contributingFactors.some(f => 
        f.includes('Consistent performance patterns')
      )).toBe(true);
      expect(result.utilizationAnalysis.consistencyPattern).toContain('Low variability');
    });
  });

  describe('contributing factors analysis', () => {
    it('should identify large revenue gap', () => {
      const mockAlert = createMockAlert('critical');
      const weekdayData = generateWeekdayData(20); // 20% utilization, large gap
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.contributingFactors.some(f => 
        f.includes('Large revenue gap between peak and average')
      )).toBe(true);
    });

    it('should identify peak performance potential', () => {
      const mockAlert = createMockAlert('warning');
      const weekdayData = generateWeekdayData(45);
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.contributingFactors.some(f => 
        f.includes('Peak weekday performance of $1000 demonstrates achievable revenue potential')
      )).toBe(true);
    });
  });

  describe('recommendation generation', () => {
    it('should provide comprehensive critical recommendations', () => {
      const mockAlert = createMockAlert('critical');
      const weekdayData = generateWeekdayData(15);
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.recommendations.immediate).toHaveLength(3);
      expect(result.recommendations.shortTerm).toHaveLength(3);
      expect(result.recommendations.longTerm).toHaveLength(3);
      
      expect(result.recommendations.immediate).toContain('Launch emergency weekday customer acquisition campaign');
      expect(result.recommendations.shortTerm).toContain('Develop comprehensive weekday menu and pricing strategy');
      expect(result.recommendations.longTerm).toContain('Build sustainable weekday customer base through loyalty programs');
    });

    it('should provide appropriate warning recommendations', () => {
      const mockAlert = createMockAlert('warning');
      const weekdayData = generateWeekdayData(35);
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.recommendations.immediate).toContain('Implement targeted weekday marketing campaigns');
      expect(result.recommendations.shortTerm).toContain('Develop partnerships with local businesses for weekday traffic');
      expect(result.recommendations.longTerm).toContain('Build consistent weekday customer base and habits');
    });

    it('should provide measured informational recommendations', () => {
      const mockAlert = createMockAlert('informational');
      const weekdayData = generateWeekdayData(55);
      const result = explainer.explain(mockAlert, weekdayData);
      
      expect(result.recommendations.immediate).toContain('Monitor weekday performance trends closely');
      expect(result.recommendations.shortTerm).toContain('Analyze successful peak day strategies for weekday application');
      expect(result.recommendations.longTerm).toContain('Maintain consistent weekday performance improvement');
    });
  });

  // Helper functions
  function createMockAlert(severity: 'critical' | 'warning' | 'informational'): AlertContract {
    return {
      id: 'test-alert',
      timestamp: new Date(),
      type: 'opportunity',
      severity,
      domain: 'risk',
      timeHorizon: 'near-term',
      relevanceWindow: {
        start: new Date(),
        end: new Date()
      },
      confidence: 0.8,
      message: 'Test message',
      conditions: [],
      contributingFactors: [],
      recommendations: []
    } as AlertContract & { recommendations: string[] };
  }

  function generateWeekdayData(utilizationPercent: number): Array<{
    timestamp: Date;
    dailyRevenue: number;
  }> {
    const data = [];
    const peakRevenue = 1000;
    const avgRevenue = (utilizationPercent / 100) * peakRevenue;
    
    // Generate 14 weekdays
    let currentDate = new Date('2024-01-01'); // Monday
    let weekdayCount = 0;
    
    while (weekdayCount < 14) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekday
        let revenue;
        if (weekdayCount === 0) {
          revenue = peakRevenue; // First day is peak
        } else {
          revenue = avgRevenue; // Others at average
        }
        
        data.push({
          timestamp: new Date(currentDate),
          dailyRevenue: revenue
        });
        weekdayCount++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return data;
  }

  function generateVariableWeekdayData(): Array<{
    timestamp: Date;
    dailyRevenue: number;
  }> {
    const data = [];
    const revenues = [1000, 200, 800, 150, 900, 100, 750, 300, 600, 250, 850, 180, 700, 120];
    
    let currentDate = new Date('2024-01-01'); // Monday
    let weekdayCount = 0;
    
    while (weekdayCount < 14) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekday
        data.push({
          timestamp: new Date(currentDate),
          dailyRevenue: revenues[weekdayCount]
        });
        weekdayCount++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return data;
  }

  function generateConsistentWeekdayData(): Array<{
    timestamp: Date;
    dailyRevenue: number;
  }> {
    const data = [];
    const baseRevenue = 500;
    
    let currentDate = new Date('2024-01-01'); // Monday
    let weekdayCount = 0;
    
    while (weekdayCount < 14) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekday
        // Very small variation for consistency
        const revenue = baseRevenue + (Math.random() - 0.5) * 20;
        data.push({
          timestamp: new Date(currentDate),
          dailyRevenue: revenue
        });
        weekdayCount++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return data;
  }
});
