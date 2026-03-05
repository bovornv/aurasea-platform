/**
 * Test Mode Provider
 * 
 * Global context for TEST_MODE state that persists across all tabs/pages.
 * Provides centralized test mode state management with version tracking
 * to trigger data reloads across all pages.
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { BusinessType, Scenario } from '../services/scenario-registry';

const TEST_MODE_STORAGE_KEY = 'aurasea_test_mode';

export type SimulationType = 'big_accommodation' | 'fnb_multi_branch' | 'accommodation_with_fnb' | null;
export type SimulationScenario = 'healthy' | 'stressed' | 'crisis';

export interface SimulationControls {
  revenueMultiplier?: number;
  costMultiplier?: number;
  cashAdjustment?: number;
}

interface TestModeState {
  businessType: BusinessType | null;
  scenario: Scenario | null;
  simulationType: SimulationType;
  simulationScenario: SimulationScenario;
  simulationControls: SimulationControls;
  version: number; // Incremented on Update Data to trigger reloads
}

interface TestModeContextType {
  testMode: TestModeState;
  setTestMode: (businessType: BusinessType | null, scenario: Scenario | null) => void;
  setSimulation: (type: SimulationType, scenario: SimulationScenario, controls?: SimulationControls) => void;
  applyTestMode: () => void; // Increments version and triggers reload
  disableAllModes: () => void; // Force disable both simulation and test mode
}

const TestModeContext = createContext<TestModeContextType | undefined>(undefined);

function loadTestModeFromStorage(): TestModeState {
  if (typeof window === 'undefined') {
    return {
      businessType: null,
      scenario: null,
      simulationType: null,
      simulationScenario: 'healthy',
      simulationControls: {},
      version: 0,
    };
  }
  
  try {
    const stored = localStorage.getItem(TEST_MODE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        businessType: parsed.businessType || null,
        scenario: parsed.scenario || null,
        simulationType: parsed.simulationType || null,
        simulationScenario: parsed.simulationScenario || 'healthy',
        simulationControls: parsed.simulationControls || {},
        version: parsed.version || 0,
      };
    }
  } catch (e) {
    console.warn('[TEST_MODE] Failed to load from localStorage:', e);
  }
  
  return {
    businessType: null,
    scenario: null,
    simulationType: null,
    simulationScenario: 'healthy',
    simulationControls: {},
    version: 0,
  };
}

function saveTestModeToStorage(state: TestModeState): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(TEST_MODE_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[TEST_MODE] Failed to save to localStorage:', e);
  }
}

export function TestModeProvider({ children }: { children: ReactNode }) {
  const [testMode, setTestModeState] = useState<TestModeState>(() => {
    return loadTestModeFromStorage();
  });

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadTestModeFromStorage();
    if (stored.businessType || stored.scenario || stored.simulationType) {
      setTestModeState(stored);
    }
  }, []);

  // Listen for localStorage changes (cross-tab synchronization) and custom events (same-tab)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TEST_MODE_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setTestModeState({
            businessType: parsed.businessType || null,
            scenario: parsed.scenario || null,
            simulationType: parsed.simulationType || null,
            simulationScenario: parsed.simulationScenario || 'healthy',
            simulationControls: parsed.simulationControls || {},
            version: parsed.version || 0,
          });
          console.log('[TEST_MODE] State synced from another tab:', parsed);
        } catch (err) {
          console.error('[TEST_MODE] Failed to parse storage change:', err);
        }
      }
    };

    const handleTestModeUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setTestModeState(customEvent.detail);
        console.log('[TEST_MODE] State updated from same tab:', customEvent.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('testModeUpdated', handleTestModeUpdated);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('testModeUpdated', handleTestModeUpdated);
    };
  }, []);

  const setTestMode = useCallback((businessType: BusinessType | null, scenario: Scenario | null) => {
    setTestModeState((prev) => {
      const newState = {
        ...prev,
        businessType,
        scenario: scenario || (businessType ? 'good' : null),
        version: prev.version, // Don't increment version on selection change
      };
      saveTestModeToStorage(newState);
      console.log(`[TEST_MODE] State updated:`, newState);
      return newState;
    });
  }, []);

  const setSimulation = useCallback((
    type: SimulationType,
    scenario: SimulationScenario,
    controls: SimulationControls = {}
  ) => {
    setTestModeState((prev) => {
      const newState = {
        ...prev,
        simulationType: type,
        simulationScenario: scenario,
        simulationControls: controls,
        version: prev.version, // Don't increment version on selection change
      };
      saveTestModeToStorage(newState);
      console.log(`[SIMULATION] State updated:`, newState);
      return newState;
    });
  }, []);

  const applyTestMode = useCallback(() => {
    setTestModeState((prev) => {
      // Check if simulation mode is active
      if (prev.simulationType) {
        const newState = {
          ...prev,
          version: prev.version + 1, // Increment version to trigger reloads
        };
        saveTestModeToStorage(newState);
        
        // Dispatch custom event for same-tab synchronization
        // (storage event fires automatically for cross-tab sync)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('testModeUpdated', {
            detail: newState
          }));
        }
        
        console.log(`[SIMULATION] Apply clicked - version incremented to:`, newState.version);
        console.log(`[SIMULATION] State:`, { 
          simulationType: newState.simulationType, 
          simulationScenario: newState.simulationScenario,
          simulationControls: newState.simulationControls 
        });
        return newState;
      }
      
      // Check if TEST_MODE is active
      if (!prev.businessType || !prev.scenario) {
        console.warn('[TEST_MODE] Cannot apply: businessType or scenario missing');
        return prev;
      }
      
      const newState = {
        ...prev,
        version: prev.version + 1, // Increment version to trigger reloads
      };
      saveTestModeToStorage(newState);
      
      // Dispatch custom event for same-tab synchronization
      // (storage event fires automatically for cross-tab sync)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('testModeUpdated', {
          detail: newState
        }));
      }
      
      console.log(`[TEST_MODE] Apply clicked - version incremented to:`, newState.version);
      console.log(`[TEST_MODE] State:`, { businessType: newState.businessType, scenario: newState.scenario });
      return newState;
    });
  }, []);

  const disableAllModes = useCallback(() => {
    const newState: TestModeState = {
      businessType: null,
      scenario: null,
      simulationType: null,
      simulationScenario: 'healthy',
      simulationControls: {},
      version: 0,
    };
    setTestModeState(newState);
    saveTestModeToStorage(newState);
    
    // Dispatch custom event for same-tab synchronization
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('testModeUpdated', {
        detail: newState
      }));
    }
    
    console.log('[TEST_MODE] All modes disabled (simulationActive=false, testModeActive=false)');
  }, []);

  return (
    <TestModeContext.Provider
      value={{
        testMode,
        setTestMode,
        setSimulation,
        applyTestMode,
        disableAllModes,
      }}
    >
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);
  if (context === undefined) {
    throw new Error('useTestMode must be used within TestModeProvider');
  }
  return context;
}
