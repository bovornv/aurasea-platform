/**
 * Branch Selector Component
 * 
 * Allows users to switch between branches in their business group.
 * Default selection = Business Group (All Branches)
 * Shows current selection and provides dropdown to switch.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { businessGroupService } from '../services/business-group-service';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { useUserSession } from '../contexts/user-session-context';
import { getAccessibleBranches, canAccessAllBranchesView } from '../services/permissions-service';
import type { Branch } from '../models/business-group';
import { useI18n } from '../hooks/use-i18n';

const ALL_BRANCHES_KEY = '__all__';

export function BranchSelector() {
  const { branch: currentBranch, branchId, isAllBranches, isLoading } = useCurrentBranch();
  const { permissions } = useUserSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessGroup, setBusinessGroup] = useState(businessGroupService.getBusinessGroup());
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { locale } = useI18n();

  useEffect(() => {
    const loadBranches = () => {
      // Filter branches based on user permissions
      const accessibleBranches = getAccessibleBranches(permissions);
      setBranches(accessibleBranches);
      setBusinessGroup(businessGroupService.getBusinessGroup());
    };
    
    loadBranches();
    
    // Listen for branch updates
    const handleBranchUpdate = () => {
      setTimeout(() => {
        loadBranches();
      }, 100);
    };
    
    window.addEventListener('branchUpdated', handleBranchUpdate);
    window.addEventListener('branchSelectionChanged', handleBranchUpdate);
    window.addEventListener('storage', handleBranchUpdate);
    
    return () => {
      window.removeEventListener('branchUpdated', handleBranchUpdate);
      window.removeEventListener('branchSelectionChanged', handleBranchUpdate);
      window.removeEventListener('storage', handleBranchUpdate);
    };
  }, [branchId, permissions]);

  const handleBranchChange = (selectionId: string) => {
    businessGroupService.setCurrentBranch(selectionId);
    setIsOpen(false);
    // Reload page to refresh all branch-dependent data
    router.refresh();
  };

  if (isLoading) {
    return null;
  }

  // Get display text for current selection
  const getDisplayText = (): string => {
    if (isAllBranches) {
      return locale === 'th' 
        ? `${businessGroup?.name || 'กลุ่มธุรกิจ'} (ทุกสาขา)`
        : `${businessGroup?.name || 'Business Group'} (All Branches)`;
    }
    return currentBranch?.branchName || '';
  };

  // Don't show selector if user has no accessible branches
  if (branches.length === 0) {
    return null;
  }

  // For staff with only one branch, optionally hide selector (or show it for consistency)
  // For now, we'll show it even if there's only one branch

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#ffffff',
          cursor: 'pointer',
          fontSize: '14px',
          color: '#374151',
          minWidth: '150px',
        }}
        onBlur={() => {
          // Delay closing to allow click events
          setTimeout(() => setIsOpen(false), 200);
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{getDisplayText()}</span>
        <span style={{ fontSize: '12px' }}>▼</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {/* All Branches Option - Only shown for owners */}
          {canAccessAllBranchesView(permissions) && (
            <button
              onClick={() => handleBranchChange(ALL_BRANCHES_KEY)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                border: 'none',
                backgroundColor: isAllBranches ? '#f3f4f6' : '#ffffff',
                cursor: 'pointer',
                fontSize: '14px',
                color: isAllBranches ? '#0a0a0a' : '#374151',
                borderBottom: '1px solid #e5e7eb',
              }}
              onMouseEnter={(e) => {
                if (!isAllBranches) {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isAllBranches) {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }
              }}
            >
              <div style={{ fontWeight: isAllBranches ? 500 : 400 }}>
                {locale === 'th' 
                  ? `${businessGroup?.name || 'กลุ่มธุรกิจ'} (ทุกสาขา)`
                  : `${businessGroup?.name || 'Business Group'} (All Branches)`}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
                {locale === 'th' ? 'มุมมองรวม' : 'Aggregated View'}
              </div>
            </button>
          )}

          {/* Individual Branches */}
          {branches.map((branch) => {
            const isSelected = !isAllBranches && branch.id === currentBranch?.id;
            return (
              <button
                key={branch.id}
                onClick={() => handleBranchChange(branch.id)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  border: 'none',
                  backgroundColor: isSelected ? '#f3f4f6' : '#ffffff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: isSelected ? '#0a0a0a' : '#374151',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }
                }}
              >
                <div style={{ fontWeight: isSelected ? 500 : 400 }}>
                  {branch.branchName}
                </div>
                {branch.location && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.25rem' }}>
                    {[branch.location.city, branch.location.country].filter(Boolean).join(', ')}
                  </div>
                )}
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid #e5e7eb', padding: '0.5rem' }}>
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/hospitality/branches');
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                textAlign: 'center',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#3b82f6',
              }}
            >
              {locale === 'th' ? '+ เพิ่มสาขา' : '+ Add Branch'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
