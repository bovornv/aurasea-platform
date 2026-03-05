// Keyboard shortcuts hook for common actions
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentBranch } from './use-current-branch';
import { useOrgBranchPaths } from './use-org-branch-paths';

type Shortcut = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
};

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      shortcuts.forEach((shortcut) => {
        // Check if modifier keys match (Ctrl/Cmd for Mac)
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
        const requiresModifier = shortcut.ctrlKey || shortcut.metaKey;
        
        const matchesModifier = requiresModifier ? modifierPressed : !modifierPressed;
        const matchesShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
        const matchesKey = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (matchesModifier && matchesShift && matchesKey) {
          e.preventDefault();
          shortcut.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// Common shortcuts for the platform
export function usePlatformShortcuts() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { branch } = useCurrentBranch();

  useKeyboardShortcuts([
    {
      key: 'u',
      ctrlKey: true,
      action: () => {
        if (paths.orgId && branch?.id) {
          router.push(`/org/${paths.orgId}/branch/${branch.id}/metrics`);
        } else {
          router.push(paths.branchOverview || '/branch/overview');
        }
      },
      description: 'Update latest metrics',
    },
    {
      key: 'h',
      ctrlKey: true,
      action: () => router.push(paths.branchOverview || '/branch/overview'),
      description: 'Go to overview',
    },
    {
      key: 'a',
      ctrlKey: true,
      action: () => router.push(paths.branchAlerts || '/branch/alerts'),
      description: 'View alerts',
    },
    {
      key: '/',
      ctrlKey: false,
      action: () => {
        // Focus search if on alerts page
        const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
        if (searchInput && document.activeElement !== searchInput) {
          searchInput.focus();
        }
      },
      description: 'Focus search',
    },
    {
      key: 'r',
      ctrlKey: true,
      action: () => {
        // Trigger refresh if refresh button exists
        const refreshButton = document.querySelector('button[aria-label*="Refresh"]') as HTMLButtonElement;
        if (refreshButton) {
          refreshButton.click();
        }
      },
      description: 'Refresh data',
    },
    {
      key: 'Escape',
      ctrlKey: false,
      action: () => {
        // Clear search if focused
        const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]') as HTMLInputElement;
        if (searchInput && document.activeElement === searchInput && (searchInput as any).value) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.blur();
        }
      },
      description: 'Clear search',
    },
  ]);
}
