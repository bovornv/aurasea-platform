// i18n hook for translations — locale from LanguageContext (single source of truth)
'use client';

import { useCallback } from 'react';
import { useLanguageContext } from '../contexts/language-context';
import { translations, type Locale } from '../i18n/translations';

export function useI18n() {
  const { locale } = useLanguageContext();

  // Memoize the translation function to ensure components re-render when locale changes
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
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
  }, [locale]);

  return { t, locale };
}
