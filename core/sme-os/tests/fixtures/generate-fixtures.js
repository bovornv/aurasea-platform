// Helper script to generate deterministic test fixtures
// Usage: node generate-fixtures.js

function generateMenuForDay(date, totalRevenue, top3Percent) {
  const items = [
    {id: 'item-001', name: 'Espresso'},
    {id: 'item-002', name: 'Cappuccino'},
    {id: 'item-003', name: 'Latte'},
    {id: 'item-004', name: 'Croissant'},
    {id: 'item-005', name: 'Sandwich'},
    {id: 'item-006', name: 'Salad'},
    {id: 'item-007', name: 'Muffin'},
    {id: 'item-008', name: 'Bagel'}
  ];
  
  const top3Revenue = totalRevenue * (top3Percent / 100);
  const remainingRevenue = totalRevenue - top3Revenue;
  
  // Top 3 items get concentrated revenue
  const top3Share = [0.45, 0.30, 0.25]; // Distribution within top 3
  const top3 = items.slice(0, 3).map((item, i) => ({
    timestamp: date,
    menuItemId: item.id,
    menuItemName: item.name,
    revenue: Math.round(top3Revenue * top3Share[i])
  }));
  
  // Remaining items split the rest evenly
  const remainingItems = items.slice(3);
  const perItem = Math.round(remainingRevenue / remainingItems.length);
  const rest = remainingItems.map(item => ({
    timestamp: date,
    menuItemId: item.id,
    menuItemName: item.name,
    revenue: perItem
  }));
  
  return [...top3, ...rest];
}

function generateDailyRevenue(days, weekdayBase, weekendMultiplier, weekdayUtilization) {
  const revenue = [];
  const startDate = new Date('2024-01-01T00:00:00.000Z');
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let dailyRev;
    if (isWeekend) {
      dailyRev = weekdayBase * weekendMultiplier;
    } else {
      // For weekday utilization: vary between base and peak
      // utilization = avg / peak
      // If we want utilization = X, then avg = X * peak
      // So we need: avg = weekdayBase * utilization, peak = weekdayBase
      // But we want variation, so let's create a pattern
      const dayIndex = Math.floor(i / 7) * 5 + (i % 7); // Weekday index
      const variation = weekdayUtilization + (dayIndex % 3) * 0.1; // Add some variation
      dailyRev = weekdayBase * Math.min(1.0, variation);
    }
    
    revenue.push({
      timestamp: date.toISOString(),
      dailyRevenue: Math.round(dailyRev)
    });
  }
  
  return revenue;
}

// Export for use
if (typeof module !== 'undefined') {
  module.exports = { generateMenuForDay, generateDailyRevenue };
}
