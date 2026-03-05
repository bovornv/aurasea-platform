/**
 * Invite modal — operational, calm. Email, role (with short description), optional branch selector.
 * Permissions enforced by /api/invite (RLS-backed); UI only reflects allowed scope.
 */
'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '../hooks/use-i18n';
import { useOrganization } from '../contexts/organization-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';
import { useUserSession } from '../contexts/user-session-context';

export type InviteContext = 'organization' | 'branch';

interface InviteModalProps {
  context: InviteContext;
  organizationId: string | null;
  branchId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const ROLE_OPTIONS_ORG: { value: string; labelEn: string; labelTh: string; descEn: string; descTh: string }[] = [
  { value: 'admin', labelEn: 'Admin', labelTh: 'แอดมิน', descEn: 'Can view all branches and manage team access.', descTh: 'ดูทุกสาขาและจัดการการเข้าถึงทีม' },
];

const ROLE_OPTIONS_BRANCH: { value: string; labelEn: string; labelTh: string; descEn: string; descTh: string }[] = [
  { value: 'manager', labelEn: 'Manager', labelTh: 'ผู้จัดการสาขา', descEn: 'Can manage this branch and invite branch users.', descTh: 'จัดการสาขานี้และเชิญผู้ใช้สาขาได้' },
  { value: 'staff', labelEn: 'Staff', labelTh: 'พนักงาน', descEn: 'Can log data and view this branch.', descTh: 'บันทึกข้อมูลและดูสาขานี้ได้' },
  { value: 'viewer', labelEn: 'Viewer', labelTh: 'ผู้ดู', descEn: 'View-only access to this branch.', descTh: 'ดูอย่างเดียว' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function InviteModal({ context, organizationId, branchId, onClose, onSuccess }: InviteModalProps) {
  const { t, locale } = useI18n();
  const { activeOrganizationId } = useOrganization();
  const { permissions } = useUserSession();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(context === 'organization' ? 'admin' : 'staff');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(context === 'branch' ? branchId || '' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; emailSent?: boolean; emailError?: string } | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const orgId = context === 'organization' ? (organizationId || activeOrganizationId) : null;
  const branches = orgId && typeof window !== 'undefined'
    ? businessGroupService.getAllBranches().filter((b) => b.businessGroupId === orgId)
    : [];
  const inviteToBranch = context === 'organization' && !!selectedBranchId;
  const roleOptions = context === 'branch' || inviteToBranch ? ROLE_OPTIONS_BRANCH : ROLE_OPTIONS_ORG;
  const showBranchSelector = context === 'organization' && branches.length >= 1;

  useEffect(() => {
    if (inviteToBranch && role === 'admin') setRole('staff');
    if (!inviteToBranch && context === 'organization' && role !== 'admin') setRole('admin');
  }, [inviteToBranch, context, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorToast(null);
    setResult(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError(locale === 'th' ? 'กรุณากรอกอีเมล' : 'Email is required');
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError(locale === 'th' ? 'รูปแบบอีเมลไม่ถูกต้อง' : 'Invalid email format');
      return;
    }
    if (!role) {
      setError(locale === 'th' ? 'กรุณาเลือกบทบาท' : 'Please select a role');
      return;
    }
    const isBranchInvite = context === 'branch' || inviteToBranch;
    const payload: { email: string; role: string; organizationId?: string; branchId?: string } = {
      email: trimmed,
      role,
      organizationId: isBranchInvite ? undefined : orgId ?? undefined,
      branchId: context === 'branch' ? (branchId ?? undefined) : inviteToBranch ? (selectedBranchId ?? undefined) : undefined,
    };
    setLoading(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || (locale === 'th' ? 'ส่งคำเชิญไม่สำเร็จ' : 'Failed to send invite');
        setError(msg);
        setErrorToast(msg);
        if (process.env.NODE_ENV === 'development') {
          console.error('[InviteModal] Invite failed:', { status: res.status, error: data.error, payload: { email: trimmed, role, organizationId: payload.organizationId, branchId: payload.branchId } });
        }
        return;
      }
      setResult({
        link: data.invitation?.inviteLink || '',
        emailSent: data.invitation?.emailSent,
        emailError: data.invitation?.emailError,
      });
      setEmail('');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      setErrorToast(msg);
      if (process.env.NODE_ENV === 'development') {
        console.error('[InviteModal] Invite request error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const isOrgInvite = context === 'organization';
  const body = isOrgInvite
    ? { organizationId: orgId, branchId: undefined }
    : { organizationId: undefined, branchId };
  if (isOrgInvite && !orgId) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
        <div style={{ background: '#fff', borderRadius: '8px', padding: '1.5rem', maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: '#6b7280' }}>{locale === 'th' ? 'เลือกองค์กรก่อน' : 'Select an organization first.'}</p>
          <button type="button" onClick={onClose} style={{ marginTop: '1rem', padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>{t('common.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', maxWidth: '420px', width: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0a0a0a', marginBottom: '1rem' }}>
          {locale === 'th' ? 'แชร์มุมมองกับทีม' : 'Share this view with your team'}
        </h3>
        {result?.link ? (
          <div style={{ marginBottom: '1rem' }}>
            {result.emailSent ? (
              <p style={{ fontSize: '14px', color: '#166534' }}>{locale === 'th' ? 'ส่งลิงก์ไปยังอีเมลแล้ว' : 'Invite link sent to email.'}</p>
            ) : result.emailError ? (
              <p style={{ fontSize: '14px', color: '#b45309' }}>{locale === 'th' ? 'ส่งอีเมลไม่สำเร็จ — แชร์ลิงก์ด้านล่าง' : 'Email could not be sent. Share the link below.'}</p>
            ) : (
              <p style={{ fontSize: '14px', color: '#6b7280' }}>{locale === 'th' ? 'แชร์ลิงก์นี้' : 'Share this link:'}</p>
            )}
            <code style={{ fontSize: '12px', wordBreak: 'break-all', display: 'block', marginTop: '0.5rem', padding: '0.5rem', background: '#f3f4f6', borderRadius: '4px' }}>{result.link}</code>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            {showBranchSelector && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>{locale === 'th' ? 'สาขา' : 'Branch'}</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                >
                  <option value="">{locale === 'th' ? '— เชิญเป็นผู้จัดการองค์กร —' : '— Invite as org manager —'}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.branchName}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '0.25rem' }}>{locale === 'th' ? 'บทบาท' : 'Role'}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{locale === 'th' ? opt.labelTh : opt.labelEn}</option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem', lineHeight: 1.4 }}>
                {locale === 'th' ? roleOptions.find((o) => o.value === role)?.descTh : roleOptions.find((o) => o.value === role)?.descEn}
              </p>
            </div>
            {(error || errorToast) && (
              <p style={{ fontSize: '13px', color: '#dc2626', marginBottom: '0.75rem' }} role="alert">
                {error || errorToast}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>{t('common.cancel')}</button>
              <button type="submit" disabled={loading || !email.trim() || !role} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: loading || !email.trim() || !role ? '#9ca3af' : '#0a0a0a', color: '#fff', cursor: loading || !email.trim() || !role ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                {loading ? (locale === 'th' ? 'กำลังส่ง...' : 'Sending...') : (locale === 'th' ? 'ส่งคำเชิญ' : 'Send invite')}
              </button>
            </div>
          </form>
        )}
        {result?.link && (
          <button type="button" onClick={onClose} style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>{locale === 'th' ? 'ปิด' : 'Close'}</button>
        )}
      </div>
    </div>
  );
}
