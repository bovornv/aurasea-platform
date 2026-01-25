// i18n hook for translations
'use client';

import { useMemo } from 'react';
import { useSettings } from './use-settings';
import { translations, type Locale } from '../i18n/translations';

export function useI18n() {
  const { settings } = useSettings();
  
  // Use useMemo to ensure locale updates when settings change
  const locale: Locale = useMemo(() => {
    return (settings?.language || 'en') as Locale;
  }, [settings?.language]);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: any = translations[locale];

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) {
        // Fallback to English if translation missing
        value = translations.en;
        for (const k2 of keys) {
          value = value?.[k2];
        }
        break;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Replace placeholders like {count}
    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        const paramValue = params[paramKey];
        if (paramValue !== undefined) {
          return String(paramValue);
        }
        return match;
      });
    }

    return value;
  };

  return { t, locale };
}
