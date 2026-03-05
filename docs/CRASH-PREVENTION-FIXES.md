# Crash Prevention Fixes

## Issues Found and Fixed

### ✅ Fixed: Branch Null Check in handleSubmit
**Location:** `apps/web/app/branch/log-today/page.tsx`

**Issue:**
- `branch!.id` was used with non-null assertion operator without guard
- If `branch` is null, accessing `branch.id` would crash

**Fix:**
- Added guard check at start of `handleSubmit`:
  ```typescript
  if (!branch) {
    setErrors({
      submit: locale === 'th' ? 'ไม่พบสาขา' : 'No branch selected',
    });
    return;
  }
  ```
- Replaced `branch!.id` with `branch.id` (safe after guard)

### ✅ Fixed: Field Name Mismatch
**Location:** `apps/web/app/branch/log-today/page.tsx`

**Issue:**
- State had `top3MenuPct` but validation/save logic referenced `top3MenuRevenue`
- UI showed old "Revenue from Top 3 Menu" field instead of "% Revenue from Top 3 Menu"

**Fix:**
- Updated state to use `top3MenuPct` consistently
- Updated validation to check percentage (0-100) instead of revenue amount
- Updated save logic to store percentage
- Updated UI to show percentage field with "%" suffix

### ✅ Verified: Safe Number Operations
**Location:** `apps/web/app/utils/safe-number.ts`

**Status:** ✅ Safe
- `safeNumber()` handles all edge cases (NaN, Infinity, null, undefined, strings)
- All numeric operations use `safeNumber()` with fallbacks
- No crashes possible from invalid number conversions

### ✅ Verified: Optional Chaining
**Location:** Multiple files

**Status:** ✅ Safe
- All optional property access uses `?.` operator
- `branchSetup?.rooms_available` is safe
- `branchSetup?.modules` is safe
- `branch?.branchName` is safe

### ✅ Verified: ParseFloat Guards
**Location:** `apps/web/app/branch/log-today/page.tsx`

**Status:** ✅ Safe
- All `parseFloat()` calls are guarded with `isNaN()` checks
- Example:
  ```typescript
  const top3Pct = parseFloat(todayData.top3MenuPct);
  if (isNaN(top3Pct) || top3Pct < 0 || top3Pct > 100) {
    // Handle error
  }
  ```

### ✅ Verified: useEffect Dependencies
**Location:** `apps/web/app/branch/layout.tsx`

**Status:** ✅ Safe
- `setContextMode` is a stable function (doesn't change between renders)
- Guard checks prevent infinite loops:
  - `if (mode !== 'branch')` prevents redundant calls
  - `if (mode === 'group' && pathname === ...)` only redirects when needed

### ✅ Verified: Array Operations
**Location:** `apps/web/app/branch/log-today/page.tsx`

**Status:** ✅ Safe
- `branchSetup.modules` checked with `Array.isArray()` before operations
- `.some()` and `.includes()` only called on confirmed arrays
- Optional chaining prevents crashes: `branchSetup?.modules`

## Remaining Safety Measures

### Defensive Programming Patterns Used:

1. **Null Guards:**
   - `if (!branch) return;`
   - `if (!mounted) return null;`
   - `if (!branchSetup) return null;`

2. **Optional Chaining:**
   - `branchSetup?.modules`
   - `branchSetup?.rooms_available`
   - `branch?.branchName`

3. **Safe Number Conversion:**
   - All user input uses `safeNumber()` or guarded `parseFloat()`
   - Fallback values provided for all conversions

4. **Array Safety:**
   - `Array.isArray()` checks before array operations
   - Optional chaining for array access

5. **Type Guards:**
   - `typeof value === 'string'` checks
   - `isNaN()` checks after `parseFloat()`

## Testing Recommendations

1. **Test with null branch:**
   - Navigate to `/branch/log-today` without branch selected
   - Should show error message, not crash

2. **Test with invalid input:**
   - Enter non-numeric text in percentage field
   - Should show validation error, not crash

3. **Test with missing branchSetup:**
   - Create branch without setup data
   - Should fallback to branch name detection

4. **Test rapid view switching:**
   - Switch between Branch/Company View rapidly
   - Should not cause infinite loops or crashes

## Conclusion

✅ **All identified crash scenarios have been fixed or verified safe**
✅ **Defensive programming patterns in place**
✅ **No breaking changes introduced**
