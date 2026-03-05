/**
 * Dev-Only Scenario Switcher
 * 
 * Allows switching between test fixtures in development mode.
 * Only visible when TEST_MODE is enabled (dev mode).
 */

'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isTestModeEnabled } from '../services/test-fixture-loader';

const SCENARIOS = [
  { value: '', label: 'None (Production Data)' },
  { value: 'cafe-good', label: 'Café: Good' },
  { value: 'cafe-bad', label: 'Café: Bad' },
  { value: 'cafe-mixed', label: 'Café: Mixed' },
  { value: 'hotel-good', label: 'Hotel: Good' },
  { value: 'hotel-bad', label: 'Hotel: Bad' },
  { value: 'hotel-mixed', label: 'Hotel: Mixed' },
  { value: 'group-good', label: 'Group: Good' },
  { value: 'group-bad', label: 'Group: Bad' },
  { value: 'group-mixed', label: 'Group: Mixed' },
] as const;

export function ScenarioSwitcher() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDevMode(isTestModeEnabled());
  }, []);

  // Don't render if not mounted, not in dev mode, or TEST_MODE not enabled
  if (!mounted || !isDevMode) {
    return null;
  }

  const currentScenario = searchParams.get('scenario') || '';

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newScenario = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    
    if (newScenario) {
      params.set('scenario', newScenario);
    } else {
      params.delete('scenario');
    }

    // Force a reload to apply new fixture data
    // This ensures all services reload with the new scenario and fixture cache is cleared
    const newUrl = params.toString() 
      ? `${pathname}?${params.toString()}`
      : pathname;
    window.location.href = newUrl;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      backgroundColor: '#fef3c7',
      border: '1px solid #fbbf24',
      borderRadius: '6px',
      fontSize: '12px',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    }}>
      <label htmlFor="scenario-switcher" style={{ fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>
        🧪 TEST_MODE:
      </label>
      <select
        id="scenario-switcher"
        value={currentScenario}
        onChange={handleChange}
        style={{
          padding: '0.375rem 0.75rem',
          borderRadius: '4px',
          border: '1px solid #d1d5db',
          backgroundColor: '#ffffff',
          fontSize: '12px',
          color: '#1f2937',
          cursor: 'pointer',
          minWidth: '160px',
          fontWeight: currentScenario ? 500 : 400,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#9ca3af';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#d1d5db';
          e.currentTarget.style.boxShadow = 'none';
        }}
        title="Switch between test fixture scenarios (dev only)"
      >
        {SCENARIOS.map((scenario) => (
          <option key={scenario.value} value={scenario.value}>
            {scenario.label}
          </option>
        ))}
      </select>
      {currentScenario && (
        <span style={{ fontSize: '10px', color: '#92400e', opacity: 0.7 }}>
          Active
        </span>
      )}
    </div>
  );
}
