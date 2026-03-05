// Business setup context - stores business configuration for MVP
'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export type BusinessType = 'cafe_restaurant' | 'hotel_resort' | 'hotel_with_cafe' | 'other';

// Legacy business types for backward compatibility
type LegacyBusinessType = 'hotel' | 'resort' | 'cafe' | 'restaurant';

// Migrate legacy business type values to new values
function migrateBusinessType(legacyType: string | null): BusinessType | null {
  if (!legacyType) return null;
  
  // Map old values to new values
  const migrationMap: Record<LegacyBusinessType, BusinessType> = {
    'hotel': 'hotel_resort',
    'resort': 'hotel_resort',
    'cafe': 'cafe_restaurant',
    'restaurant': 'cafe_restaurant',
  };
  
  // If it's a legacy type, migrate it
  if (legacyType in migrationMap) {
    return migrationMap[legacyType as LegacyBusinessType];
  }
  
  // If it's already a new type, return as-is
  if (['cafe_restaurant', 'hotel_resort', 'hotel_with_cafe', 'other'].includes(legacyType)) {
    return legacyType as BusinessType;
  }
  
  // Unknown type, default to 'other'
  return 'other';
}

export interface BusinessSetup {
  businessType: BusinessType | null;
  businessName: string;
  currentCashBalance: number | null;
  monthlyFixedCosts: number | null;
  revenueSources: {
    rooms: boolean;
    food: boolean;
    beverages: boolean;
    other: boolean;
  };
  isCompleted: boolean;
}

interface BusinessSetupContextType {
  setup: BusinessSetup;
  updateSetup: (updates: Partial<BusinessSetup>) => void;
  completeSetup: () => void;
  resetSetup: () => void;
}

const defaultSetup: BusinessSetup = {
  businessType: null,
  businessName: '',
  currentCashBalance: null,
  monthlyFixedCosts: null,
  revenueSources: {
    rooms: false,
    food: false,
    beverages: false,
    other: false,
  },
  isCompleted: false,
};

const BusinessSetupContext = createContext<BusinessSetupContextType | undefined>(undefined);

export function BusinessSetupProvider({ children }: { children: ReactNode }) {
  const [setup, setSetup] = useState<BusinessSetup>(defaultSetup);

  // Initialize business structure (auto-migration) and load setup on mount
  useEffect(() => {
    // Initialize business group structure (auto-migrates existing users)
    import('../services/business-group-service').then(({ businessGroupService }) => {
      businessGroupService.initializeBusinessStructure();
    });

    const stored = localStorage.getItem('hospitality_business_setup');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Migrate legacy business type if needed
        if (parsed.businessType) {
          parsed.businessType = migrateBusinessType(parsed.businessType);
        }
        setSetup(parsed);
      } catch (e) {
        console.error('Failed to parse business setup:', e);
      }
    }
  }, []);

  const updateSetup = useCallback((updates: Partial<BusinessSetup>) => {
    setSetup((prev) => {
      const updated = { ...prev, ...updates };
      // Save to localStorage
      localStorage.setItem('hospitality_business_setup', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const completeSetup = useCallback(() => {
    setSetup((prev) => {
      const completed = { ...prev, isCompleted: true };
      localStorage.setItem('hospitality_business_setup', JSON.stringify(completed));
      
      // Create initial operational signal when setup is completed
      // This enables continuous monitoring from the start
      if (completed.currentCashBalance !== null || completed.monthlyFixedCosts !== null) {
        import('../services/operational-signals-service').then(({ operationalSignalsService }) => {
          operationalSignalsService.saveSignal({
            cashBalance: completed.currentCashBalance || 0,
            revenue7Days: 0, // Will be populated as data comes in
            revenue30Days: 0,
            costs7Days: completed.monthlyFixedCosts ? (completed.monthlyFixedCosts / 30) * 7 : 0,
            costs30Days: completed.monthlyFixedCosts || 0,
            staffCount: 0, // Would come from setup in production
          });
        });
      }
      
      return completed;
    });
  }, []);

  const resetSetup = useCallback(() => {
    setSetup(defaultSetup);
    localStorage.removeItem('hospitality_business_setup');
  }, []);

  return (
    <BusinessSetupContext.Provider
      value={{
        setup,
        updateSetup,
        completeSetup,
        resetSetup,
      }}
    >
      {children}
    </BusinessSetupContext.Provider>
  );
}

export function useBusinessSetup() {
  const context = useContext(BusinessSetupContext);
  if (!context) {
    throw new Error('useBusinessSetup must be used within BusinessSetupProvider');
  }
  return context;
}
