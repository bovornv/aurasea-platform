/**
 * Global Header Component
 *
 * Top-level header: View Switcher (left), Language + User Menu (right).
 * Language is per-user preference; visible to all authenticated users (no branch settings required).
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
      alignItems: 'center',
      paddingBottom: '1rem',
      marginBottom: '1rem',
      borderBottom: '1px solid #e5e7eb',
      position: 'relative',
      zIndex: 100,
    }}>
      <div style={{ position: 'relative', zIndex: 101 }}>
        <ViewSwitcherDropdown />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 101 }}>
        <LanguageSwitcher />
        <UserMenuButton />
      </div>
    </div>
  );
}
