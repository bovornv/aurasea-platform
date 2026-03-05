/**
 * UI permission validator for RBAC.
 * Scans the page for elements that should be hidden for the current role.
 * Logs [RBAC_UI_VIOLATION] when a forbidden control is visible.
 * Do NOT modify alert or health engine logic.
 */

import type { RbacRole } from './permission-matrix';
import {
  canAccessCompanySettings,
  canDeleteBranch,
  canLogData,
  canInviteUsers,
  canEditBranchSettings,
} from './permission-matrix';

export type UIElementKind = 'delete' | 'invite' | 'company_settings' | 'branch_settings' | 'log_submit';

const SELECTORS: Record<UIElementKind, string[]> = {
  delete: [
    'button[aria-label*="Delete"]',
    'button[aria-label*="delete"]',
    '[data-rbac="delete-branch"]',
    '[data-rbac="delete"]',
  ],
  invite: [
    '[data-rbac="invite"]',
    'button[aria-label*="Invite"]',
    'button[aria-label*="invite"]',
    'a[href*="invite"]',
  ],
  company_settings: [
    '[data-rbac="company-settings"]',
    'a[href*="/org/"][href*="/settings"]',
  ],
  branch_settings: [
    '[data-rbac="branch-settings"]',
  ],
  log_submit: [
    '[data-rbac="log-today-submit"]',
    'form[data-log-today] button[type="submit"]',
  ],
};

const ROLE_CHECKS: Record<UIElementKind, (role: RbacRole) => boolean> = {
  delete: (r) => canDeleteBranch(r),
  invite: (r) => canInviteUsers(r),
  company_settings: (r) => canAccessCompanySettings(r),
  branch_settings: (r) => canEditBranchSettings(r),
  log_submit: (r) => canLogData(r),
};

/**
 * Run a single selector that is safe for querySelectorAll (no :has-text).
 */
function querySafe(selector: string): Element[] {
  if (typeof document === 'undefined') return [];
  try {
    if (selector.includes(':has-text')) return [];
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Scan the document for UI elements that the role should not see.
 * Logs [RBAC_UI_VIOLATION] for each visible forbidden element.
 */
export function validateUIPermissions(role: RbacRole): { violations: { kind: UIElementKind; selector: string; count: number }[] } {
  const violations: { kind: UIElementKind; selector: string; count: number }[] = [];

  (Object.keys(ROLE_CHECKS) as UIElementKind[]).forEach((kind) => {
    const allowed = ROLE_CHECKS[kind](role);
    if (allowed) return;

    const selectors = SELECTORS[kind];
    for (const sel of selectors) {
      let els = querySafe(sel);
      // company_settings: only org-level settings link, not branch settings (/org/.../branch/.../settings)
      if (kind === 'company_settings' && sel.includes('href')) {
        els = els.filter((el) => {
          const href = (el.getAttribute('href') ?? '').trim();
          return href.includes('/org/') && href.includes('/settings') && !href.includes('/branch/');
        });
      }
      const visible = els.filter(isVisible);
      if (visible.length > 0) {
        violations.push({ kind, selector: sel, count: visible.length });
        if (process.env.NODE_ENV === 'development') {
          console.error(
            `[RBAC_UI_VIOLATION] Role "${role}" should not see "${kind}" but ${visible.length} visible element(s) match "${sel}"`
          );
        }
      }
    }
  });

  return { violations };
}
