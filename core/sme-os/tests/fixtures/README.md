# Test Fixtures for Hospitality AI Alerts and Insights

This directory contains deterministic test fixtures designed to trigger specific alerts and insights in the Hospitality AI platform. All fixtures include 30+ days of daily revenue data and are designed to test alert evaluation logic.

## Fixture Structure

Each fixture follows this structure:
```json
{
  "organizationId": "org-xxx-001",
  "branches": [
    {
      "branchId": "br-xxx-001",
      "branchName": "Branch Name",
      "branchType": "hotel" | "cafe",
      "dailyRevenue": [
        {"timestamp": "2024-01-01T00:00:00.000Z", "dailyRevenue": 12000},
        ...
      ],
      "menuRevenueDistribution": [
        // Optional: Only for café/restaurant branches
        {"timestamp": "2024-01-01T00:00:00.000Z", "menuItemId": "item-001", "menuItemName": "Espresso", "revenue": 1800},
        ...
      ]
    }
  ],
  "description": "Description of fixture characteristics"
}
```

## Alert Thresholds Reference

### Low Weekday Utilization (Café/Restaurant)
- **Critical**: <30% utilization (avg/peak weekday revenue)
- **Warning**: 30-49.9% utilization
- **Informational**: 50-69.9% utilization
- **No Alert**: ≥70% utilization (or informational if >14 weekdays)

### Weekend–Weekday F&B Gap (Café/Restaurant)
- **Critical**: ≥2.8x ratio (weekend/weekday)
- **Warning**: ≥2.0x and <2.8x ratio
- **Informational**: ≥1.5x and <2.0x ratio
- **No Alert**: <1.5x ratio

### Menu Revenue Concentration (Café/Restaurant)
- **Critical**: ≥70% concentration (top 3 items)
- **Warning**: ≥55% and <70% concentration
- **Informational**: ≥40% and <55% concentration
- **No Alert**: <40% concentration
- **Requires**: 14+ days, 5+ unique menu items

### Health Score Calculation
- Formula: `100 - (critical * 20 + warning * 10 + informational * 5)`
- **High Health Score (80-100)**: Few/no alerts
- **Moderate Health Score (50-79)**: Some warnings/informational alerts
- **Low Health Score (0-49)**: Multiple critical/warning alerts

## Café / Restaurant Fixtures

### `cafe-good.json`
**Expected Alerts**: None (or minimal informational)

**Characteristics**:
- High weekday utilization (~65% avg/peak, avoids <30% critical threshold)
- Moderate weekend/weekday gap (1.5x ratio, informational only)
- Balanced menu distribution (top 3 items ~35% of revenue, below 40% threshold)

**Health Score**: High (80-100)

**Usage**: `?scenario=cafe-good`

---

### `cafe-bad.json`
**Expected Alerts**: 
- **Critical**: Low Weekday Utilization (<30% utilization)
- **Critical**: Weekend–Weekday F&B Gap (4.0x ratio, ≥2.8x)
- **Critical**: Menu Revenue Concentration (75% top 3 items, ≥70%)

**Characteristics**:
- Critical low weekday utilization (avg ~2.3k, peak ~10k = ~23% utilization)
- Critical weekend/weekday gap (4.0x ratio)
- Critical menu concentration (75% top 3 items)

**Health Score**: Low (0-30)

**Usage**: `?scenario=cafe-bad`

---

### `cafe-mixed.json`
**Expected Alerts**:
- **Warning**: Low Weekday Utilization (42% utilization, 30-49.9% range)
- **Warning**: Weekend–Weekday F&B Gap (2.4x ratio, ≥2.0x and <2.8x)

**Characteristics**:
- Warning-level weekday utilization (avg ~4.2k, peak ~10k = ~42% utilization)
- Warning-level weekend/weekday gap (2.4x ratio)

**Health Score**: Moderate (50-70)

**Usage**: `?scenario=cafe-mixed`

---

## Hotel / Resort Fixtures

### `hotel-good.json`
**Expected Alerts**: None (or minimal)

**Characteristics**:
- Consistent revenue (45k-48k daily range)
- Stable performance with minimal volatility
- No significant demand drops or cost pressures

**Health Score**: High (80-100)

**Usage**: `?scenario=hotel-good`

---

