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
  language: 'en',
  emailNotifications: true,
  timezone: 'Asia/Bangkok',
  seasonalityFlag: true,
};

const STORAGE_KEY = 'hospitality-ai-settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Listen for storage changes (e.g., from other tabs)
  useEffect(() => {
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

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { settings, updateSettings, loading };
}
