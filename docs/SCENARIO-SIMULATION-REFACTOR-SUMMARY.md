# Scenario Simulation Architecture Refactor - Summary

## ✅ Completed Implementation

### 1. SQL Migration
- **File**: `apps/web/app/lib/supabase/add-branch-data-mode.sql`
- **Action**: Adds `data_mode` column to `branches` table
- **Values**: `'real'`, `'healthy'`, `'stressed'`, `'crisis'`
- **Default**: `'real'`

### 2. Removed from Company View Settings
- ✅ Verified `apps/web/app/group/settings/page.tsx` has NO scenario controls
- ✅ Only contains Organization Switcher (dev mode) and Language selection
- ✅ Company View only aggregates existing branch data

### 3. Added to Branch View Settings
- **File**: `apps/web/app/branch/settings/page.tsx`
- **Section**: "Scenario & Data Mode" (between Monitoring Configuration and User Access)
- **Features**:
  - Shows branch business type (read-only)
  - Dropdown for Data Mode selection
  - Confirmation modal when switching modes
  - Warning indicator when using simulated data

### 4. BranchScenarioSelector Component
- **File**: `apps/web/app/components/branch-scenario-selector.tsx`
- **Features**:
  - Fetches branch setup data from Supabase
  - Loads current `data_mode` from database
  - Shows business type label
  - Handles mode switching with confirmation
  - Updates `branches.data_mode` column
  - Integrates with `generateBranchScenario()` and `switchToRealData()`
  - Shows loading states and error messages
  - Reloads dashboard after scenario change

### 5. Integration Points
- ✅ Uses `generateBranchScenario()` for scenario generation
- ✅ Uses `switchToRealData()` for Real Data mode
- ✅ Uses `updateBranchDataMode()` to persist mode
- ✅ Uses `getBranchDataMode()` to load current mode
- ✅ Automatically detects branch business type from modules

## Architecture

### Data Flow
1. User selects scenario in Branch Settings
2. Component shows confirmation modal (if switching from real or between scenarios)
3. On confirm:
   - If Real Data: Deletes all `daily_metrics` for branch
   - If Scenario: Generates 40 days of `daily_metrics` for branch
4. Updates `branches.data_mode` column
5. Reloads dashboard to show new data

### Branch Business Type Detection
- Accommodation: `modules.includes(ModuleType.ACCOMMODATION)` only
- F&B: `modules.includes(ModuleType.FNB)` only
- Hybrid: Both modules present

### Scenario Generation
- **Accommodation**: Generates `revenue`, `rooms_sold`, `adr`, `cost`, `cash_balance`
- **F&B**: Generates `revenue`, `customers`, `avg_ticket`, `top3MenuPct`, `cost`, `cash_balance`
- **Hybrid**: Generates both accommodation and F&B metrics

## Testing Checklist

### Pre-Migration
- [ ] Backup `branches` table
- [ ] Run SQL migration: `apps/web/app/lib/supabase/add-branch-data-mode.sql`
- [ ] Verify `data_mode` column exists with default `'real'`

### Branch Settings Page
- [ ] Navigate to Branch View → Settings
- [ ] Verify "Scenario & Data Mode" section appears
- [ ] Verify business type displays correctly (Accommodation/F&B/Hybrid)
- [ ] Verify dropdown shows 4 options: Real Data, Healthy, Stressed, Crisis
- [ ] Verify current mode loads from database

### Scenario Switching
- [ ] Switch from Real Data → Healthy Scenario
  - [ ] Confirmation modal appears
  - [ ] Modal shows correct scenario name
  - [ ] After confirm: 40 days generated
  - [ ] Dashboard reloads
  - [ ] `data_mode` updated in database
  
- [ ] Switch between scenarios (Healthy → Stressed)
  - [ ] Confirmation modal appears
  - [ ] Modal shows both scenario names
  - [ ] After confirm: New 40 days generated
  - [ ] Old data replaced
  
- [ ] Switch from Scenario → Real Data
  - [ ] No confirmation (direct switch)
  - [ ] All `daily_metrics` deleted for branch
  - [ ] `data_mode` set to `'real'`
  - [ ] Dashboard shows empty/real data

### Data Verification
- [ ] Verify generated data has 40 continuous days
- [ ] Verify no gaps in dates
- [ ] Verify required fields populated (revenue, etc.)
- [ ] Verify weekend patterns applied
- [ ] Verify scenario multipliers applied correctly

### Edge Cases
- [ ] Test with branch that has no setup data (rooms_available, etc.)
- [ ] Test error handling when Supabase unavailable
- [ ] Test loading states during generation
- [ ] Test error messages display correctly

### Company View
- [ ] Verify Company View Settings has NO scenario controls
- [ ] Verify Company View aggregates branch data correctly
- [ ] Verify Company View never generates data

## Files Modified

### New Files
1. `apps/web/app/lib/supabase/add-branch-data-mode.sql`
2. `apps/web/app/components/branch-scenario-selector.tsx`
3. `docs/SCENARIO-SIMULATION-REFACTOR-SUMMARY.md` (this file)

### Modified Files
1. `apps/web/app/branch/settings/page.tsx` - Added Scenario section
2. `apps/web/app/services/branch-scenario-generator.ts` - Fixed `const cost` → `let cost` (3 places)

## Next Steps

1. **Run SQL Migration**: Execute `add-branch-data-mode.sql` in Supabase SQL Editor
2. **Test Implementation**: Follow testing checklist above
3. **Monitor**: Check browser console for any errors during scenario switching
4. **Verify**: Ensure dashboard correctly displays generated scenario data

## Notes

- Scenario selection is **branch-scoped only** (not organization-level)
- Company View **never generates data** (only aggregates)
- Branch business type determines which generator function to use
- All scenario data stored in `daily_metrics` table (same as real data)
- `data_mode` column tracks current mode per branch
- Confirmation modal prevents accidental data overwrite
