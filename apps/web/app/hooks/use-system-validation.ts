/**
 * System Validation Hook
 *
 * Full integrity validation runs only for owner/admin. Manager, staff, viewer get passed (no org-level checks).
 * OPTIMIZED: Uses singleton pattern to prevent multiple instances running simultaneously.
 */

import { useEffect, useState } from 'react';
import { validateSystemIntegrity } from '../utils/system-integrity-validator';
import { devWarn } from '../lib/dev-log';
import { businessGroupService } from '../services/business-group-service';
import { useOrganization } from '../contexts/organization-context';
import { useUserSession } from '../contexts/user-session-context';
import { useUserRole } from '../contexts/user-role-context';
import { useCurrentBranch } from './use-current-branch';

let globalValidationInterval: NodeJS.Timeout | null = null;
let globalValidationRunning = false;
let globalValidationSubscribers = new Set<() => void>();

/** Getters set by hook so validation runs only when data is resolved (interval sees latest). */
let getSessionRef: (() => boolean) | null = null;
let getOrganizationRef: (() => ReturnType<typeof businessGroupService.getBusinessGroup>) | null = null;
let getBranchRef: (() => unknown) | null = null;
/** Returns undefined when role not yet loaded, string | null when resolved. */
let getEffectiveRoleRef: (() => string | null | undefined) | null = null;

function subscribeToValidation(callback: () => void): () => void {
  globalValidationSubscribers.add(callback);
  return () => {
    globalValidationSubscribers.delete(callback);
  };
}

function notifyValidationComplete() {
  globalValidationSubscribers.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('[SYSTEM VALIDATION] Subscriber callback failed:', e);
    }
  });
}

async function runValidationOnce(): Promise<void> {
  if (globalValidationRunning) return;

  if (!getSessionRef?.()) return;
  const organization = getOrganizationRef?.() ?? null;
  if (!organization) return;
  if (!getBranchRef?.()) return;
  const effectiveRole = getEffectiveRoleRef?.();
  if (effectiveRole === undefined) return;

  globalValidationRunning = true;

  try {
    const result = await validateSystemIntegrity(organization.id, {
      autoFix: false,
      verbose: false,
      effectiveRole: effectiveRole ?? null,
    });

    if (!result.passed) {
      devWarn('[SYSTEM VALIDATION] Issues found:', {
        errors: result.errors.length,
        warnings: result.warnings.length,
        errorMessages: result.errors.slice(0, 5).map(e => e.message),
      });
    }

    notifyValidationComplete();
  } catch (e) {
    console.error('[SYSTEM VALIDATION] Failed:', e);
  } finally {
    globalValidationRunning = false;
  }
}

export function useSystemValidation(options: {
  enabled?: boolean;
  interval?: number;
} = {}) {
  const { enabled = process.env.NODE_ENV === 'development', interval = 120000 } = options;
  const { activeOrganizationId } = useOrganization();
  const { isLoggedIn } = useUserSession();
  const { role } = useUserRole();
  const { branch } = useCurrentBranch();
  const [lastValidation, setLastValidation] = useState<Date | null>(null);

  useEffect(() => {
    getSessionRef = () => isLoggedIn;
    getOrganizationRef = () => businessGroupService.getBusinessGroup();
    getBranchRef = () => branch ?? null;
    getEffectiveRoleRef = () => (role === null ? undefined : role?.effectiveRole ?? null);
    return () => {
      getSessionRef = null;
      getOrganizationRef = null;
      getBranchRef = null;
      getEffectiveRoleRef = null;
    };
  }, [isLoggedIn, branch, role]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    if (!globalValidationInterval) {
      runValidationOnce().then(() => setLastValidation(new Date()));
      globalValidationInterval = setInterval(() => {
        runValidationOnce().then(notifyValidationComplete);
      }, interval);
    }

    const unsubscribe = subscribeToValidation(() => setLastValidation(new Date()));
    return () => {
      unsubscribe();
    };
  }, [enabled, interval]);

  return {
    lastValidation,
  };
}

// Cleanup function for app shutdown (optional, but good practice)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (globalValidationInterval) {
      clearInterval(globalValidationInterval);
      globalValidationInterval = null;
    }
  });
}
