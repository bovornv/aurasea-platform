# Testing Guide: Navigation Menu & Log Today Page

## Overview

This guide covers testing for:
1. **Navigation Menu** - Dynamic rendering based on view mode
2. **Log Today Page** - Dynamic fields based on business type

## Part 1: Navigation Menu Testing

### Test 1: Branch View Menu (6 items)
**Steps:**
1. Ensure you're logged in as Owner or Manager
2. Switch to Branch View (via View Mode dropdown)
3. Navigate to any Branch View page (e.g., `/branch/overview`)

**Expected Result:**
- Navigation menu shows 6 items:
  - Overview
  - Log Today
  - Alerts
  - Trends
  - Scenario
  - Settings

### Test 2: Company View Menu (4 items)
**Steps:**
1. While in Branch View, switch to Company View (via View Mode dropdown)
2. Navigate to Company View page (e.g., `/group/overview`)

**Expected Result:**
- Navigation menu shows 4 items:
  - Overview
  - Alerts
  - Trends
  - Settings
- **Log Today** and **Scenario** are NOT visible

### Test 3: Redirect from Invalid Routes
**Steps:**
1. Navigate to `/branch/log-today` (Branch View page)
2. Switch to Company View via dropdown

**Expected Result:**
- Automatically redirects to `/group/overview`
- No error pages

**Repeat for:**
- `/branch/scenario` → Switch to Company View → Redirects to `/group/overview`

### Test 4: Direct URL Access Prevention
**Steps:**
1. Ensure you're in Company View mode
2. Manually type URL: `/branch/log-today` or `/branch/scenario`

**Expected Result:**
- Automatically redirects to `/group/overview`
- No error pages

### Test 5: Page Refresh Persistence
**Steps:**
1. Switch to Branch View
2. Refresh the page (F5 or Cmd+R)

**Expected Result:**
- Menu still shows 6 items (Branch View menu)
- Active tab highlighting is correct

**Repeat for Company View:**
- Switch to Company View
- Refresh page
- Menu still shows 4 items

### Test 6: Mobile Responsive
**Steps:**
1. Open browser DevTools
2. Switch to mobile view (e.g., iPhone 12 Pro)
3. Test navigation menu rendering

**Expected Result:**
- Menu items wrap correctly
- No layout overflow
- Touch interactions work

## Part 2: Log Today Page Testing

### Test 7: Accommodation Business Type
**Prerequisites:**
- Branch with business type = "accommodation" OR
- Branch name contains "hotel", "resort", or "residence" (without "cafe"/"restaurant")

**Steps:**
1. Navigate to `/branch/log-today`
2. Check visible fields

**Expected Result:**
- Revenue field (required) ✓
- Number of Rooms Sold field (required) ✓
- Top 3 Menu % field: **NOT visible** ✗
- Number of Customers field: **NOT visible** ✗

### Test 8: F&B Business Type
**Prerequisites:**
- Branch with business type = "fnb" OR
- Branch name contains "cafe", "restaurant", or "café" (without "hotel"/"resort")

**Steps:**
1. Navigate to `/branch/log-today`
2. Check visible fields

**Expected Result:**
- Revenue field (required) ✓
- Number of Customers field (required) ✓
- % Revenue from Top 3 Menu field (optional) ✓
- Number of Rooms Sold field: **NOT visible** ✗

### Test 9: Hybrid Business Type
**Prerequisites:**
- Branch with business type = "hybrid" OR
- Branch has both accommodation and F&B modules OR
- Branch name contains both accommodation and F&B keywords

**Steps:**
1. Navigate to `/branch/log-today`
2. Check visible fields

**Expected Result:**
- Revenue field (required) ✓
- Number of Rooms Sold field (required) ✓
- Number of Customers field (required) ✓
- % Revenue from Top 3 Menu field (optional) ✓

### Test 10: Business Type Detection Fallback
**Steps:**
1. Create a branch with no `business_type` field and no `modules` array
2. Name it something like "Test Branch"
3. Navigate to `/branch/log-today`

**Expected Result:**
- Defaults to F&B business type
- Shows F&B fields (Customers + Top 3 Menu %)

### Test 11: Validation Rules
**Test Accommodation:**
1. Navigate to `/branch/log-today` (accommodation branch)
2. Leave Revenue empty → Click Save
3. Leave Rooms Sold empty → Click Save

**Expected Result:**
- Error messages appear for missing required fields
- Form does not submit

