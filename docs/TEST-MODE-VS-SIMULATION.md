# TEST_MODE vs SIMULATION MODE

## Quick Answer

**You use ONE or the OTHER, not both.** They are mutually exclusive.

- **TEST_MODE**: Uses pre-built static fixtures (faster, simpler)
- **SIMULATION MODE**: Generates dynamic data with live controls (more realistic, interactive)

**SIMULATION MODE takes priority** - if you select a Simulation Dataset, TEST_MODE is automatically disabled.

---

## TEST_MODE (Static Fixtures)

**What it does:**
- Loads pre-built test data from fixtures
- Data is static (doesn't change unless you reload)
- Faster to load
- Good for testing specific scenarios

**How to use:**
1. Select **Business Type** (e.g., "Hotel Group", "Cafe Multi Branch")
2. Select **Scenario** (e.g., "Good", "Mixed", "Bad")
3. Click **"Update Data"**

**When to use:**
- Testing alert logic with known data
- Debugging specific business scenarios
- Quick data loading for development

---

## SIMULATION MODE (Dynamic Generation)

**What it does:**
- Generates realistic 30-day time-series data dynamically
- Creates full daily metrics arrays
- Supports live controls (revenue multiplier, cost multiplier, cash adjustment)
- More realistic data patterns

**How to use:**
1. Select **Simulation Dataset** (e.g., "Big Standalone Accommodation", "F&B Multi Branch")
2. Select **Scenario** (e.g., "Healthy", "Stressed", "Crisis")
3. Optionally adjust **Live Play Controls**:
   - Revenue Multiplier (0.5x - 1.5x)
   - Cost Multiplier (0.5x - 1.5x)
   - Cash Adjustment (THB)
4. Click **"Update Data"** (or data regenerates automatically when you change controls)

**When to use:**
- Testing with realistic time-series data
- Exploring "what-if" scenarios with live controls
- Testing health score trends over time
- Demonstrating the platform with dynamic data

---

## Priority Rules

1. **If Simulation Dataset is selected**: 
   - TEST_MODE is disabled (grayed out)
   - Simulation data is used everywhere
   - Live controls work in real-time

2. **If Simulation Dataset is "None"**:
   - TEST_MODE is enabled
   - Uses fixture data when Business Type + Scenario are selected

3. **"Update Data" button**:
   - If Simulation active → Regenerates simulation data
   - If TEST_MODE active → Reloads fixtures

---

## Visual Indicators

- **Yellow box** = TEST_MODE section
- **Blue box** = SIMULATION MODE section
- **"← ACTIVE"** label = Shows which mode is currently active
- **Grayed out** = Disabled (when other mode is active)

---

## Example Workflows

### Workflow 1: Quick Testing
```
1. Select Business Type: "Hotel Group"
2. Select Scenario: "Bad"
3. Click "Update Data"
→ Uses static fixture data
```

### Workflow 2: Interactive Exploration
```
1. Select Simulation Dataset: "Big Standalone Accommodation"
2. Select Scenario: "Stressed"
3. Adjust Revenue Multiplier to 0.7x
4. Watch health score update in real-time
→ Uses dynamic simulation data
```

### Workflow 3: Switch Between Modes
```
1. Start with TEST_MODE (Business Type: "Cafe Multi Branch")
2. Switch to Simulation Dataset: "F&B Multi Branch"
   → TEST_MODE automatically disabled
3. Switch Simulation Dataset back to "None"
   → TEST_MODE automatically re-enabled
```

---

## Technical Details

- Both modes share the same `testMode.version` counter
- Simulation data is cached in memory
- Fixture data is cached in localStorage
- Both trigger monitoring recalculation when "Update Data" is clicked
- Both work with Company View, Branch View, Health Score, Revenue Leaks, etc.
