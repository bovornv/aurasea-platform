/**
 * Organization Switcher Component
 * 
 * Displays current organization name with dropdown to switch organizations
 * Stripe/Shopify-style organization selector
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../../hooks/use-i18n';
import { businessGroupService } from '../../services/business-group-service';
import type { BusinessGroup } from '../../models/business-group';
import { invalidateOrganizationState, invalidateBranchState } from '../../utils/cache-invalidation';

export function OrganizationSwitcher() {
  const { locale } = useI18n();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentOrganization, setCurrentOrganization] = useState<BusinessGroup | null>(null);
  const [organizations, setOrganizations] = useState<BusinessGroup[]>([]);

  useEffect(() => {
    setMounted(true);
    loadOrganizations();
  }, []);

  const loadOrganizations = () => {
    try {
      const current = businessGroupService.getBusinessGroup();
      if (current) {
        setCurrentOrganization(current);
        // For now, single organization per user
        // Future: load multiple organizations from API/context
        setOrganizations([current]);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

  const handleSelectOrganization = (org: BusinessGroup) => {
    if (org.id === currentOrganization?.id) {
      setIsOpen(false);
      return;
    }

    // Update current organization
    setCurrentOrganization(org);
    setIsOpen(false);

    // PART 4: Update business group in localStorage and trigger full recalculation
    // The hooks watch businessGroup?.id, so they'll automatically pick up the change
    try {
      localStorage.setItem('hospitality_business_group', JSON.stringify(org));
      
      // PART 4: Clear cached state - trigger full recalculation
      invalidateOrganizationState(org.id);
      invalidateBranchState('__all__');
      
      // Dispatch custom event for any components that need to react immediately
      window.dispatchEvent(new CustomEvent('organizationChanged', { 
        detail: { organizationId: org.id } 
      }));
      
      // Also dispatch a more specific event for recalculation
      window.dispatchEvent(new CustomEvent('forceRecalculation', {
        detail: { 
          organizationId: org.id,
          reason: 'organization_changed'
        }
      }));
      
      // PART 4: Trigger router refresh for Next.js components
      router.refresh();
      
      // Trigger storage event for cross-tab synchronization
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error('Failed to update organization:', err);
    }
  };

  if (!mounted || !currentOrganization) {
    return (
      <div style={{
        height: '32px',
        width: '200px',
        backgroundColor: '#e5e7eb',
        borderRadius: '6px',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => {
          // Delay to allow click on dropdown items
          setTimeout(() => setIsOpen(false), 200);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          color: '#0a0a0a',
          transition: 'all 0.2s',
          minWidth: '180px',
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
        <span style={{ flex: 1, textAlign: 'left' }}>
          {currentOrganization.name}
        </span>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
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
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {organizations.map((org) => {
            const isActive = org.id === currentOrganization.id;
            return (
              <button
                key={org.id}
                onClick={() => handleSelectOrganization(org)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  backgroundColor: isActive ? '#f9fafb' : 'transparent',
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
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{org.name}</span>
                {isActive && (
                  <span style={{ color: '#3b82f6', fontSize: '16px' }}>✓</span>
                )}
              </button>
            );
          })}
          
          {/* Future: Add "Create New Organization" option */}
          {/* <div style={{ borderTop: '1px solid #e5e7eb', padding: '0.5rem' }}>
            <button
              style={{
                width: '100%',
                padding: '0.5rem',
                textAlign: 'center',
                backgroundColor: 'transparent',
                border: '1px dashed #d1d5db',
                borderRadius: '4px',
                color: '#6b7280',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              + {locale === 'th' ? 'สร้างองค์กรใหม่' : 'Create New Organization'}
            </button>
          </div> */}
        </div>
      )}
    </div>
  );
}
