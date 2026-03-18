/**
 * Unified View Switcher Dropdown
 * 
 * Combines organization switcher and view mode selector into a single dropdown
 * Shows company name or branch name based on current view
 * When expanded, shows company (Company View) and branches (Branch Views)
 */
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useI18n } from '../../hooks/use-i18n';
import { useUserSession } from '../../contexts/user-session-context';
import { useRBAC } from '../../hooks/use-rbac';
import { businessGroupService } from '../../services/business-group-service';
import { getAccessibleBranches } from '../../services/permissions-service';
import type { BusinessGroup, Branch } from '../../models/business-group';

export function ViewSwitcherDropdown() {
  const { locale } = useI18n();
  const { permissions } = useUserSession();
  const { canViewCompanyOverview } = useRBAC();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchIdFromUrl = params?.branchId as string | undefined;
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [businessGroup, setBusinessGroup] = useState<BusinessGroup | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Company view (overview/trends): owner, manager
  const canAccessCompany = canViewCompanyOverview;

  // Stable permission keys so effect doesn't re-run on every permissions object reference change
  const permOrgId = permissions?.organizationId ?? '';
  const permBranchIdsKey = (permissions?.branchIds ?? []).join(',');

  // Load data and filter branches by permissions
  useEffect(() => {
    setMounted(true);
    const loadData = () => {
      const group = businessGroupService.getBusinessGroup();
      if (group) {
        setBusinessGroup(group);
        const accessibleBranches = getAccessibleBranches(permissions).filter(
          (b) => b.businessGroupId === group.id
        );
        setBranches(accessibleBranches);
        const current = businessGroupService.getCurrentBranch();
        setCurrentBranch(current);
      }
    };

    loadData();

    const handleChange = () => {
      setTimeout(() => loadData(), 300);
    };
    const handleBranchCreated = () => {
      setTimeout(() => loadData(), 500);
    };

    window.addEventListener('organizationChanged', handleChange);
    window.addEventListener('branchUpdated', handleBranchCreated);
    window.addEventListener('branchSelectionChanged', handleChange);
    window.addEventListener('storage', handleChange);

    return () => {
      window.removeEventListener('organizationChanged', handleChange);
      window.removeEventListener('branchUpdated', handleBranchCreated);
      window.removeEventListener('branchSelectionChanged', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, [permOrgId, permBranchIdsKey]); // Stable deps: only re-run when org or branch list actually changes
  
  // Refresh branches when pathname/orgId/branchId changes
  useEffect(() => {
    if (mounted && orgId) {
      const group = businessGroupService.getBusinessGroup();
      if (group && group.id === orgId) {
        const accessibleBranches = getAccessibleBranches(permissions).filter(
          (b) => b.businessGroupId === orgId
        );
        setBranches(accessibleBranches);
        const current = branchIdFromUrl
          ? accessibleBranches.find((b) => b.id === branchIdFromUrl) ?? businessGroupService.getCurrentBranch()
          : null;
        setCurrentBranch(current);
      }
    }
  }, [pathname, mounted, orgId, branchIdFromUrl, permOrgId, permBranchIdsKey]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const isCompanyView = !branchIdFromUrl;
  const displayText = useMemo(() => {
    if (!mounted || !businessGroup) return '';
    if (isCompanyView) return businessGroup.name;
    const branch = currentBranch && branches.some((b) => b.id === currentBranch.id)
      ? currentBranch
      : branches.length > 0 ? branches[0] : null;
    const branchName = branch?.branchName ?? businessGroup.name;
    return `${businessGroup.name} > ${branchName}`;
  }, [mounted, businessGroup, isCompanyView, currentBranch, branches]);

  const branchTypeLabel = useMemo(() => {
    if (isCompanyView) return null;
    const branch = currentBranch && branches.some((b) => b.id === currentBranch.id)
      ? currentBranch
      : branches.length > 0 ? branches[0] : null;
    const type = (branch as { moduleType?: string })?.moduleType ?? (branch as { type?: string })?.type;
    if (type === 'fnb') return 'F&B';
    if (type === 'accommodation') return 'Accommodation';
    return null;
  }, [isCompanyView, currentBranch, branches]);

  const handleSelectCompany = () => {
    if (!canAccessCompany || !orgId) return;
    setIsOpen(false);
    router.push(`/org/${orgId}/overview`);
  };

  const handleSelectBranch = (branch: Branch) => {
    if (!orgId) return;
    const allowed = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
    if (!allowed.find((b) => b.id === branch.id)) return;
    setIsOpen(false);
    router.push(`/org/${orgId}/branch/${branch.id}/overview`);
  };

  if (!mounted) {
    return (
      <div style={{
        height: '36px',
        minWidth: '180px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 0.75rem',
        fontSize: '14px',
        color: '#6b7280',
      }}>
        {locale === 'th' ? 'กำลังโหลด...' : 'Loading...'}
      </div>
    );
  }

  if (!orgId) {
    return (
      <div style={{
        fontSize: '14px',
        fontWeight: 500,
        color: '#6b7280',
        minWidth: '180px',
      }}>
        {locale === 'th' ? 'ไม่ได้กำหนดการเข้าถึง' : 'No Access Assigned'}
      </div>
    );
  }

  if (!businessGroup) {
    return (
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: '#0a0a0a',
        minWidth: '180px',
      }}>
        {locale === 'th' ? 'กำลังโหลดองค์กร...' : 'Loading organization...'}
      </div>
    );
  }

  // Branch users: never show org-level option; they only see their assigned branch(es)
  const isBranchLevelUser = ['manager', 'staff'].includes(permissions.role);

  // In Company View: show dropdown only for owner/manager (branch users are redirected to branch)
  if (isCompanyView && canAccessCompany && !isBranchLevelUser) {
    return (
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 600,
            color: '#0a0a0a',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            minWidth: '180px',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayText}
          </span>
          <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '0.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              zIndex: 1000,
              minWidth: '240px',
              maxHeight: '400px',
              overflowY: 'auto',
            }}
          >
            <button
              type="button"
              onClick={handleSelectCompany}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                backgroundColor: '#f9fafb',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#0a0a0a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{businessGroup.name} {locale === 'th' ? '(ภาพรวมองค์กร)' : '(Company overview)'}</span>
              <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>
            </button>
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => handleSelectBranch(branch)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: branch.id !== branches[branches.length - 1].id ? '1px solid #f3f4f6' : 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#0a0a0a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{branch.branchName} {locale === 'th' ? '(สาขา)' : '(Branch)'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Company View but branch-only user: do not show org name; show message (layout should redirect them to branch)
  if (isCompanyView && isBranchLevelUser) {
    return (
      <div style={{
        padding: '0.5rem 0.75rem',
        fontSize: '14px',
        fontWeight: 600,
        color: '#0a0a0a',
        letterSpacing: '-0.01em',
        lineHeight: 1.2,
        minWidth: '180px',
      }}>
        {locale === 'th' ? 'สาขา' : 'Branch'}
      </div>
    );
  }

  if (isCompanyView) {
    return (
      <div style={{
        padding: '0.5rem 0.75rem',
        fontSize: '16px',
        fontWeight: 600,
        color: '#0a0a0a',
        letterSpacing: '-0.01em',
        lineHeight: 1.2,
        minWidth: '180px',
      }}>
        {displayText}
      </div>
    );
  }

  // In Branch View: company selector (trigger = company name), options = Company overview + branches
  const isBranchUser = ['manager', 'staff'].includes(permissions.role);
  const hasMultipleAccessibleBranches = branches.length > 1;
  const shouldShowDropdown = !isBranchUser || hasMultipleAccessibleBranches;

  if (!shouldShowDropdown && branches.length === 1) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#0a0a0a',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
          minWidth: '180px',
        }}>
          {displayText}
          {branchTypeLabel && (
            <span style={{
              fontSize: '11px',
              background: '#F3F4F6',
              color: '#374151',
              padding: '2px 6px',
              borderRadius: '6px',
              marginLeft: '6px',
              fontWeight: 500,
            }}>
              {branchTypeLabel}
            </span>
          )}
        </span>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>▾</span>
      </div>
    );
  }

  // Company selector: trigger shows company name; options = Company overview + branches (with labels)
  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 600,
          color: '#0a0a0a',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
          minWidth: '180px',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#d1d5db';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e5e7eb';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
          {displayText}
          {branchTypeLabel && (
            <span style={{
              fontSize: '11px',
              background: '#F3F4F6',
              color: '#374151',
              padding: '2px 6px',
              borderRadius: '6px',
              marginLeft: '6px',
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {branchTypeLabel}
            </span>
          )}
        </span>
        <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.25rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            minWidth: '260px',
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          {canAccessCompany && (
            <button
              type="button"
              onClick={handleSelectCompany}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                backgroundColor: isCompanyView ? '#f9fafb' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#0a0a0a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{businessGroup.name} {locale === 'th' ? '(ภาพรวมองค์กร)' : '(Company overview)'}</span>
              {isCompanyView && <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>}
            </button>
          )}
          {branches.map((branch) => {
            const isActive = branchIdFromUrl === branch.id;
            return (
              <button
                key={branch.id}
                onClick={() => handleSelectBranch(branch)}
                type="button"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  backgroundColor: isActive ? '#f9fafb' : 'transparent',
                  border: 'none',
                  borderBottom: branch.id !== branches[branches.length - 1].id ? '1px solid #f3f4f6' : 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#0a0a0a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{branch.branchName} {locale === 'th' ? '(สาขา)' : '(Branch)'}</span>
                {isActive && <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
