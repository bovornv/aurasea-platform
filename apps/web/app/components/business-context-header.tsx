/**
 * Business Context Header Component
 * 
 * Displays business name and context at the top of group-level pages
 * Shows group name for multi-branch organizations or branch name for single-branch
 */
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useI18n } from '../hooks/use-i18n';
import { businessGroupService } from '../services/business-group-service';
import type { BusinessGroup, Branch } from '../models/business-group';

export function BusinessContextHeader() {
  const { locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [businessGroup, setBusinessGroup] = useState<BusinessGroup | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    loadData();

    // Listen for organization changes
    const handleOrganizationChange = () => {
      loadData();
    };

    window.addEventListener('organizationChanged', handleOrganizationChange);
    window.addEventListener('storage', handleOrganizationChange);

    return () => {
      window.removeEventListener('organizationChanged', handleOrganizationChange);
      window.removeEventListener('storage', handleOrganizationChange);
    };
  }, []);

  const loadData = () => {
    try {
      const group = businessGroupService.getBusinessGroup();
      if (!group) {
        setLoading(false);
        return;
      }

      const allBranches = businessGroupService.getAllBranches().filter(
        b => b.businessGroupId === group.id
      );

      setBusinessGroup(group);
      setBranches(allBranches);
    } catch (err) {
      console.error('Failed to load business context:', err);
    } finally {
      setLoading(false);
    }
  };

  const { title, subtitle } = useMemo(() => {
    if (!mounted || loading || !businessGroup) {
      return { title: '', subtitle: '' };
    }

    // If more than 1 branch: show company name with "Company Overview"
    if (branches.length > 1) {
      return {
        title: businessGroup.name,
        subtitle: locale === 'th' ? 'ภาพรวมบริษัท' : 'Company Overview',
      };
    }

    // If exactly 1 branch: show branch name with "Business Overview"
    if (branches.length === 1) {
      return {
        title: branches[0].branchName,
        subtitle: locale === 'th' ? 'ภาพรวมธุรกิจ' : 'Business Overview',
      };
    }

    // Fallback: show company name
    return {
      title: businessGroup.name,
      subtitle: locale === 'th' ? 'ภาพรวมบริษัท' : 'Company Overview',
    };
  }, [mounted, loading, businessGroup, branches, locale]);

  // Skeleton placeholder while loading
  if (!mounted || loading) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <div
          style={{
            width: '300px',
            height: '32px',
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // Don't render if no data
  if (!businessGroup || !title) {
    return null;
  }

  // For multi-branch: show "Company View – [Company Name]"
  if (branches.length > 1) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#0a0a0a',
            margin: 0,
            lineHeight: '1.2',
          }}
        >
          {locale === 'th' ? `มุมมองบริษัท – ${title}` : `Company View – ${title}`}
        </h1>
      </div>
    );
  }

  // For single branch: show Business Overview subtitle
  if (branches.length === 1 && subtitle) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <p
          style={{
            fontSize: '15px',
            color: '#6b7280',
            margin: 0,
            lineHeight: '1.5',
          }}
        >
          {subtitle}
        </p>
      </div>
    );
  }

  return null;
}
