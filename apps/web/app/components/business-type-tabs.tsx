// Business Type Tabs - Switch between Hotel/Resort and Café/Restaurant views
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useI18n } from '../hooks/use-i18n';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { useUserSession } from '../contexts/user-session-context';
import { useBusinessSetup } from '../contexts/business-setup-context';
import { canAccessTab } from '../services/permissions-service';
import { ModuleType, hasAccommodationModule, hasFnbModule } from '../models/business-group';
import { getBusinessCapabilities, getCapabilitiesFromBranches, getBranchCapabilities, getTabVisibility, type BusinessCapabilities } from '../services/business-capabilities-service';

export type BusinessTab = 'hotel' | 'cafe';

interface BusinessTypeTabsProps {
  onTabChange?: (tab: BusinessTab) => void;
}

export function BusinessTypeTabs({ onTabChange }: BusinessTypeTabsProps) {
  const { locale, t } = useI18n();
  const { branch, isAllBranches } = useCurrentBranch();
  const { setup } = useBusinessSetup();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get business capabilities
  // Priority: branch modules > setup business type (for backward compatibility)
  let finalCapabilities: BusinessCapabilities;
  
  if (branch) {
    // Use branch modules (module-based architecture)
    finalCapabilities = getBranchCapabilities(branch);
  } else if (isAllBranches) {
    // Group view - check all branches
    finalCapabilities = getCapabilitiesFromBranches();
  } else {
    // Fallback to setup capabilities (for backward compatibility during initial setup)
    finalCapabilities = getBusinessCapabilities(setup);
  }
  
  // Ensure at least one module is enabled
  if (!finalCapabilities.hasHotel && !finalCapabilities.hasFnb) {
    finalCapabilities = { hasHotel: true, hasFnb: true, isMixed: true }; // Default fallback
  }
  
  // Debug logging (remove in production if needed)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[BusinessTypeTabs] Final capabilities:', finalCapabilities);
    console.log('[BusinessTypeTabs] Hotel tab enabled:', finalCapabilities.hasHotel);
    console.log('[BusinessTypeTabs] Cafe tab enabled:', finalCapabilities.hasFnb);
  }
  
  const tabVisibility = getTabVisibility(finalCapabilities);
  const { showHotelTab, showCafeTab, hotelTabEnabled, cafeTabEnabled } = tabVisibility;

  // Get initial tab from URL or localStorage, default based on business capabilities
  const getInitialTab = (): BusinessTab => {
    if (typeof window === 'undefined') {
      // SSR default - prefer first enabled tab
      return cafeTabEnabled ? 'cafe' : hotelTabEnabled ? 'hotel' : 'hotel';
    }
    
    const urlTab = searchParams.get('tab');
    if (urlTab === 'cafe' && cafeTabEnabled) return 'cafe';
    if (urlTab === 'hotel' && hotelTabEnabled) return 'hotel';
    
    const stored = localStorage.getItem('hospitality_active_tab');
    if (stored === 'cafe' && cafeTabEnabled) return 'cafe';
    if (stored === 'hotel' && hotelTabEnabled) return 'hotel';
    
    // Default based on branch modules
    if (branch) {
      const branchCaps = getBranchCapabilities(branch);
      // Prefer F&B tab if available, otherwise accommodation
      if (branchCaps.hasFnb && cafeTabEnabled) return 'cafe';
      if (branchCaps.hasHotel && hotelTabEnabled) return 'hotel';
      // If both modules enabled, prefer cafe tab
      if (branchCaps.isMixed && cafeTabEnabled) return 'cafe';
    }
    
    // Default to first available enabled tab
    // For branches with both modules, prefer cafe tab
    if (finalCapabilities.isMixed && cafeTabEnabled) return 'cafe';
    if (cafeTabEnabled) return 'cafe';
    if (hotelTabEnabled) return 'hotel';
    return 'hotel'; // Fallback
  };

  const [activeTab, setActiveTab] = useState<BusinessTab>(() => {
    if (typeof window === 'undefined') return 'hotel';
    return getInitialTab();
  });

  // Update tab when URL changes or branch/capabilities change
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    
    // Validate tab access based on capabilities
    if (urlTab === 'cafe') {
      if (cafeTabEnabled && activeTab !== 'cafe') {
        setActiveTab('cafe');
        if (onTabChange) onTabChange('cafe');
      } else if (!cafeTabEnabled) {
        // Redirect to hotel tab if cafe tab is not enabled
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', 'hotel');
        router.replace(`/branch/overview?${params.toString()}`, { scroll: false });
        setActiveTab('hotel');
        if (onTabChange) onTabChange('hotel');
      }
    } else if (urlTab === 'hotel') {
      if (hotelTabEnabled && activeTab !== 'hotel') {
        setActiveTab('hotel');
        if (onTabChange) onTabChange('hotel');
      } else if (!hotelTabEnabled) {
        // Redirect to cafe tab if hotel tab is not enabled
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', 'cafe');
        router.replace(`/branch/overview?${params.toString()}`, { scroll: false });
        setActiveTab('cafe');
        if (onTabChange) onTabChange('cafe');
      }
    } else {
      // No URL param, use initial tab
      const initialTab = getInitialTab();
      if (activeTab !== initialTab) {
        setActiveTab(initialTab);
        if (onTabChange) onTabChange(initialTab);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, branch?.id, setup?.businessType, finalCapabilities.hasHotel, finalCapabilities.hasFnb]);

  const { permissions } = useUserSession();

  const handleTabChange = (tab: BusinessTab, e?: React.MouseEvent) => {
    // Prevent default and stop propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Don't do anything if already on this tab
    if (activeTab === tab) {
      return;
    }

    // Access control: prevent switching to unsupported tabs
    if (tab === 'hotel' && !hotelTabEnabled) {
      console.warn('[BusinessTypeTabs] Hotel tab disabled, cannot switch. Capabilities:', finalCapabilities);
      return; // Don't allow switching to hotel tab if not enabled
    }
    if (tab === 'cafe' && !cafeTabEnabled) {
      console.warn('[BusinessTypeTabs] Cafe tab disabled, cannot switch. Capabilities:', finalCapabilities);
      return; // Don't allow switching to cafe tab if not enabled
    }

    // Permission check: ensure user can access this tab for current branch
    if (!canAccessTab(permissions, branch, tab)) {
      return; // Don't allow switching if user doesn't have permission
    }

    // Update state immediately for responsive UI
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hospitality_active_tab', tab);
    }
    
    // Update URL without page reload
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`/branch/overview?${params.toString()}`, { scroll: false });
    
    // Notify parent component of tab change
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Always show both tabs - let business capabilities determine which are enabled, not visibility
  // This ensures users can always see and switch between tabs
  const shouldShowHotelTab = true; // Always show hotel tab
  const shouldShowCafeTab = true; // Always show cafe tab

  return (
    <div style={{
      marginBottom: '0',
      borderBottom: 'none',
      paddingBottom: '0',
      position: 'relative',
      zIndex: 1,
    }}>
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', position: 'relative', zIndex: 2 }}>
        {shouldShowHotelTab && (
          <button
            onClick={(e) => handleTabChange('hotel', e)}
            aria-current={activeTab === 'hotel' ? 'page' : undefined}
            disabled={!hotelTabEnabled}
            type="button"
            title={!hotelTabEnabled 
              ? (locale === 'th' ? 'ธุรกิจนี้ไม่ได้ดำเนินการโรงแรม/รีสอร์ท' : 'This business does not operate a hotel/resort')
              : undefined}
            style={{
              color: !hotelTabEnabled 
                ? '#9ca3af' 
                : activeTab === 'hotel' ? '#0a0a0a' : '#6b7280',
              fontWeight: activeTab === 'hotel' ? 500 : 400,
              fontSize: '14px',
              textDecoration: 'none',
              background: 'none',
              border: 'none',
              padding: '0.5rem 0',
              cursor: !hotelTabEnabled ? 'not-allowed' : 'pointer',
              borderBottom: activeTab === 'hotel' && hotelTabEnabled ? '2px solid #0a0a0a' : '2px solid transparent',
              marginBottom: '0',
              transition: 'all 0.2s ease',
              outline: 'none',
              position: 'relative',
              zIndex: 10,
              opacity: !hotelTabEnabled ? 0.4 : 1,
              pointerEvents: !hotelTabEnabled ? 'none' : 'auto',
            }}
            onMouseEnter={(e) => {
              if (hotelTabEnabled && activeTab !== 'hotel') {
                e.currentTarget.style.color = '#374151';
              } else if (!hotelTabEnabled) {
                // Keep greyed out on hover if disabled
                e.currentTarget.style.color = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              if (hotelTabEnabled && activeTab !== 'hotel') {
                e.currentTarget.style.color = '#6b7280';
              } else if (!hotelTabEnabled) {
                e.currentTarget.style.color = '#9ca3af';
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid #3b82f6';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            {locale === 'th' ? 'โรงแรม / รีสอร์ท' : 'Hotel / Resort'}
          </button>
        )}
        {shouldShowCafeTab && (
          <button
            onClick={(e) => handleTabChange('cafe', e)}
            aria-current={activeTab === 'cafe' ? 'page' : undefined}
            disabled={!cafeTabEnabled}
            type="button"
            title={!cafeTabEnabled 
              ? (locale === 'th' ? 'ธุรกิจนี้ไม่ได้ดำเนินการคาเฟ่หรือร้านอาหาร' : 'This business does not operate a café or restaurant')
              : undefined}
            style={{
              color: !cafeTabEnabled 
                ? '#9ca3af' 
                : activeTab === 'cafe' ? '#0a0a0a' : '#6b7280',
              fontWeight: activeTab === 'cafe' ? 500 : 400,
              fontSize: '14px',
              textDecoration: 'none',
              background: 'none',
              border: 'none',
              padding: '0.5rem 0',
              cursor: !cafeTabEnabled ? 'not-allowed' : 'pointer',
              borderBottom: activeTab === 'cafe' && cafeTabEnabled ? '2px solid #0a0a0a' : '2px solid transparent',
              marginBottom: '0',
              transition: 'all 0.2s ease',
              outline: 'none',
              position: 'relative',
              zIndex: 10,
              opacity: !cafeTabEnabled ? 0.4 : 1,
              pointerEvents: !cafeTabEnabled ? 'none' : 'auto',
            }}
            onMouseEnter={(e) => {
              if (cafeTabEnabled && activeTab !== 'cafe') {
                e.currentTarget.style.color = '#374151';
              } else if (!cafeTabEnabled) {
                // Keep greyed out on hover if disabled
                e.currentTarget.style.color = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              if (cafeTabEnabled && activeTab !== 'cafe') {
                e.currentTarget.style.color = '#6b7280';
              } else if (!cafeTabEnabled) {
                e.currentTarget.style.color = '#9ca3af';
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid #3b82f6';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            {locale === 'th' ? 'คาเฟ่ / ร้านอาหาร' : 'Café / Restaurant'}
          </button>
        )}
      </div>
    </div>
  );
}
