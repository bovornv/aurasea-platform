# TEST_MODE Data Loader

## Overview

TEST_MODE allows loading synthetic test data from fixtures instead of using real services. This is useful for:
- Testing alert evaluation with known data patterns
- Demonstrating platform features with realistic scenarios
- Development and QA without manual data entry

## Activation

TEST_MODE is automatically enabled in development mode (`NODE_ENV=development`). You can also explicitly enable it by setting `NEXT_PUBLIC_TEST_MODE=true`.

**Important:** TEST_MODE is **disabled in production** - it will never activate when `NODE_ENV=production`.

## Usage

### Method 1: URL Query Parameter
Add `?scenario=<scenario-name>` to any URL in the Hospitality AI app.

### Method 2: Dev-Only Dropdown (Recommended)
When TEST_MODE is enabled, a scenario switcher dropdown appears in the navigation bar. Simply select a scenario from the dropdown to switch fixtures without manually editing the URL.

### Available Scenarios

**Original Fixtures:**
- `hotel-only` - Single hotel branch
- `cafe-standalone` - Standalone café branch
- `hotel-restaurant` - Hotel with one restaurant
- `hotel-multi-restaurant` - Hotel with multiple restaurants
- `group-hotels` - Group of hotel branches
- `group-cafes` - Group of café branches
- `mixed-group` - Mixed group (hotels + cafés)

**Quality Variant Fixtures:**
- `cafe-good` - Healthy café (no alerts, high health score)
- `cafe-bad` - Struggling café (critical alerts, low health score)
- `cafe-mixed` - Moderate café (warning alerts, moderate health score)
- `hotel-good` - Healthy hotel (no alerts, high health score)
- `hotel-bad` - Struggling hotel (critical alerts, low health score)
- `hotel-mixed` - Moderate hotel (informational/warning alerts, moderate health score)
- `group-good` - Healthy business group (2 healthy branches)
- `group-bad` - Struggling business group (2 struggling branches)
- `group-mixed` - Mixed business group (1 healthy + 1 struggling branch)

### Examples

```
http://localhost:3000/hospitality?scenario=hotel-only
http://localhost:3000/hospitality?scenario=cafe-bad
http://localhost:3000/owner/summary?scenario=group-mixed
```

## How It Works

1. **Fixture Loading**: When TEST_MODE is active and a `scenario` query param is present, the app loads fixture data from `core/sme-os/tests/fixtures/`.

2. **Data Conversion**: Fixture data is converted to:
   - `OperationalSignal[]` for trend analysis and monitoring
   - `HospitalityInput` for SME OS evaluation

3. **Service Override**: 
   - `operationalSignalsService.getAllSignals()` returns fixture-based signals
   - `getHospitalityData()` returns fixture-based hospitality input
   - All alerts and health scores run normally on this fixture data

4. **Caching**: Fixtures are cached after first load to avoid repeated fetches.

## Data Flow

```
URL with ?scenario=hotel-only
    ↓
TEST_MODE detects scenario param
    ↓
Load fixture: hotel-only-single.json
    ↓
Convert to OperationalSignal[] and HospitalityInput
    ↓
Services use fixture data instead of localStorage/real services
    ↓
Alerts and health scores evaluate normally
```

## Implementation Details

- **Test Fixture Loader** (`test-fixture-loader.ts`): Handles fixture loading and conversion
- **Service Integration**: `hospitality-data-service.ts` and `operational-signals-service.ts` check for TEST_MODE
- **Preloading**: Fixtures are preloaded in `monitoring-service.ts` to populate cache before synchronous access

## Fixture Format

Fixtures must follow this structure:

```json
{
  "organizationId": "org-xxx",
  "branches": [
    {
      "branchId": "br-xxx",
      "branchName": "Branch Name",
      "branchType": "hotel" | "cafe",
      "dailyRevenue": [
        {
          "timestamp": "2024-01-01T00:00:00.000Z",
          "dailyRevenue": 45000
        }
      ],
      "menuRevenueDistribution": [] // Optional, for cafés
    }
  ]
}
```

## Production Safety

- TEST_MODE is **completely disabled** in production builds
- No production code paths are modified
- Fixture loading only occurs when explicitly enabled in development
- All production logic remains unchanged