**Test F&B:**
1. Navigate to `/branch/log-today` (F&B branch)
2. Leave Revenue empty → Click Save
3. Leave Customers empty → Click Save

**Expected Result:**
- Error messages appear for missing required fields
- Form does not submit
- Top 3 Menu % can be left empty (optional)

**Test Hybrid:**
1. Navigate to `/branch/log-today` (hybrid branch)
2. Leave Revenue empty → Click Save
3. Leave Rooms Sold empty → Click Save
4. Leave Customers empty → Click Save

**Expected Result:**
- Error messages appear for all missing required fields
- Form does not submit

### Test 12: Top 3 Menu % Validation
**Steps:**
1. Navigate to `/branch/log-today` (F&B or hybrid branch)
2. Enter invalid Top 3 Menu % values:
   - Negative number (e.g., -10)
   - Over 100 (e.g., 150)
   - Non-numeric text

**Expected Result:**
- Error message: "Percentage must be between 0-100"
- Form does not submit

### Test 13: Rooms Sold Validation (Accommodation)
**Steps:**
1. Navigate to `/branch/log-today` (accommodation branch)
2. Enter Rooms Sold > rooms_available (from branch setup)
3. Enter negative Rooms Sold

**Expected Result:**
- Error message: "Rooms sold cannot exceed X rooms" (if exceeds capacity)
- Error message: "Rooms sold must be >= 0" (if negative)
- Form does not submit

### Test 14: Data Saving
**Steps:**
1. Fill in all required fields correctly
2. Optionally fill Top 3 Menu % (for F&B/hybrid)
3. Click "Save Today"

**Expected Result:**
- Success message appears
- System Preview section shows calculated values
- Data is saved to `daily_metrics` table
- `top3_menu_pct` column is populated (if provided)

### Test 15: Browser Console Logs
**Steps:**
1. Open browser DevTools Console
2. Navigate to `/branch/log-today`
3. Check console logs

**Expected Result (Development Mode):**
- `[LogToday] Business type detection:` log appears
- Shows: `businessType`, `effectiveBusinessType`, `isAccommodation`, `isFnb`, `isHybrid`
- No errors or warnings

## Part 3: Integration Testing

### Test 16: View Mode Switch During Data Entry
**Steps:**
1. Navigate to `/branch/log-today`
2. Start filling in form fields
3. Switch to Company View (without saving)

**Expected Result:**
- Redirects to `/group/overview`
- No data loss (form wasn't saved anyway)
- Navigation menu updates correctly

### Test 17: Navigation Menu Active State
**Steps:**
1. Navigate to `/branch/log-today`
2. Check navigation menu

**Expected Result:**
- "Log Today" menu item is highlighted/active
- Other items are not highlighted

**Repeat for:**
- `/branch/overview` → "Overview" is active
- `/branch/alerts` → "Alerts" is active
- `/branch/trends` → "Trends" is active
- `/branch/scenario` → "Scenario" is active
- `/branch/settings` → "Settings" is active

### Test 18: Role-Based Access
**Steps:**
1. Login as Branch User (role = 'branch')
2. Try to switch to Company View

**Expected Result:**
- Company View option is NOT available
- Can only access Branch View
- Navigation menu always shows Branch View menu (6 items)

## Troubleshooting

### Issue: Fields not showing on Log Today page
**Check:**
1. Browser console for `[LogToday] Business type detection:` log
2. Verify `businessType` is detected correctly
3. Check if `branchSetup` is loaded
4. Verify branch name contains expected keywords

**Solution:**
- Ensure branch has `business_type` field in database OR
- Ensure branch has `modules` array OR
- Ensure branch name contains keywords (hotel, cafe, etc.)

### Issue: Navigation menu shows wrong items
**Check:**
1. Browser console for view mode
2. Verify `mode` from `useContextMode()` hook
3. Check localStorage: `app_context_mode`

**Solution:**
- Clear localStorage and refresh
- Manually switch view mode via dropdown
- Check if pathname matches expected routes

### Issue: Redirect not working
**Check:**
1. Verify you're in Company View mode (`mode === 'group'`)
2. Check browser console for errors
3. Verify route guards are active

**Solution:**
- Ensure `branch/layout.tsx` route guard is active
- Check if `useEffect` dependencies are correct
- Verify router is available

## Success Criteria

✅ All navigation menu tests pass
✅ All Log Today page tests pass
✅ No console errors
✅ No TypeScript errors
✅ Mobile responsive works
✅ Active state highlighting works
✅ Redirect logic works
✅ Validation works
✅ Data saving works
