/**
 * Branch Context Header Bar
 * 
 * Shows Branch Name (bold) with Module labels,
 * Branch Selector
 * Only displayed in Branch View mode
 */
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useI18n } from '../hooks/use-i18n';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { businessGroupService } from '../services/business-group-service';
import { ModuleType } from '../models/business-group';
import { BranchSelector } from './branch-selector';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { getBusinessCapabilities } from '../services/business-capabilities-service';

export function BranchContextHeader() {
  const { locale, t } = useI18n();
  const { setup } = useBusinessSetup();
  const { branch } = useCurrentBranch();
  
  const businessGroup = useMemo(() => businessGroupService.getBusinessGroup(), []);
  
  // Determine module labels (show enabled modules)
  const moduleLabels = useMemo(() => {
    if (branch && branch.modules) {
      const labels: string[] = [];
      if (branch.modules.includes(ModuleType.ACCOMMODATION)) {
        labels.push(locale === 'th' ? 'ที่พัก' : 'Accommodation');
      }
      if (branch.modules.includes(ModuleType.FNB)) {
        labels.push(locale === 'th' ? 'อาหารและเครื่องดื่ม' : 'F&B');
      }
      return labels.length > 0 ? labels.join(' • ') : (locale === 'th' ? 'ธุรกิจ' : 'Business');
    }
    return locale === 'th' ? 'ธุรกิจ' : 'Business';
  }, [branch, locale]);
  
  
  if (!businessGroup && !branch) {
    return null;
  }
  
  return (
    <div style={{
      padding: '1rem 1.5rem',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1.5rem',
      flexWrap: 'wrap',
      marginBottom: '0',
    }}>
      {/* Left: Branch Name (bold) + Business Type badge */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {/* Branch Name (bold) – Business Type */}
        {branch && (
          <div style={{ 
            fontSize: '20px', 
            color: '#0a0a0a', 
            fontWeight: 600,
          }}>
            {locale === 'th' 
              ? `${branch.branchName} – ${moduleLabels}`
              : `${branch.branchName} – ${moduleLabels}`}
          </div>
        )}
      </div>
      
      {/* Right: Branch Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <BranchSelector />
      </div>
    </div>
  );
}
