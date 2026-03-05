/**
 * View Mode Dropdown Component
 * 
 * Dropdown selector for switching between Company View and Branch View
 * Matches the format shown in the reference image
 */
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useContextMode, type ContextMode } from '../hooks/use-context-mode';
import { useI18n } from '../hooks/use-i18n';
import { useUserSession } from '../contexts/user-session-context';
import { businessGroupService } from '../services/business-group-service';
import { getAccessibleBranches } from '../services/permissions-service';

export function ViewModeDropdown() {
  const { mode, canSwitchToGroup } = useContextMode();
  const { locale } = useI18n();
  const { permissions } = useUserSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const orgId = params?.orgId as string | undefined;
  const branchIdFromUrl = params?.branchId as string | undefined;
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [branchCount, setBranchCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Determine if Company View should be accessible
  const canAccessCompany = useMemo(() => {
    return permissions.role === 'owner' || permissions.role === 'admin';
  }, [permissions.role]);

  useEffect(() => {
    setMounted(true);
    const updateBranchCount = () => {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (businessGroup) {
        const branches = businessGroupService.getAllBranches().filter(
          b => b.businessGroupId === businessGroup.id
        );
        setBranchCount(branches.length);
      }
    };
    
    updateBranchCount();
    
    window.addEventListener('branchUpdated', updateBranchCount);
    window.addEventListener('organizationChanged', updateBranchCount);
    window.addEventListener('storage', updateBranchCount);
    
    return () => {
      window.removeEventListener('branchUpdated', updateBranchCount);
      window.removeEventListener('organizationChanged', updateBranchCount);
      window.removeEventListener('storage', updateBranchCount);
    };
  }, []);

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

  const handleModeChange = (newMode: ContextMode) => {
    if (!orgId) return;
    if (!canSwitchToGroup && newMode === 'group') return;
    const onCompany = pathname?.startsWith('/org/') && !branchIdFromUrl;
    const onBranch = pathname?.includes('/branch/');
    if (mode === newMode && ((newMode === 'group' && onCompany) || (newMode === 'branch' && onBranch))) {
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    if (newMode === 'group') {
      router.push(`/org/${orgId}/overview`);
    } else {
      const branches = getAccessibleBranches(permissions).filter((b) => b.businessGroupId === orgId);
      const bid = branchIdFromUrl || businessGroupService.getCurrentBranchId() || branches[0]?.id;
      if (bid) router.push(`/org/${orgId}/branch/${bid}/overview`);
    }
  };

  // Hide if single branch and not owner/manager
  if (mounted && branchCount > 0 && branchCount <= 1 && !canAccessCompany) {
    return null;
  }
  
  if (!mounted) {
    return null;
  }

  // If Branch User role, only show Branch View option
  if (!canAccessCompany) {
    const isBranchView = mode === 'branch';
    
    return (
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#ffffff',
            border: isOpen ? '1px solid #f97316' : '1px solid #e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            color: '#0a0a0a',
            transition: 'all 0.2s',
            minWidth: '160px',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            if (!isOpen) {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isOpen) {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>
            {locale === 'th' ? 'มุมมองสาขา' : 'Branch View'}
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
              minWidth: '160px',
              overflowY: 'auto',
            }}
          >
            <button
              onClick={() => handleModeChange('branch')}
              type="button"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                backgroundColor: isBranchView ? '#f9fafb' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#0a0a0a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isBranchView) {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isBranchView) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span>{locale === 'th' ? 'มุมมองสาขา' : 'Branch View'}</span>
              {isBranchView && (
                <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  const isCompanyView = mode === 'group';
  const isBranchView = mode === 'branch';
  const displayText = isCompanyView 
    ? (locale === 'th' ? 'มุมมองบริษัท' : 'Company View')
    : (locale === 'th' ? 'มุมมองสาขา' : 'Branch View');

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#ffffff',
          border: isOpen ? '1px solid #f97316' : '1px solid #e5e7eb',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          color: '#0a0a0a',
          transition: 'all 0.2s',
          minWidth: '160px',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.boxShadow = 'none';
          }
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
            minWidth: '160px',
            overflowY: 'auto',
          }}
        >
          {/* Company View Option */}
          <button
            onClick={() => handleModeChange('group')}
            type="button"
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
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isCompanyView) {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (!isCompanyView) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span>{locale === 'th' ? 'มุมมองบริษัท' : 'Company View'}</span>
            {isCompanyView && (
              <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>
            )}
          </button>

          {/* Branch View Option */}
          <button
            onClick={() => handleModeChange('branch')}
            type="button"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              textAlign: 'left',
              backgroundColor: isBranchView ? '#f9fafb' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#0a0a0a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isBranchView) {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (!isBranchView) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span>{locale === 'th' ? 'มุมมองสาขา' : 'Branch View'}</span>
            {isBranchView && (
              <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
