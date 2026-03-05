# Multi-Branch Business Support

## Overview

The platform now supports multi-branch businesses with a clear hierarchy:

```
Owner Account (1) → Business Group (1) → Branches (many)
```

All alerts, insights, and health scores belong to a specific Branch.

## Architecture

### Models

**BusinessGroup** (`apps/hospitality-ai/app/models/business-group.ts`)
- Represents a brand or business entity
- Each owner has exactly one Business Group
- Contains metadata: id, name, timestamps

**Branch** (`apps/hospitality-ai/app/models/business-group.ts`)
- Represents an individual location (hotel, resort, café, restaurant)
- Belongs to a Business Group
- Contains: id, businessGroupId, name, businessType, isDefault flag

### Services

**BusinessGroupService** (`apps/hospitality-ai/app/services/business-group-service.ts`)
- Manages Business Groups and Branches
- Handles auto-migration of existing users
- Provides methods to:
  - Initialize business structure (auto-migration)
  - Get/create/update branches
  - Set/get current active branch

### Data Model Updates

**AlertContract** (`core/sme-os/contracts/alerts.ts`)
- Added optional `branchId?: string`
- Added optional `businessGroupId?: string`
- Backward compatible (optional fields)

**OperationalSignal** (`apps/hospitality-ai/app/services/operational-signals-service.ts`)
- Added optional `branchId?: string`
- Auto-assigned from current branch if not provided
- Backward compatible

## Migration

### Auto-Migration

When the app loads, `BusinessSetupProvider` automatically:
1. Checks if user has been migrated
2. If not migrated:
   - Creates default Business Group ("My Business")
   - Creates default Branch (uses business name from BusinessSetup if available)
   - Marks migration as complete
3. Sets current branch to default branch

### Backward Compatibility

- All new fields are optional
- Existing data without branchId continues to work
- Services gracefully handle missing branchId
- No data loss during migration

## Usage

### Getting Current Branch

```typescript
import { businessGroupService } from './services/business-group-service';

const currentBranch = businessGroupService.getCurrentBranch();
const branchId = currentBranch?.id;
```

### Creating Alerts with Branch

Alerts automatically include branchId when created through MonitoringService. The service:
1. Gets current branch from BusinessGroupService
2. Adds branchId and businessGroupId to all alerts
3. Falls back gracefully if BusinessGroupService not available

### Filtering Signals by Branch

```typescript
import { operationalSignalsService } from './services/operational-signals-service';

// Get signals for current branch
const signals = operationalSignalsService.getAllSignals(branchId);

// Get latest signal for current branch
const latest = operationalSignalsService.getLatestSignal(branchId);
```

## Future Enhancements

- Multi-branch UI (branch selector, branch management)
- Cross-branch analytics
- Branch-specific health scores
- Branch comparison views

## Notes

- Alert logic has NOT been changed (as per requirements)
- All changes maintain backward compatibility
- Migration is automatic and transparent to users
