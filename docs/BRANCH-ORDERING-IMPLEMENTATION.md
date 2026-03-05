# Branch Ordering Implementation Summary

## Overview
Manual branch ordering has been implemented to allow users to control the order in which branches appear in:
- Branch dropdown (top left in Branch View)
- Company Overview branch listings
- All branch selector components

## Implementation Status: ✅ COMPLETE

### PART 1 — Database Schema ✅

**File**: `apps/web/app/lib/supabase/add-branch-display-order.sql`

- Added `display_order INTEGER DEFAULT 0` column to `branches` table
- Initialized `display_order` for existing branches based on `created_at` (oldest = lower order)
- Added index: `idx_branches_display_order`
- Set default value of 0 for any NULL values

**To apply**: Run the SQL migration script in Supabase SQL Editor.

### PART 2 — Model & Service Updates ✅

**Files Modified**:
1. `apps/web/app/models/business-group.ts`
   - Added `displayOrder?: number` to `Branch` interface

2. `apps/web/app/services/business-group-service.ts`
   - Updated `getAllBranches()` to sort by `displayOrder ASC` (fallback to `createdAt` if same order)
   - Updated `createBranch()` to set `displayOrder = MAX(display_order) + 1` for new branches
   - Updated `createDefaultBranch()` to set `displayOrder = MAX(display_order) + 1`
   - Added `reorderBranch(branchId, direction)` method to swap `display_order` values
   - Migration logic handles both `displayOrder` and `display_order` field names

### PART 3 — Reorder UI ✅

**File**: `apps/web/app/group/settings/page.tsx`

- Added `handleReorderBranch()` function
- Added ▲ ▼ buttons beside each branch in the branch list
- Buttons are disabled when:
  - Branch is at top (▲ disabled)
  - Branch is at bottom (▼ disabled)
  - Only 1 branch exists (both hidden)
- Auto-saves immediately after click
- Shows toast notification on success/error

### PART 4 — Reorder Logic ✅

**Implementation**:
- Swaps `display_order` values between adjacent branches
- Updates both branches atomically
- Dispatches events to refresh all components:
  - `branchUpdated` event
  - `branchSelectionChanged` event
  - `storage` event (for cross-tab sync)

### PART 5 — Branch Dropdown Sync ✅

**Automatic**: All components using `getAllBranches()` or `getAccessibleBranches()` automatically get ordered branches because:
- `getAllBranches()` sorts by `displayOrder ASC`
- `getAccessibleBranches()` calls `getAllBranches()` internally
- Components refresh on `branchUpdated` and `branchSelectionChanged` events

**Affected Components**:
- `view-switcher-dropdown.tsx` ✅
- `branch-selector.tsx` ✅
- `portfolio-branch-table.tsx` ✅
- All other branch selectors ✅

### PART 6 — Edge Cases ✅

1. **Single Branch**: Reorder buttons are hidden (not just disabled)
2. **New Branch Creation**: Automatically sets `displayOrder = MAX(display_order) + 1`
3. **Migration**: Existing branches get `displayOrder` initialized from `created_at`
4. **Missing displayOrder**: Defaults to 0, falls back to `createdAt` for sorting

## Files Modified

1. ✅ `apps/web/app/lib/supabase/add-branch-display-order.sql` (NEW)
2. ✅ `apps/web/app/models/business-group.ts` (UPDATED)
3. ✅ `apps/web/app/services/business-group-service.ts` (UPDATED)
4. ✅ `apps/web/app/group/settings/page.tsx` (UPDATED)

## Validation Checklist

- ✅ Branch order changes immediately in settings
- ✅ Branch dropdown reflects new order (via `getAllBranches()` sorting)
- ✅ Company overview reflects new order (via `getAllBranches()` sorting)
- ✅ No duplicate `display_order` values (swapping prevents duplicates)
- ✅ No UI flicker (state updates immediately, events trigger refresh)
- ✅ No broken queries (all queries use `getAllBranches()` which handles sorting)

## Usage

### For Users:
1. Navigate to **Company View → Settings → Branches**
2. Use ▲ button to move branch up (decrease order)
3. Use ▼ button to move branch down (increase order)
4. Order updates immediately and reflects in all dropdowns

### For Developers:
```typescript
// Reorder a branch programmatically
businessGroupService.reorderBranch(branchId, 'up'); // Move up
businessGroupService.reorderBranch(branchId, 'down'); // Move down

// Get ordered branches (already sorted)
const branches = businessGroupService.getAllBranches();
// Branches are sorted by displayOrder ASC
```

## Database Migration

**Important**: Run the SQL migration script before deploying:

```sql
-- Run in Supabase SQL Editor
-- File: apps/web/app/lib/supabase/add-branch-display-order.sql
```

This will:
1. Add `display_order` column
2. Initialize values for existing branches
3. Create index for performance

## Notes

- **No Breaking Changes**: Existing branches without `displayOrder` default to 0
- **Backward Compatible**: Handles both `displayOrder` and `display_order` field names
- **Automatic Sorting**: All branch queries automatically use `display_order`
- **Event-Driven**: Changes trigger events to refresh all components
- **Cross-Tab Sync**: Storage events ensure changes sync across browser tabs

---

**Status**: ✅ Complete and ready for production
**Date**: 2026-01-24
