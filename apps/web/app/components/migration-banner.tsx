/**
 * Migration Banner Component
 * 
 * Shows a one-time banner after silent migration to inform users
 * about the new multi-branch feature.
 */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '../hooks/use-i18n';
import { businessGroupService } from '../services/business-group-service';

const MIGRATION_BANNER_SHOWN_KEY = 'hospitality_migration_banner_shown';

export function MigrationBanner() {
  const { locale } = useI18n();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if migration just happened and banner hasn't been shown
    if (typeof window === 'undefined') return;

    const migrationKey = 'hospitality_multi_branch_migrated';
    const bannerShown = localStorage.getItem(MIGRATION_BANNER_SHOWN_KEY);
    const migrated = localStorage.getItem(migrationKey);

    // Show banner if:
    // 1. Migration has happened (migrated === 'true')
    // 2. Banner hasn't been shown yet (bannerShown !== 'true')
    // 3. User has at least one branch (migration was successful)
    if (migrated === 'true' && bannerShown !== 'true') {
      const branches = businessGroupService.getAllBranches();
      if (branches.length > 0) {
        setShowBanner(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(MIGRATION_BANNER_SHOWN_KEY, 'true');
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid #3b82f6',
        borderRadius: '12px',
        padding: '1rem 1.5rem',
        backgroundColor: '#eff6ff',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: '200px' }}>
        <p style={{ 
          fontSize: '14px', 
          fontWeight: 500, 
          color: '#1e40af', 
          margin: '0 0 0.25rem 0',
          lineHeight: '1.5',
        }}>
          {locale === 'th' 
            ? 'คุณสามารถเพิ่มสาขาหลายแห่งและเปรียบเทียบประสิทธิภาพได้แล้ว'
            : 'You can now add multiple branches and compare performance.'}
        </p>
        <p style={{ 
          fontSize: '13px', 
          color: '#3b82f6', 
          margin: 0,
          lineHeight: '1.4',
        }}>
          {locale === 'th'
            ? 'เพิ่มสาขาใหม่หรือดูการเปรียบเทียบสาขาได้จากเมนูด้านบน'
            : 'Add new branches or view branch comparison from the menu above.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link
          href="/hospitality/branches"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'background-color 0.2s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#3b82f6';
          }}
        >
          {locale === 'th' ? 'จัดการสาขา' : 'Manage Branches'}
        </Link>
        <Link
          href="/hospitality/branches/compare"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#ffffff',
            color: '#3b82f6',
            border: '1px solid #3b82f6',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
            e.currentTarget.style.borderColor = '#2563eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.borderColor = '#3b82f6';
          }}
        >
          {locale === 'th' ? 'เปรียบเทียบสาขา' : 'Compare Branches'}
        </Link>
        <button
          onClick={handleDismiss}
          style={{
            padding: '0.5rem',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#3b82f6',
            fontSize: '18px',
            lineHeight: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label={locale === 'th' ? 'ปิด' : 'Dismiss'}
        >
          ×
        </button>
      </div>
    </div>
  );
}
