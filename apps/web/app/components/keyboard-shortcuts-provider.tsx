// Keyboard shortcuts provider - adds global shortcuts
'use client';

import { usePlatformShortcuts } from '../hooks/use-keyboard-shortcuts';

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  usePlatformShortcuts();
  return <>{children}</>;
}
