/**
 * Disable Test Mode and Simulation Mode
 * 
 * Script to force disable both test mode and simulation mode in localStorage.
 * 
 * Usage:
 *   Run this in browser console, or use the disableAllModes() function from TestModeProvider
 */

if (typeof window !== 'undefined') {
  const TEST_MODE_STORAGE_KEY = 'aurasea_test_mode';
  
  // Force disable both modes
  const disabledState = {
    businessType: null,
    scenario: null,
    simulationType: null,
    simulationScenario: 'healthy',
    simulationControls: {},
    version: 0,
  };
  
  localStorage.setItem(TEST_MODE_STORAGE_KEY, JSON.stringify(disabledState));
  
  // Dispatch custom event to notify all tabs/components
  window.dispatchEvent(new CustomEvent('testModeUpdated', {
    detail: disabledState
  }));
  
  console.log('✅ All modes disabled:');
  console.log('  - simulationActive = false');
  console.log('  - testModeActive = false');
  console.log('\n💡 Reload the page to see changes take effect.');
} else {
  console.error('This script must be run in a browser environment');
}
