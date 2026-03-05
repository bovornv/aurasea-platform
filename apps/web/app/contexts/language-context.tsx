// Language context provider to ensure all components react to language changes
'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSettings } from '../hooks/use-settings';
import type { Locale } from '../i18n/translations';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const [locale, setLocaleState] = useState<Locale>('th');

  useEffect(() => {
    if (settings?.language === 'th' || settings?.language === 'en') {
      setLocaleState(settings.language);
    }
  }, [settings?.language]);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      updateSettings({ language: newLocale });
    },
    [updateSettings]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguageContext must be used within LanguageProvider');
  }
  return context;
}
