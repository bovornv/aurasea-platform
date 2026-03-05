/**
 * Dashboard Branch Selector Component
 * 
 * Filters branches by business type and allows selection for dashboard view
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { businessGroupService } from '../services/business-group-service';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { useUserSession } from '../contexts/user-session-context';
import { getAccessibleBranches } from '../services/permissions-service';
import { ModuleType } from '../models/business-group';
import type { Branch } from '../models/business-group';
import { useI18n } from '../hooks/use-i18n';
import type { BusinessTab } from './business-type-tabs';

interface DashboardBranchSelectorProps {
  activeTab: BusinessTab;
  onBranchChange?: () => void;
}

export function DashboardBranchSelector({ activeTab, onBranchChange }: DashboardBranchSelectorProps) {
  const { branch: currentBranch, isLoading } = useCurrentBranch();
  const { permissions } = useUserSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { locale } = useI18n();

  // Filter branches by business type based on active tab
  const filteredBranches = useMemo(() => {
    const accessibleBranches = getAccessibleBranches(permissions);
    
    // Filter by module based on active tab
    return accessibleBranches.filter(branch => {
      if (activeTab === 'hotel') {
        return branch.modules?.includes(ModuleType.ACCOMMODATION) ?? false;
      } else {
        return branch.modules?.includes(ModuleType.FNB) ?? false;
      }
    });
  }, [permissions, activeTab]);

  useEffect(() => {
    setBranches(filteredBranches);
    
    // Auto-select first branch if current branch doesn't match business type filter
    if (filteredBranches.length > 0 && currentBranch) {
      const currentBranchMatches = filteredBranches.some(b => b.id === currentBranch.id);
      if (!currentBranchMatches) {
        // Current branch doesn't match filter, select first available
        businessGroupService.setCurrentBranch(filteredBranches[0].id);
        router.refresh();
      }
    }
  }, [filteredBranches, currentBranch, router]);

  const handleBranchChange = (branchId: string) => {
    businessGroupService.setCurrentBranch(branchId);
    setIsOpen(false);
    router.refresh();
    if (onBranchChange) {
      onBranchChange();
    }
  };

  if (isLoading) {
    return null;
  }

  // Hide selector if only one branch (or none)
  if (branches.length <= 1) {
    return null;
  }

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
          setTimeout(() => setIsOpen(false), 200);
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>
          {currentBranch?.branchName || (locale === 'th' ? 'เลือกสาขา' : 'Select Branch')}
        </span>
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
          {branches.map((branch) => {
            const isSelected = branch.id === currentBranch?.id;
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
        </div>
      )}
    </div>
  );
}
