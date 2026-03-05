# RBAC Validation Checklist

All enforcement must work via RLS and route guard; do not rely on frontend hiding only.

## Owner
- [x] Full access to all routes (company + all branches)
- [x] Company settings (companySettings)
- [x] Delete branch (deleteBranch)
- [x] Log data, invite users, edit branch settings

## Manager
- [x] No company settings (companySettings: false)
- [x] No delete branch (deleteBranch: false)
- [x] No ownership transfer (owner-only actions)
- [x] Log data, invite users, edit branch settings, company overview

## Branch Manager
- [x] No company settings
- [x] No access to other branches (only accessibleBranchIds)
- [x] Log data, invite users, edit branch settings
- [x] No company overview (viewCompanyOverview: false)

## Branch User
- [x] Cannot edit branch settings (editBranchSettings: false)
- [x] Cannot invite users (inviteUsers: false)
- [x] Cannot see company overview
- [x] Can log data, access own branch only

## Viewer
- [x] Read-only
- [x] Cannot log data (logData: false)
- [x] Cannot edit settings
- [x] Cannot access /log or /settings routes

## Cross-cutting
- [x] Route guard validates with permission matrix (validateRouteAccess)
- [x] Unauthorized → redirect to /unauthorized and log violation
- [x] UI validator scans for forbidden controls, logs [RBAC_UI_VIOLATION]
- [x] RLS tester: testRLSAccess(branchId); [CRITICAL_RLS_BREACH] if other branch data visible
- [x] Cross-branch: branch user on Branch A loading Branch B → [CROSS_BRANCH_ACCESS_VIOLATION]
- [x] Company isolation: Org A user loading Org B → redirect or 403