### `hotel-bad.json`
**Expected Alerts**:
- **Critical**: Demand Drop (declining revenue trend: 15k → 5k over 31 days)
- **Warning**: Cash Flow Volatility (high variance in daily revenue)
- **Warning**: Revenue Concentration (time-based concentration patterns)

**Characteristics**:
- Declining revenue trend (15k → 5k over 31 days)
- High volatility in daily revenue
- Multiple risk factors present

**Health Score**: Low (0-40)

**Usage**: `?scenario=hotel-bad`

---

### `hotel-mixed.json`
**Expected Alerts**:
- **Informational/Warning**: Some revenue volatility alerts
- **Informational**: Moderate demand fluctuations

**Characteristics**:
- Some revenue volatility (30k-36k range)
- Moderate performance with occasional dips
- May trigger informational/warning alerts

**Health Score**: Moderate (60-80)

**Usage**: `?scenario=hotel-mixed`

---

## Group / Multi-Branch Fixtures

### `group-good.json`
**Expected Alerts**: None (or minimal across branches)

**Characteristics**:
- 2 branches: Healthy Hotel + Healthy Café
- Both branches performing well
- High individual branch health scores

**Group Health Score**: High (80-100)

**Usage**: `?scenario=group-good`

**Branches**:
- `br-group-good-001`: Healthy Hotel (consistent 45k-48k revenue)
- `br-group-good-002`: Healthy Café (good weekday utilization, moderate weekend gap)

---

### `group-bad.json`
**Expected Alerts**: Multiple critical alerts across branches

**Characteristics**:
- 2 branches: Struggling Hotel + Struggling Café
- Both branches performing poorly
- Multiple critical alerts per branch

**Group Health Score**: Low (0-30)

**Usage**: `?scenario=group-bad`

**Branches**:
- `br-group-bad-001`: Struggling Hotel (declining revenue 15k → 5k)
- `br-group-bad-002`: Struggling Café (critical low utilization, critical weekend gap, critical menu concentration)

---

### `group-mixed.json`
**Expected Alerts**: Mixed alerts across branches

**Characteristics**:
- 2 branches: Healthy Hotel + Struggling Café
- One branch healthy, one branch with warnings
- Moderate group health score (weighted average)

**Group Health Score**: Moderate (50-70)

**Usage**: `?scenario=group-mixed`

**Branches**:
- `br-group-mixed-001`: Successful Hotel (consistent 45k-48k revenue, high health score)
- `br-group-mixed-002`: Struggling Café (warning-level weekday utilization, warning-level weekend gap)

---

## Usage in TEST_MODE

All fixtures can be loaded in TEST_MODE by adding `?scenario=<fixture-name>` to any Hospitality AI URL:

```
http://localhost:3000/hospitality?scenario=cafe-good
http://localhost:3000/hospitality?scenario=hotel-bad
http://localhost:3000/owner/summary?scenario=group-mixed
```

## Data Characteristics

### Deterministic Design
- All fixtures use **deterministic data** (no `Math.random()`)
- Revenue patterns are calculated to trigger specific alert thresholds
- Menu distributions are designed to test concentration alerts

### Data Coverage
- All fixtures include **31 days** of daily revenue data
- Café fixtures include menu revenue distribution (when applicable)
- Data spans January 2024 (2024-01-01 to 2024-01-31)

### Alert Testing
Each fixture is designed to test:
1. **Alert Severity Thresholds**: Critical, Warning, Informational
2. **Health Score Calculation**: High, Moderate, Low scores
3. **Multi-Branch Aggregation**: Group-level health scores
4. **Alert Suppression**: No duplicate or conflicting alerts

## Notes

- **Menu Revenue Distribution**: Café fixtures (`cafe-good.json`, `cafe-bad.json`) include menu data. Other café fixtures may need menu data added to test menu concentration alerts fully.
- **Weekday Utilization**: Calculated as `avgWeekdayRevenue / peakWeekdayRevenue` for unique weekday days only.
- **Weekend/Weekday Gap**: Calculated as `avgWeekendRevenue / avgWeekdayRevenue` for the most recent 14 days.
- **Health Score**: Calculated at branch level, then aggregated at group level using revenue-weighted average.

## Future Enhancements

- Add menu revenue distribution to `cafe-mixed.json` for complete menu concentration testing
- Add more granular scenarios (e.g., `cafe-warning-only.json`, `hotel-critical-only.json`)
- Add fixtures for hotel-with-restaurant scenarios
- Add fixtures with seasonal patterns
