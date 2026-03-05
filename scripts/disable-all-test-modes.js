/**
 * Completely Disable TEST_MODE and Simulation Mode
 * 
 * Run this script in browser console to completely disable both modes.
 * This clears localStorage and ensures the app uses only real database data.
 * 
 * Usage: Copy and paste into browser console
 */

(function disableAllTestModes() {
  if (typeof window === 'undefined') {
    console.error('❌ This script must be run in a browser environment');
    return;
  }

  const TEST_MODE_STORAGE_KEY = 'aurasea_test_mode';
  
  // Clear all test mode data
  const disabledState = {
    businessType: null,
    scenario: null,
    simulationType: null,
    simulationScenario: 'healthy',
    simulationControls: {},
    version: 0,
  };
  
  // Remove from localStorage
  localStorage.removeItem(TEST_MODE_STORAGE_KEY);
  
  // Also set to disabled state (in case components check for null vs missing)
  localStorage.setItem(TEST_MODE_STORAGE_KEY, JSON.stringify(disabledState));
  
  // Dispatch custom event to notify all tabs/components
  window.dispatchEvent(new CustomEvent('testModeUpdated', {
    detail: disabledState
  }));
  
  // Also dispatch storage event for cross-tab sync
  window.dispatchEvent(new StorageEvent('storage', {
    key: TEST_MODE_STORAGE_KEY,
    newValue: JSON.stringify(disabledState),
    oldValue: localStorage.getItem(TEST_MODE_STORAGE_KEY),
    storageArea: localStorage
  }));
  
  console.log('✅ TEST_MODE and Simulation Mode COMPLETELY DISABLED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✓ simulationActive = false');
  console.log('  ✓ testModeActive = false');
  console.log('  ✓ localStorage cleared');
  console.log('  ✓ All components notified');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Reload the page to see changes take effect.');
  console.log('💡 The app will now use ONLY real database data from Supabase.');
})();
