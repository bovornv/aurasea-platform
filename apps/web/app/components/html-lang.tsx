// Client component to set HTML lang attribute dynamically
'use client';

import { useEffect } from 'react';
import { useSettings } from '../hooks/use-settings';

export function HtmlLangSetter() {
  const { settings } = useSettings();

  useEffect(() => {
    // Update HTML lang attribute when language changes
    document.documentElement.lang = settings?.language || 'th';
  }, [settings?.language]);

  return null;
}
