// Custom hook for managing settings with localStorage persistence
'use client';

import { useState, useEffect } from 'react';

export interface Settings {
  language: 'th' | 'en';
  emailNotifications: boolean;
  timezone: string;
  seasonalityFlag: boolean;
}

const defaultSettings: Settings = {
  language: 'th',
  emailNotifications: true,
  timezone: 'Asia/Bangkok',
  seasonalityFlag: true,
};

const STORAGE_KEY = 'web-settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    // Load settings from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      // Trigger storage event to notify other tabs/components
      window.dispatchEvent(new Event('storage'));
      // Also trigger a custom event for same-tab updates
      window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: newSettings }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Listen for storage changes (e.g., from other tabs) and custom events (same tab)
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings({ ...defaultSettings, ...parsed });
        }
      } catch (error) {
        console.error('Failed to load settings from storage:', error);
      }
    };

    const handleSettingsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setSettings({ ...defaultSettings, ...customEvent.detail });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('settingsUpdated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settingsUpdated', handleSettingsUpdated);
    };
  }, []);

  return { settings, updateSettings, loading };
}
