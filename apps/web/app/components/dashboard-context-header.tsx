/**
 * Dashboard Context Header Component
 * 
 * Displays Business Group Name, Business Type, and Branch Name at the top of the dashboard
 */
'use client';

import { useMemo } from 'react';
import { useI18n } from '../hooks/use-i18n';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { businessGroupService } from '../services/business-group-service';
import { ModuleType } from '../models/business-group';
import type { BusinessTab } from './business-type-tabs';

interface DashboardContextHeaderProps {
  activeTab: BusinessTab;
}

export function DashboardContextHeader({ activeTab }: DashboardContextHeaderProps) {
  const { locale } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch } = useCurrentBranch();
  
  const businessGroup = useMemo(() => businessGroupService.getBusinessGroup(), []);
  
  // Determine module label based on active tab and branch
  const moduleLabel = useMemo(() => {
    if (branch && branch.modules) {
      // Show label based on active tab
      if (activeTab === 'hotel') {
        return branch.modules.includes(ModuleType.ACCOMMODATION)
          ? (locale === 'th' ? 'ที่พัก' : 'Accommodation')
          : (locale === 'th' ? 'ธุรกิจ' : 'Business');
      } else {
        return branch.modules.includes(ModuleType.FNB)
          ? (locale === 'th' ? 'อาหารและเครื่องดื่ม' : 'F&B')
          : (locale === 'th' ? 'ธุรกิจ' : 'Business');
      }
    }
    
    // Fallback based on active tab
    return activeTab === 'hotel'
      ? (locale === 'th' ? 'ที่พัก' : 'Accommodation')
      : (locale === 'th' ? 'อาหารและเครื่องดื่ม' : 'F&B');
  }, [branch, activeTab, locale]);
  
  if (!businessGroup && !branch) {
    return null;
  }
  
  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginBottom: '2rem',
      }}
    >
      {/* Business Group Name */}
      {businessGroup && (
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.5rem' }}>
          {businessGroup.name}
        </div>
      )}
      
      {/* Business Type and Branch Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '16px', fontWeight: 500, color: '#374151' }}>
          {moduleLabel}
        </div>
        {branch && (
          <>
            <span style={{ fontSize: '16px', color: '#9ca3af' }}>•</span>
            <div style={{ fontSize: '16px', fontWeight: 500, color: '#0a0a0a' }}>
              {branch.branchName}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
