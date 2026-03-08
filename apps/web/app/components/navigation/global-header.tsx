/**
 * Global Header Component
 *
 * Hierarchy: AuraSea → [Company selector]
 * Language is per-user preference; visible to all authenticated users.
 */
'use client';

import { ViewSwitcherDropdown } from './view-switcher-dropdown';
import { UserMenuButton } from './user-menu-button';
import { LanguageSwitcher } from '../language-switcher';

export function GlobalHeader() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingBottom: '1rem',
      marginBottom: '1rem',
      borderBottom: '1px solid #e5e7eb',
      position: 'relative',
      zIndex: 100,
    }}>
      <div style={{ position: 'relative', zIndex: 101, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#6B7280',
          letterSpacing: '-0.01em',
        }}>
          AuraSea
        </div>
        <ViewSwitcherDropdown />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 101 }}>
        <LanguageSwitcher />
        <UserMenuButton />
      </div>
    </div>
  );
}
