/**
 * Cache Invalidation Utility
 * 
 * PART 4: Comprehensive cache clearing when organization changes.
 * Ensures no cached health values are reused between organizations.
 */

/**
 * Clear all derived state from localStorage
 * Called when organization changes to ensure full recalculation
 */
export function invalidateAllDerivedState(): void {
  if (typeof window === 'undefined') return;
  
  const keysToRemove: string[] = [];
  
  // Scan all localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    // Health scores
    if (key.startsWith('health_score_')) {
      keysToRemove.push(key);
    }
    
    // Alerts cache
    if (key.startsWith('alerts_')) {
      keysToRemove.push(key);
    }
    
    // Revenue exposure
    if (key.startsWith('revenue_exposure_')) {
      keysToRemove.push(key);
    }
    
    // Company health history
    if (key.startsWith('company_health_')) {
      keysToRemove.push(key);
    }
    
    // Branch health history
    if (key.startsWith('branch_health_')) {
      keysToRemove.push(key);
    }
    
    // Health score history
    if (key.startsWith('health_history_')) {
      keysToRemove.push(key);
    }
    
    // Trend data
    if (key.startsWith('trend_')) {
      keysToRemove.push(key);
    }
    
    // Metrics cache (but keep raw metrics)
    if (key.startsWith('metrics_cache_')) {
      keysToRemove.push(key);
    }
    
    // Signal cache
    if (key.startsWith('signals_cache_')) {
      keysToRemove.push(key);
    }
    
    // PART 2: Remove simulation/scenario/mock localStorage keys
    if (key.startsWith('scenario_')) {
      keysToRemove.push(key);
    }
    if (key.startsWith('simulation_')) {
      keysToRemove.push(key);
    }
    if (key.startsWith('mock_')) {
      keysToRemove.push(key);
    }
    // Also remove aurasea_test_mode if it contains simulation
    if (key === 'aurasea_test_mode') {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const parsed = JSON.parse(value);
          if (parsed.simulationType || parsed.simulationScenario) {
            keysToRemove.push(key);
          }
        }
      } catch (e) {
        // If parse fails, remove it anyway
        keysToRemove.push(key);
      }
    }
    // Remove scenario_simulations key
    if (key === 'scenario_simulations') {
      keysToRemove.push(key);
    }
  }
  
  // Remove all identified keys
  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[CacheInvalidation] Failed to remove key ${key}:`, e);
    }
  });
  
  console.log(`[CacheInvalidation] Cleared ${keysToRemove.length} cached items`);
  console.log('[CacheInvalidation] Full recalculation will be triggered');
}

/**
 * Clear specific branch's derived state
 */
export function invalidateBranchState(branchId: string): void {
  if (typeof window === 'undefined' || !branchId) return;
  
  const patterns = [
    `health_score_${branchId}`,
    `alerts_${branchId}`,
    `revenue_exposure_${branchId}`,
    `branch_health_${branchId}`,
    `health_history_${branchId}`,
    `trend_${branchId}`,
    `metrics_cache_${branchId}`,
    `signals_cache_${branchId}`,
  ];
  
  patterns.forEach(pattern => {
    try {
      localStorage.removeItem(pattern);
    } catch (e) {
      // Ignore errors
    }
  });
}

/**
 * Clear organization-level derived state
 */
export function invalidateOrganizationState(organizationId: string): void {
  if (typeof window === 'undefined' || !organizationId) return;
  
  // Clear all keys that might contain organization-specific data
  invalidateAllDerivedState();
  
  // Also clear organization-specific keys
  const orgPatterns = [
    `org_${organizationId}_health`,
    `org_${organizationId}_alerts`,
    `org_${organizationId}_exposure`,
  ];
  
  orgPatterns.forEach(pattern => {
    try {
      localStorage.removeItem(pattern);
    } catch (e) {
      // Ignore errors
    }
  });
}
