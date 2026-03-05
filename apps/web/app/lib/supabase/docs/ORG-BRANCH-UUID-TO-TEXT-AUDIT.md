# Audit: organization_id and branch_id UUID → TEXT

## Tables referencing `organizations.id`

| Table | Column | Current type | References |
|-------|--------|--------------|------------|
| organization_members | organization_id | UUID | organizations(id) |
| organization_owner_cache | organization_id | UUID | organizations(id) |
| invitations | organization_id | UUID | organizations(id) |
| branches | organization_id | UUID | organizations(id) |

## Tables referencing `branches.id`

| Table | Column | Current type | References |
|-------|--------|--------------|------------|
| branch_members | branch_id | TEXT | branches(id) |
| invitations | branch_id | TEXT | branches(id) |
| daily_metrics | branch_id | TEXT | branches(id) |
| health_snapshots | branch_id | TEXT | branches(id) |
| weekly_metrics | branch_id | UUID or TEXT | branches(id) |

## Source columns to convert

| Table | Column | From | To |
|-------|--------|------|-----|
| organizations | id | UUID | TEXT |
| branches | id | UUID or TEXT | TEXT |
| branches | organization_id | UUID | TEXT |

## RLS policies to drop (before ALTER) and recreate (after)

### organizations
- "Users can read their organization's data" (legacy)
- "Users can read accessible organizations"

### branches
- "Users can read their organization's branches" (legacy)
- "Users can read accessible branches"
- "Owners and managers can insert branches"
- "Authorized users can update branches"
- "Only owners can delete branches"

### organization_members
- "Users can read own organization memberships"
- "Owners can invite organization members"
- "Owners can update organization members"
- "Owners can delete organization members"

### organization_owner_cache
- "Users can read own owner cache rows"

### branch_members
- "Users can read own branch memberships"
- "Authorized users can invite branch members"
- "Authorized users can update branch members"
- "Authorized users can delete branch members"

### invitations
- "Users can read own invitations"
- "Users can read invitations to their email"
- "Owners can create organization invitations"
- "Authorized users can create branch invitations"
- "Users can update own invitations"
- "Users can accept invitations"

### daily_metrics
- "Users can read their organization's daily metrics" (legacy)
- "Users can read accessible daily metrics"
- "Authorized users can insert daily metrics"
- "Authorized users can update daily metrics"

### health_snapshots (if RLS enabled)
- Any policy on health_snapshots

### weekly_metrics (if RLS enabled)
- Any policy on weekly_metrics

## Foreign key constraints (default names in Postgres)

- organization_members: `organization_members_organization_id_fkey`
- organization_owner_cache: `organization_owner_cache_organization_id_fkey`
- invitations: `invitations_organization_id_fkey`, `invitations_branch_id_fkey`
- branches: `branches_organization_id_fkey`
- branch_members: `branch_members_branch_id_fkey`
- daily_metrics: `daily_metrics_branch_id_fkey`
- health_snapshots: `health_snapshots_branch_id_fkey`
- weekly_metrics: `weekly_metrics_branch_id_fkey`
