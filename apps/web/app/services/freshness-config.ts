// Industry-specific data freshness thresholds
// Centralized configuration for confidence decay rules

import type { BusinessType } from '../contexts/business-setup-context';

export interface FreshnessThresholds {
  mildDecayDays: number;      // Days before mild decay starts
  warningDays: number;        // Days before warning threshold
  strongDecayDays: number;    // Days before strong decay
  confidenceCapDays: number; // Days before confidence caps at 40%
}

export interface FreshnessConfig {
  thresholds: FreshnessThresholds;
  decayMultipliers: {
    mild: number;      // Multiplier for mild decay period
    moderate: number;  // Multiplier for moderate decay period
    strong: number;    // Multiplier for strong decay period
    cap: number;       // Minimum confidence cap
  };
}

const CAFE_CONFIG: FreshnessConfig = {
  thresholds: {
    mildDecayDays: 3,
    warningDays: 7,
    strongDecayDays: 14,
    confidenceCapDays: 21,
  },
  decayMultipliers: {
    mild: 0.95,      // -5% after 3 days
    moderate: 0.85,  // -15% after 7 days
    strong: 0.70,    // -30% after 14 days
    cap: 0.40,       // Cap at 40% after 21 days
  },
};

const RESORT_CONFIG: FreshnessConfig = {
  thresholds: {
    mildDecayDays: 7,
    warningDays: 14,
    strongDecayDays: 30,
    confidenceCapDays: 45,
  },
  decayMultipliers: {
    mild: 0.95,      // -5% after 7 days
    moderate: 0.85,   // -15% after 14 days
    strong: 0.70,    // -30% after 30 days
    cap: 0.40,       // Cap at 40% after 45 days
  },
};

// Default config (used for hotel/restaurant or unknown types)
const DEFAULT_CONFIG: FreshnessConfig = {
  thresholds: {
    mildDecayDays: 3,
    warningDays: 7,
    strongDecayDays: 14,
    confidenceCapDays: 30,
  },
  decayMultipliers: {
    mild: 0.95,
    moderate: 0.85,
    strong: 0.70,
    cap: 0.40,
  },
};

/**
 * Get freshness configuration for a business type
 */
export function getFreshnessConfig(businessType: BusinessType | null): FreshnessConfig {
  switch (businessType) {
    case 'cafe_restaurant':
      return CAFE_CONFIG;
    case 'hotel_resort':
      return RESORT_CONFIG;
    case 'hotel_with_cafe':
    case 'other':
    default:
      return DEFAULT_CONFIG;
  }
}

/**
 * Get threshold label for UI display
 */
export function getThresholdLabel(businessType: BusinessType | null, locale: 'en' | 'th' = 'th'): string {
  let typeLabel: string;
  
  if (businessType === 'cafe_restaurant') {
    typeLabel = locale === 'th' ? 'คาเฟ่ / ร้านอาหาร' : 'Café / Restaurant';
  } else if (businessType === 'hotel_resort') {
    typeLabel = locale === 'th' ? 'โรงแรม / รีสอร์ท' : 'Hotel / Resort';
  } else if (businessType === 'hotel_with_cafe') {
    typeLabel = locale === 'th' ? 'โรงแรมที่มีคาเฟ่' : 'Hotel with Café';
  } else {
    typeLabel = locale === 'th' ? 'ธุรกิจ' : 'Business';
  }
  
  return locale === 'th'
    ? `เกณฑ์ความสดของข้อมูลสำหรับ${typeLabel}`
    : `Data freshness thresholds for ${typeLabel}`;
}
