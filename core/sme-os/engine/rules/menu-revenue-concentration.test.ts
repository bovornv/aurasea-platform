import { MenuRevenueConcentrationRule } from './menu-revenue-concentration';
import { InputContract } from '../../contracts/inputs';

describe('MenuRevenueConcentrationRule', () => {
  let rule: MenuRevenueConcentrationRule;
  let mockInput: InputContract;

  beforeEach(() => {
    rule = new MenuRevenueConcentrationRule();
    mockInput = {
      timePeriod: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
        granularity: 'day'
      },
      financial: {
        cashFlows: [],
        currentBalance: 10000,
        projectedBalance: 8000
      },
      operational: {
        resources: [],
        constraints: [],
        historicalPatterns: [],
        previousDecisions: []
      }
    };
  });

  describe('insufficient data scenarios', () => {
    it('should return null when no menu item data provided', () => {
      const result = rule.evaluate(mockInput);
      expect(result).toBeNull();
    });

    it('should return null when less than 14 days of data', () => {
      const menuData = generateMenuData(10, 8); // 10 days, 8 items
      const result = rule.evaluate(mockInput, menuData);
      expect(result).toBeNull();
    });

    it('should return null when less than 5 unique menu items', () => {
      const menuData = generateMenuData(14, 4); // 14 days, 4 items
      const result = rule.evaluate(mockInput, menuData);
      expect(result).toBeNull();
    });
  });

  describe('severity thresholds', () => {
    it('should return null when concentration is below 40%', () => {
      // Create data where top 3 items have low concentration
      const menuData = generateBalancedMenuData(14, 10); // 14 days, 10 items, balanced
      const result = rule.evaluate(mockInput, menuData);
      expect(result).toBeNull();
    });

    it('should generate informational alert for 40-55% concentration', () => {
      const menuData = generateConcentratedMenuData(14, 8, 45); // 45% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('informational');
      expect(result!.scope).toBe('cafe_restaurant');
      expect(result!.category).toBe('demand');
      expect(result!.type).toBe('risk');
      expect(result!.domain).toBe('risk');
      expect(result!.timeHorizon).toBe('near-term');
    });

    it('should generate warning alert for 55-70% concentration', () => {
      const menuData = generateConcentratedMenuData(14, 8, 60); // 60% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.message).toContain('Significant menu revenue concentration');
      expect(result!.message).toContain('60.0%');
    });

    it('should generate critical alert for ≥70% concentration', () => {
      const menuData = generateConcentratedMenuData(14, 8, 75); // 75% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.message).toContain('Critical menu revenue concentration risk');
      expect(result!.message).toContain('75.0%');
    });
  });

  describe('alert content validation', () => {
    it('should include correct conditions and metrics', () => {
      const menuData = generateConcentratedMenuData(14, 8, 60); // 60% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.conditions).toContain('Top 3 Menu Items Revenue Share: 60.0%');
      expect(result!.conditions).toContain('Total Menu Items Analyzed: 8');
      expect(result!.conditions).toContain('Analysis Period: 14 days');
      expect(result!.conditions.some(c => c.startsWith('Top Item:'))).toBe(true);
      expect(result!.conditions.some(c => c.startsWith('Second Item:'))).toBe(true);
      expect(result!.conditions.some(c => c.startsWith('Third Item:'))).toBe(true);
    });

    it('should include appropriate recommendations for critical severity', () => {
      const menuData = generateConcentratedMenuData(14, 6, 75); // 75% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.recommendations).toContain('Immediately diversify menu offerings to reduce dependency on top performers');
      expect(result!.recommendations).toContain('Develop promotional campaigns for underperforming menu items');
      expect(result!.recommendations).toContain('Create combo deals that include both popular and less popular items');
    });

    it('should include appropriate recommendations for warning severity', () => {
      const menuData = generateConcentratedMenuData(14, 8, 62); // 62% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.recommendations).toContain('Develop marketing strategies to promote underperforming menu items');
      expect(result!.recommendations).toContain('Consider limited-time offers to test new menu additions');
      expect(result!.recommendations).toContain('Train staff to upsell diverse menu options');
    });

    it('should include appropriate recommendations for informational severity', () => {
      const menuData = generateConcentratedMenuData(14, 10, 45); // 45% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.recommendations).toContain('Continue monitoring menu performance trends and customer preferences');
      expect(result!.recommendations).toContain('Maintain balanced promotion of all menu items');
      expect(result!.recommendations).toContain('Track performance metrics for early detection of concentration increases');
    });
  });

  describe('contributing factors', () => {
    it('should include relevant contributing factors for high concentration', () => {
      const menuData = generateConcentratedMenuData(14, 8, 70); // 70% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      const factors = result!.contributingFactors;
      expect(factors.length).toBeGreaterThan(0);
      
      // Should include concentration factor
      expect(factors.some(f => f.factor.includes('High revenue concentration'))).toBe(true);
      
      // Should include menu diversity factor
      expect(factors.some(f => f.factor.includes('menu diversity'))).toBe(true);
    });

    it('should identify dominant single item when applicable', () => {
      const menuData = generateDominantItemMenuData(14, 8); // One item dominates
      const result = rule.evaluate(mockInput, menuData);
      
      const factors = result!.contributingFactors;
      expect(factors.some(f => 
        f.factor.includes('dominates') && f.impact === 'high' && f.direction === 'negative'
      )).toBe(true);
    });
  });

  describe('confidence calculation', () => {
    it('should have base confidence of 0.65 for minimum data', () => {
      const menuData = generateConcentratedMenuData(14, 5, 50); // Minimum requirements
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.confidence).toBe(0.65);
    });

    it('should increase confidence with more data points', () => {
      const menuData = generateConcentratedMenuData(21, 5, 50); // 7 extra days
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.confidence).toBe(0.685); // 0.65 + (7 * 0.005)
    });

    it('should increase confidence with more menu items', () => {
      const menuData = generateConcentratedMenuData(14, 10, 50); // 5 extra items
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.confidence).toBe(0.70); // 0.65 + (5 * 0.01)
    });

    it('should cap confidence at 0.95', () => {
      const menuData = generateConcentratedMenuData(50, 50, 50); // Lots of data
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result!.confidence).toBe(0.95);
    });
  });

  describe('edge cases', () => {
    it('should handle exactly minimum requirements', () => {
      const menuData = generateConcentratedMenuData(14, 5, 45); // Exactly 14 days, 5 items
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result).not.toBeNull();
      expect(result!.conditions).toContain('Total Menu Items Analyzed: 5');
    });

    it('should handle very high concentration correctly', () => {
      const menuData = generateConcentratedMenuData(14, 6, 95); // 95% concentration
      const result = rule.evaluate(mockInput, menuData);
      
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      expect(result!.message).toContain('95.0%');
    });
  });

  // Helper functions to generate test data
  function generateMenuData(days: number, uniqueItems: number): Array<{
    timestamp: Date;
    menuItemId: string;
    menuItemName: string;
    revenue: number;
  }> {
    const data = [];
    const startDate = new Date('2024-01-01');
    
    for (let day = 0; day < days; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);
      
      for (let item = 0; item < uniqueItems; item++) {
        data.push({
          timestamp: date,
          menuItemId: `item-${item}`,
          menuItemName: `Menu Item ${item + 1}`,
          revenue: 100 // Equal revenue for all items
        });
      }
    }
    
    return data;
  }

  function generateBalancedMenuData(days: number, uniqueItems: number): Array<{
    timestamp: Date;
    menuItemId: string;
    menuItemName: string;
    revenue: number;
  }> {
    const data = [];
    const startDate = new Date('2024-01-01');
    
    for (let day = 0; day < days; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);
      
      for (let item = 0; item < uniqueItems; item++) {
        data.push({
          timestamp: date,
          menuItemId: `item-${item}`,
          menuItemName: `Menu Item ${item + 1}`,
          revenue: 100 + (item * 5) // Slight variation but balanced
        });
      }
    }
    
    return data;
  }

  function generateConcentratedMenuData(days: number, uniqueItems: number, targetConcentration: number): Array<{
    timestamp: Date;
    menuItemId: string;
    menuItemName: string;
    revenue: number;
  }> {
    const data = [];
    const startDate = new Date('2024-01-01');
    
    // Calculate revenues to achieve target concentration for top 3 items
    const totalRevenue = 1000;
    const top3Revenue = (targetConcentration / 100) * totalRevenue;
    const remainingRevenue = totalRevenue - top3Revenue;
    
    // Distribute top 3 revenue (decreasing amounts)
    const item1Revenue = top3Revenue * 0.5;
    const item2Revenue = top3Revenue * 0.3;
    const item3Revenue = top3Revenue * 0.2;
    
    // Distribute remaining revenue equally among other items
    const otherItemRevenue = remainingRevenue / (uniqueItems - 3);
    
    for (let day = 0; day < days; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);
      
      for (let item = 0; item < uniqueItems; item++) {
        let revenue: number;
        if (item === 0) revenue = item1Revenue / days;
        else if (item === 1) revenue = item2Revenue / days;
        else if (item === 2) revenue = item3Revenue / days;
        else revenue = otherItemRevenue / days;
        
        data.push({
          timestamp: date,
          menuItemId: `item-${item}`,
          menuItemName: `Menu Item ${item + 1}`,
          revenue: revenue
        });
      }
    }
    
    return data;
  }

  function generateDominantItemMenuData(days: number, uniqueItems: number): Array<{
    timestamp: Date;
    menuItemId: string;
    menuItemName: string;
    revenue: number;
  }> {
    const data = [];
    const startDate = new Date('2024-01-01');
    
    for (let day = 0; day < days; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);
      
      for (let item = 0; item < uniqueItems; item++) {
        let revenue: number;
        if (item === 0) revenue = 500; // Dominant item
        else if (item === 1) revenue = 100; // Second item
        else if (item === 2) revenue = 80; // Third item
        else revenue = 20; // Other items
        
        data.push({
          timestamp: date,
          menuItemId: `item-${item}`,
          menuItemName: `Menu Item ${item + 1}`,
          revenue: revenue
        });
      }
    }
    
    return data;
  }
});
