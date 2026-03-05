/**
 * RBAC audit logging — inserts into rbac_audit_log.
 * Client-side: only runs in development to avoid 401/RLS noise. Server (API) may still call insertRbacAudit.
 * Insert failures (401, RLS) are silently ignored; never block UI.
 */

import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const isRlsOrAuthError = (error: { code?: string; message?: string }): boolean =>
  error.code === '42501' ||
  error.code === '401' ||
  error.code === '403' ||
  (error.message != null && (
    error.message.includes('row-level security') ||
    error.message.includes('RLS') ||
    error.message.includes('403') ||
    error.message.includes('401')
  ));

export type RbacAuditAction =
  | 'invitation_created'
  | 'invitation_accepted'
  | 'permission_denied'
  | 'role_assigned'
  | 'role_removed';

export interface RbacAuditPayload {
  action: RbacAuditAction;
  targetType: string;
  targetId: string | null;
  organizationId?: string | null;
  branchId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

export interface RbacAuditDetails {
  email?: string;
  role?: string;
  organization_id?: string;
  branch_id?: string;
  invitation_id?: string;
  path?: string;
  [key: string]: unknown;
}

function buildAuditRow(
  actorId: string,
  payload: RbacAuditPayload
): Record<string, unknown> {
  return {
    action: payload.action,
    actor_id: actorId,
    target_type: payload.targetType,
    target_id: payload.targetId,
    organization_id: payload.organizationId ?? null,
    branch_id: payload.branchId ?? null,
    ip_address: payload.ipAddress ?? null,
    user_agent: payload.userAgent ?? null,
    details: (payload.details ?? {}) as Record<string, unknown>,
  };
}

/**
 * Insert audit row. Never throws. RLS/401/403: silently ignore; only console.debug in development.
 */
export async function insertRbacAudit(
  supabase: SupabaseClient,
  actorId: string,
  payload: RbacAuditPayload
): Promise<void> {
  if (!actorId) return;
  try {
    const row = buildAuditRow(actorId, payload);
    const { error } = await supabase.from('rbac_audit_log').insert(row as never);
    if (error) {
      if (isRlsOrAuthError(error)) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[RBAC Audit] Insert skipped (RLS/auth):', error.message);
        }
        return;
      }
      if (process.env.NODE_ENV === 'development') {
        console.debug('[RBAC Audit] Insert failed:', error.message);
      }
      return;
    }
  } catch (_) {
    return;
  }
}

/**
 * Client-side only. In production, no-op to avoid 401/RLS console noise. In development, log to rbac_audit_log.
 * Never throws; audit failure must not affect UI.
 */
export async function logRbacAudit(
  action: RbacAuditAction,
  targetType: string,
  targetId: string | null,
  details: RbacAuditDetails,
  options?: { organizationId?: string | null; branchId?: string | null; ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  if (!isSupabaseAvailable()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  const userAgent = options?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null);
  await insertRbacAudit(supabase, user.id, {
    action,
    targetType,
    targetId,
    organizationId: options?.organizationId ?? details.organization_id ?? null,
    branchId: options?.branchId ?? details.branch_id ?? null,
    ipAddress: options?.ipAddress ?? null,
    userAgent,
    details: details as Record<string, unknown>,
  });
}
