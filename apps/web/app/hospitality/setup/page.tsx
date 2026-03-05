// Business Setup Page (onboarding) - owner only; organization not yet configured.
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../../components/page-layout';
import { LanguageSwitcher } from '../../components/language-switcher';
import { useOrgBranchPaths } from '../../hooks/use-org-branch-paths';
import { Button } from '../../components/button';
import { useI18n } from '../../hooks/use-i18n';
import { useBusinessSetup, type BusinessType } from '../../contexts/business-setup-context';
import { useUserRole } from '../../contexts/user-role-context';
import { useOrganization } from '../../contexts/organization-context';
import { LoadingSpinner } from '../../components/loading-spinner';

export default function BusinessSetupPage() {
  const router = useRouter();
  const paths = useOrgBranchPaths();
  const { t } = useI18n();
  const { setup, updateSetup, completeSetup } = useBusinessSetup();
  const { role: userRole } = useUserRole();
  const { activeOrganizationId } = useOrganization();

  const [formData, setFormData] = useState({
    businessType: setup.businessType || '',
    businessName: setup.businessName || '',
    revenueSources: {
      rooms: setup.revenueSources.rooms,
      food: setup.revenueSources.food,
      beverages: setup.revenueSources.beverages,
      other: setup.revenueSources.other,
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [originalBusinessType, setOriginalBusinessType] = useState(setup.businessType || '');
  const [showTrustNote, setShowTrustNote] = useState(false);

  const orgOverviewPath = activeOrganizationId ? `/org/${activeOrganizationId}/overview` : '/org';

  useEffect(() => {
    if (!userRole) return;

    if (userRole.effectiveRole !== 'owner') {
      router.replace(orgOverviewPath);
      return;
    }

    if (setup.isCompleted) {
      router.replace(orgOverviewPath);
    }
  }, [userRole, setup.isCompleted, orgOverviewPath, router]);

  useEffect(() => {
    if (setup.isCompleted) {
      setOriginalBusinessType(setup.businessType || '');
    }
  }, [setup.isCompleted, setup.businessType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.businessType) {
      newErrors.businessType = t('setup.errors.businessTypeRequired');
    }
    if (!formData.businessName.trim()) {
      newErrors.businessName = t('setup.errors.businessNameRequired');
    }
    if (!Object.values(formData.revenueSources).some(v => v)) {
      newErrors.revenueSources = t('setup.errors.revenueSourcesRequired');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    updateSetup({
      businessType: formData.businessType as BusinessType,
      businessName: formData.businessName.trim(),
      currentCashBalance: null,
      monthlyFixedCosts: null,
      revenueSources: formData.revenueSources,
    });

    // Mark setup as completed
    completeSetup();

    router.push(paths.companyOverview || orgOverviewPath);
  };

  if (!userRole) return null;

  const canShowForm = userRole.effectiveRole === 'owner' && !setup.isCompleted;
  if (!canShowForm) {
    return (
      <PageLayout title="" subtitle="">
        <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  const isEditMode = setup.isCompleted;
  return (
    <PageLayout 
      title={isEditMode ? t('setup.editTitle') : t('setup.title')} 
      subtitle={isEditMode ? t('setup.editSubtitle') : t('setup.subtitle')}
      headerRight={<LanguageSwitcher />}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {!isEditMode && (
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {t('setup.positioningLine')}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          {/* Business Type */}
          <div style={{ marginBottom: '2rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '15px',
                fontWeight: 500,
                marginBottom: '0.75rem',
                color: '#374151',
              }}
            >
              {t('setup.businessType')} <span style={{ color: '#dc2626' }}>*</span>
            </label>
            
            {/* Radio Button Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { value: 'cafe_restaurant', label: t('setup.businessTypeCafeRestaurant'), desc: t('setup.businessTypeCafeRestaurantDesc'), icon: '☕' },
                { value: 'hotel_resort', label: t('setup.businessTypeHotelResort'), desc: t('setup.businessTypeHotelResortDesc'), icon: '🏨' },
                { value: 'hotel_with_cafe', label: t('setup.businessTypeHotelWithCafe'), desc: t('setup.businessTypeHotelWithCafeDesc'), icon: '🏨 + ☕' },
                { value: 'other', label: t('setup.businessTypeOther'), desc: t('setup.businessTypeOtherDesc'), icon: '🧪' },
              ].map((option) => {
                const isSelected = formData.businessType === option.value;
                return (
                  <label
                    key={option.value}
                    htmlFor={`businessType-${option.value}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #0a0a0a' : '1px solid #e5e7eb',
                      backgroundColor: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#d1d5db';
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }
                    }}
                  >
                    <input
                      type="radio"
                      id={`businessType-${option.value}`}
                      name="businessType"
                      value={option.value}
                      checked={isSelected}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setFormData({ ...formData, businessType: newValue });
                        setErrors({ ...errors, businessType: '' });
                        
                        // Show trust note if editing and value changed
                        if (isEditMode && newValue !== originalBusinessType) {
                          setShowTrustNote(true);
                        } else {
                          setShowTrustNote(false);
                        }
                      }}
                      required
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '20px' }}>{option.icon}</span>
                        <span style={{ 
                          fontSize: '15px', 
                          color: '#374151',
                          fontWeight: isSelected ? 500 : 400,
                        }}>
                          {option.label}
                        </span>
                      </div>
                      <p style={{ 
                        fontSize: '13px', 
                        color: '#6b7280',
                        marginTop: '0.25rem',
                        marginLeft: '28px',
                      }}>
                        {option.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
            
            {/* Trust Note (shown when editing and business type changed) */}
            {isEditMode && showTrustNote && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '16px', flexShrink: 0 }}>ℹ️</span>
                <p style={{ 
                  fontSize: '13px', 
                  color: '#374151',
                  margin: 0,
                  lineHeight: '1.5',
                }}>
                  {t('setup.businessTypeChangeNote')}
                </p>
              </div>
            )}
            
            {errors.businessType && (
              <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.businessType}</p>
            )}
          </div>

          {/* Business Name */}
          <div style={{ marginBottom: '2rem' }}>
            <label
              htmlFor="businessName"
              style={{
                display: 'block',
                fontSize: '15px',
                fontWeight: 500,
                marginBottom: '0.75rem',
                color: '#374151',
              }}
            >
              {t('setup.businessName')}
            </label>
            <input
              id="businessName"
              type="text"
              value={formData.businessName}
              onChange={(e) => {
                setFormData({ ...formData, businessName: e.target.value });
                setErrors({ ...errors, businessName: '' });
              }}
              required
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '8px',
                border: errors.businessName ? '1px solid #dc2626' : '1px solid #d1d5db',
                fontSize: '15px',
                color: '#374151',
                backgroundColor: '#ffffff',
              }}
              placeholder={t('setup.businessNamePlaceholder')}
            />
            {errors.businessName && (
              <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.businessName}</p>
            )}
          </div>

          {/* Revenue Sources */}
          <div style={{ marginBottom: '2rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '15px',
                fontWeight: 500,
                marginBottom: '0.75rem',
                color: '#374151',
              }}
            >
              {t('setup.revenueSources')}
            </label>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '0.5rem' }}>
              {t('setup.revenueSourcesHelp')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(['rooms', 'food', 'beverages', 'other'] as const).map((source) => (
                <label
                  key={source}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: formData.revenueSources[source] ? '#f9fafb' : '#ffffff',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.revenueSources[source]}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        revenueSources: {
                          ...formData.revenueSources,
                          [source]: e.target.checked,
                        },
                      });
                      setErrors({ ...errors, revenueSources: '' });
                    }}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontSize: '15px', color: '#374151' }}>
                    {t(`setup.revenueSource${source.charAt(0).toUpperCase() + source.slice(1)}`)}
                  </span>
                </label>
              ))}
            </div>
            {/* Revenue Sources Helper Text */}
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
              }}
            >
              <p style={{ 
                fontSize: '13px', 
                color: '#6b7280',
                margin: 0,
                fontStyle: 'italic',
                lineHeight: '1.5',
              }}>
                {t('setup.revenueSourcesHelper')}
              </p>
            </div>
            {errors.revenueSources && (
              <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '0.5rem' }}>{errors.revenueSources}</p>
            )}
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  if (userRole?.effectiveRole === 'owner' || userRole?.effectiveRole === 'admin') {
                    router.push(paths.companyOverview || '/group/overview');
                  } else {
                    router.push(paths.branchOverview || '/branch/overview');
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '15px',
                  fontWeight: 500,
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                {t('common.cancel')}
              </button>
            )}
            <Button
              type="submit"
              variant="primary"
            >
              {isEditMode ? t('setup.saveChanges') : t('setup.completeSetup')}
            </Button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
