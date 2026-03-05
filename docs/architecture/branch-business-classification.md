# Branch-Level Business Classification

## Overview

Each Branch now includes comprehensive business classification that determines:
- Which tabs are visible
- Which features are accessible
- What alerts and insights are shown

## Branch Model

### Fields

**branchName** (string)
- Display name for the branch location
- Example: "Downtown Café", "Beach Resort Main"

**businessType** (BranchBusinessType enum)
- Determines tab visibility and feature access
- Values:
  - `CAFE_RESTAURANT` → Show Café tab only
  - `HOTEL_RESORT` → Show Hotel tab only
  - `HOTEL_WITH_CAFE` → Show both tabs

**location** (BranchLocation, optional)
- `city?: string`
- `country?: string`
- Example: `{ city: "Bangkok", country: "Thailand" }`

**operatingDays** (OperatingDays, optional)
- `weekdays: boolean` (Monday-Friday)
- `weekends: boolean` (Saturday-Sunday)
- Default: Both true (operating all days)

## Tab Visibility Rules

| Business Type | Hotel Tab | Café Tab |
|--------------|-----------|----------|
| `CAFE_RESTAURANT` | ❌ Hidden | ✅ Visible |
| `HOTEL_RESORT` | ✅ Visible | ❌ Hidden |
| `HOTEL_WITH_CAFE` | ✅ Visible | ✅ Visible |

## Access Control

### Tab Access
- Users cannot switch to tabs that their branch doesn't support
- Attempts to access unsupported tabs via URL are redirected to an allowed tab
- Tab visibility is determined dynamically based on current branch

### Implementation

**BusinessTypeTabs Component**
- Uses `useCurrentBranch()` hook to get current branch
- Checks `branch.businessType` to determine tab visibility
- Prevents tab switching to unsupported tabs
- Redirects invalid URL tab parameters

**BranchTabGuard Component**
- Wraps route-level components that require specific tab access
- Automatically redirects if branch doesn't support the required tab
- Can be used to protect individual routes

**Hospitality Dashboard**
- Uses branch businessType for default tab selection
- Validates tab access on URL changes
- Redirects to allowed tab if invalid tab is requested

## Migration

### Existing Branches
- Old branches with `name` field are automatically migrated to `branchName`
- Old lowercase businessType values are converted to BranchBusinessType enum
- Default operatingDays (both true) are added if missing
- Location fields are optional and can be added later

### Backward Compatibility
- If branch is not available, defaults to showing both tabs (backward compatibility)
- Old BusinessSetup businessType is still used as fallback during migration
- Existing data continues to work without changes

## Usage Examples

### Creating a Branch

```typescript
import { businessGroupService } from './services/business-group-service';
import { BranchBusinessType } from './models/business-group';

const branch = businessGroupService.createBranch(
  'Downtown Café',
  BranchBusinessType.CAFE_RESTAURANT,
  { city: 'Bangkok', country: 'Thailand' },
  { weekdays: true, weekends: true }
);
```

### Getting Current Branch

```typescript
import { useCurrentBranch } from './hooks/use-current-branch';

function MyComponent() {
  const { branch, isLoading } = useCurrentBranch();
  
  if (branch?.businessType === BranchBusinessType.CAFE_RESTAURANT) {
    // Show café-specific content
  }
}
```

### Checking Tab Access

```typescript
import { BranchBusinessType } from './models/business-group';

const canAccessHotelTab = branch?.businessType === BranchBusinessType.HOTEL_RESORT || 
                          branch?.businessType === BranchBusinessType.HOTEL_WITH_CAFE;

const canAccessCafeTab = branch?.businessType === BranchBusinessType.CAFE_RESTAURANT || 
                         branch?.businessType === BranchBusinessType.HOTEL_WITH_CAFE;
```

## Notes

- Tab visibility is branch-specific, not user-specific
- Users can switch branches to access different tabs
- All alerts and insights are filtered by branchId
- Business type rules are enforced at the UI level (tabs) and route level (guards)
