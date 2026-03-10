# Log Today page – UX summary and next steps

## What’s in place

- **Edit today’s data**  
  When today’s row exists, the form is pre-filled and stays editable. Save uses UPSERT on `branch_id` + `metric_date`, so the same row is updated (no duplicates).

- **Original values & unsaved state**  
  On load we store `originalValues` (revenue, rooms sold, additional cost, capacity, monthly fixed cost). `isDirty` is derived when any of these differ from the current form. No separate “edited” flag.

- **Field highlighting**  
  If a field’s value differs from `originalValues`, it gets blue border (`#2563eb`) and light blue background (`#f8fbff`). Error state still uses red border.

- **“Unsaved changes” badge**  
  When `isDirty`, a yellow-dot style line is shown under the Save button: “Unsaved changes” / “มีการแก้ไขที่ยังไม่ได้บันทึก”.

- **Reset after save**  
  After a successful save we refetch today’s metric and set both form state and `originalValues` from the result, so the badge and highlights clear.

- **beforeunload**  
  If `isDirty` and the user tries to leave (close tab, refresh, navigate away), the browser can show the standard “Leave site?” prompt.

- **Capacity from branch**  
  For accommodation, Total Rooms and Accommodation Staff are stored on the branch and loaded from `syncBranchesForOrgAndUser` (and a fallback fetch on Log Today if the cache is missing them).

## Suggested next steps

1. **Manual test (Log Today)**  
   - Open Log Today for a branch that already has today’s data.  
   - Change one or more of: Revenue, Rooms Sold, Additional Cost, capacity, or Monthly Fixed Cost.  
   - Confirm fields get the blue highlight and “Unsaved changes” appears.  
   - Save and confirm the success message, refetched values, and that the badge and highlights disappear.  
   - Try closing/refreshing with unsaved changes and confirm the browser’s leave warning when applicable.

2. **Deploy and smoke-test**  
   - Deploy (e.g. Vercel).  
   - Run a quick smoke test on the deployed Log Today page (load, edit, save, reload).

3. **Automated tests (later)**  
   - RBAC: unit tests for `useUserRole`, integration tests for invite flow, E2E for route guards (see `docs/RBAC-IMPLEMENTATION.md`).  
   - Log Today: consider E2E or integration tests for “load → edit → save → reload” and unsaved-changes behavior.

4. **Monitoring**  
   - After release, watch for client errors or failed saves (e.g. Supabase errors, RLS) and fix as needed.

## Files touched (reference)

- `apps/web/app/branch/log-today/page.tsx` – form state, `originalValues`, `isDirty`, highlights, badge, beforeunload, refetch after save.  
- `apps/web/app/services/business-group-service.ts` – branch capacity in `syncBranchesForOrgAndUser` select.  
- `apps/web/app/services/db/daily-metrics-service.ts` – `getTodayDailyMetric` / `getLastEntryDate` by branch type; save already uses UPSERT.
