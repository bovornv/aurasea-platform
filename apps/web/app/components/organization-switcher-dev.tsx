/**
 * Developer Organization Switcher
 * 
 * PART 3: Temporary developer-only dropdown for switching organizations.
 * Only visible in development mode.
 */

'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '../contexts/organization-context';

export function OrganizationSwitcherDev() {
  const { activeOrganizationId, organizations, setActiveOrganizationId, isLoading } = useOrganization();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only show in development mode
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  if (!mounted) {
    return null;
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newOrgId = e.target.value;
    if (newOrgId && newOrgId !== activeOrganizationId) {
      await setActiveOrganizationId(newOrgId);
      // Reload page to trigger full recalculation
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        backgroundColor: '#f9fafb',
        marginBottom: '1.5rem',
      }}
    >
      <label
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
          color: '#374151',
        }}
      >
        Developer Scenario Switch
      </label>
      <select
        value={activeOrganizationId || ''}
        onChange={handleChange}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '0.5rem',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          fontSize: '0.875rem',
          backgroundColor: '#ffffff',
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name} ({org.id})
          </option>
        ))}
      </select>
      {isLoading && (
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
          Loading...
        </p>
      )}
      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
        Switching organization will reload all data and recalculate health scores, alerts, and exposure.
      </p>
    </div>
  );
}
