# Hospitality AI

Vertical application for hospitality businesses (hotels, resorts, restaurants, cafés, bars).

## Responsibilities

- Provide UI for hospitality users
- Adapt hospitality concepts to SME OS contracts
- Display alerts and recommendations
- Manage hospitality-specific settings

## Boundaries

- **DO NOT** implement decision logic (delegate to SME OS)
- **DO NOT** include business intelligence calculations
- **DO** use adapters to translate hospitality concepts to SME OS
- **DO** keep UI thin and focused on presentation

## Structure

- `app/` - Next.js App Router application
  - `home/` - Decision feed page (shows alerts)
  - `login/` - Login page
  - `alert/` - Alert management page
  - `overview/` - Business overview page
  - `scenario/` - Scenario planning page
  - `history/` - Decision history page
  - `settings/` - Settings page
  - `(group)/owner-summary/` - Owner Summary dashboard (executive-level overview)
  - `hospitality/` - Hospitality dashboard and related pages
- `services/` - Service layer for API calls
- `adapters/` - Adapters for translating hospitality concepts
- `lib/` - Shared libraries (auth, scopes)

## Development

### Setup

```bash
# Install dependencies (from monorepo root)
npm install

# Run development server
cd apps/web
npm run dev
```

### Data Flow

1. **UI** collects hospitality-specific data
2. **Adapters** translate to generic SME OS contracts
3. **Services** call SME OS (currently mocked)
4. **SME OS** returns generic outputs
5. **Adapters** translate back to hospitality concepts
6. **UI** displays translated outputs

### Architecture

- **No decision logic** in Hospitality AI
- **All decisions** delegated to SME OS
- **Adapters** handle all translation
- **Services** are the only boundary to SME OS

### Role-Based Access Control

The application supports three user roles:
- **owner**: Full access to all branches and Owner Summary dashboard
- **manager**: Access to assigned branches and aggregated views
- **branch**: Access only to assigned branches

Access control is enforced via Next.js layouts:
- `app/(group)/layout.tsx`: Restricts Owner Summary to owner/admin roles
- `app/hospitality/layout.tsx`: Allows all roles with appropriate data scoping

### Owner Summary

The Owner Summary dashboard (`/owner-summary`) provides an executive-level overview:
- Overall health score across all branches
- Branch performance comparison
- Key alerts summary
- Accessible only to owner and admin roles
