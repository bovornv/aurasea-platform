// Settings page
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLayout } from '../components/page-layout';
import { useSettings } from '../hooks/use-settings';
import { useI18n } from '../hooks/use-i18n';

export default function SettingsPage() {
  const { settings, updateSettings, loading } = useSettings();
  const { t } = useI18n();
  const router = useRouter();

  // Refresh page when language changes to update all translations
  useEffect(() => {
    // Small delay to ensure settings are saved
    const timer = setTimeout(() => {
      // Force a re-render by updating a state that triggers re-fetch
      // Actually, the i18n hook should handle this automatically
    }, 100);
    return () => clearTimeout(timer);
  }, [settings.language]);

  if (loading) {
    return (
      <PageLayout title={t('settings.title')} subtitle={t('settings.subtitle')}>
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <p>{t('settings.loading')}</p>
        </div>
      </PageLayout>
    );
  }

  const handleLanguageChange = async (lang: 'th' | 'en') => {
    updateSettings({ language: lang });
    // Small delay to ensure settings are saved, then refresh
    await new Promise(resolve => setTimeout(resolve, 150));
    window.location.reload();
  };

  return (
    <PageLayout title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Language Selection */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
            {t('settings.language')}
          </h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              <input
                type="radio"
                name="language"
                value="th"
                checked={settings.language === 'th'}
                onChange={(e) => handleLanguageChange(e.target.value as 'th' | 'en')}
                style={{ cursor: 'pointer' }}
              />
              {t('settings.thai')}
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              <input
                type="radio"
                name="language"
                value="en"
                checked={settings.language === 'en'}
                onChange={(e) => handleLanguageChange(e.target.value as 'th' | 'en')}
                style={{ cursor: 'pointer' }}
              />
              {t('settings.english')}
            </label>
          </div>
        </div>

        {/* Notification Preferences */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
            {t('settings.notifications')}
          </h3>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#374151',
            }}
          >
            <input
              type="checkbox"
              checked={settings.emailNotifications}
              onChange={(e) => updateSettings({ emailNotifications: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            {t('settings.emailNotifications')}
          </label>
        </div>

        {/* Business Context */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
            {t('settings.businessContext')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                {t('settings.timezone')}
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => updateSettings({ timezone: e.target.value })}
                style={{
                  width: '100%',
                  maxWidth: '300px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                <option value="UTC">UTC (GMT+0)</option>
              </select>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              <input
                type="checkbox"
                checked={settings.seasonalityFlag}
                onChange={(e) => updateSettings({ seasonalityFlag: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              {t('settings.seasonalityFlag')}
            </label>
          </div>
        </div>

        {/* Advanced Configuration Note */}
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem', fontStyle: 'italic' }}>
          {t('settings.advancedNote')}
        </p>
      </div>
    </PageLayout>
  );
}
