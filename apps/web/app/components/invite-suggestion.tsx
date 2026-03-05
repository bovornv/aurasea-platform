/**
 * Invite suggestion — shown after dashboard loads. Calm, operational copy.
 * Org view: "Share this view with your team" / "Keep your team aligned"
 * Branch view: "Add your branch manager"
 * Only rendered when user can invite (permissions enforced by API/RLS).
 */
'use client';

import { useState } from 'react';
import { useI18n } from '../hooks/use-i18n';
import { useRBAC } from '../hooks/use-rbac';
import { InviteModal, type InviteContext } from './invite-modal';
import { useOrganization } from '../contexts/organization-context';
import { useParams } from 'next/navigation';

interface InviteSuggestionProps {
  /** 'organization' = org-level overview; 'branch' = branch overview */
  context: 'organization' | 'branch';
  organizationId: string | null;
  branchId: string | null;
}

export function InviteSuggestion({ context, organizationId, branchId }: InviteSuggestionProps) {
  const { locale } = useI18n();
  const { canAccessCompanySettings, canAccessBranchSettings } = useRBAC();
  const { activeOrganizationId } = useOrganization();
  const params = useParams();
  const [modalOpen, setModalOpen] = useState(false);

  const orgId = organizationId || activeOrganizationId || (params?.orgId as string) || null;
  const canInviteOrg = canAccessCompanySettings;
  const canInviteBranch = canAccessBranchSettings;

  const showOrgInvite = context === 'organization' && canInviteOrg && orgId;
  const showBranchInvite = context === 'branch' && canInviteBranch && branchId;

  if (!showOrgInvite && !showBranchInvite) return null;

  const copy =
    context === 'organization'
      ? locale === 'th'
        ? 'แชร์มุมมองนี้กับทีม'
        : 'Share this view with your team'
      : locale === 'th'
        ? 'เพิ่มผู้จัดการสาขาของคุณ'
        : 'Add your branch manager';

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        style={{
          padding: '0.5rem 0.75rem',
          fontSize: '13px',
          color: '#6b7280',
          background: 'transparent',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {copy}
      </button>
      {modalOpen && (
        <InviteModal
          context={context as InviteContext}
          organizationId={orgId}
          branchId={branchId}
          onClose={() => setModalOpen(false)}
          onSuccess={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
