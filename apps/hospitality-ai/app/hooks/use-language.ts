// Hook to force re-render when language changes
'use client';

import { useEffect, useState } from 'react';
import { useSettings } from './use-settings';

export function useLanguage() {
  const { settings } = useSettings();
  const [key, setKey] = useState(0);

  useEffect(() => {
    // Force re-render when language changes
    setKey(prev => prev + 1);
  }, [settings.language]);

  return { language: settings.language, key };
}
