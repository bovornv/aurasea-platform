# Completely Disable TEST_MODE and Simulation Mode

This guide shows how to completely disable both TEST_MODE and Simulation Mode so the app uses ONLY real database data.

## Method 1: Environment Variable (Recommended)

Add to `apps/web/.env.local`:

```bash
NEXT_PUBLIC_DISABLE_TEST_MODE=true
```

This will:
- Hide TEST_MODE selector UI
- Disable fixture loading
- Prevent simulation mode activation
- Force app to use real Supabase data only

**Note:** Restart dev server after adding this variable.

## Method 2: Browser Console Script

Run this in your browser console:

```javascript
// Copy and paste the entire script from scripts/disable-all-test-modes.js
// Or run this:

localStorage.setItem('aurasea_test_mode', JSON.stringify({
  businessType: null,
  scenario: null,
  simulationType: null,
  simulationScenario: 'healthy',
  simulationControls: {},
  version: 0
}));

window.dispatchEvent(new CustomEvent('testModeUpdated', {
  detail: { businessType: null, scenario: null, simulationType: null, simulationScenario: 'healthy', simulationControls: {}, version: 0 }
}));

console.log('✅ Both modes disabled - reload page');
```

## Method 3: Programmatic (React Component)

Use the `disableAllModes()` function from `TestModeProvider`:

```typescript
import { useTestMode } from '../providers/test-mode-provider';

function MyComponent() {
  const { disableAllModes } = useTestMode();
  
  useEffect(() => {
    disableAllModes(); // Disables both TEST_MODE and Simulation
  }, []);
}
```

## Verification

After disabling, verify:

1. **TEST_MODE disabled:**
   - Business Scenario Selector should be hidden
   - No fixture data loaded
   - `isTestModeEnabled()` returns `false`

2. **Simulation disabled:**
   - Simulation banner should be hidden
   - `simulation.active` should be `false`
   - `isSimulationModeActive()` returns `false`

3. **Real data active:**
   - App loads data from Supabase
   - Metrics come from `weekly_metrics` table
   - No simulated or fixture data

## Re-enabling

To re-enable TEST_MODE and Simulation:

1. Remove or set `NEXT_PUBLIC_DISABLE_TEST_MODE=false` in `.env.local`
2. Restart dev server
3. Clear localStorage: `localStorage.removeItem('aurasea_test_mode')`
4. Reload page

## Files Modified

- `apps/web/app/services/test-fixture-loader-v2.ts` - Added disable check
- `apps/web/app/services/test-fixture-loader.ts` - Added disable check  
- `apps/web/app/providers/test-mode-provider.tsx` - Added `disableAllModes()` function
- `apps/web/.env.local` - Added `NEXT_PUBLIC_DISABLE_TEST_MODE=true`
