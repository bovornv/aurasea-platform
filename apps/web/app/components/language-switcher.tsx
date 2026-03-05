/**
 * Minimal language switcher (TH | EN). Uses LanguageContext; no page reload.
 * Persistence via existing context → updateSettings → localStorage.
 */
'use client';

import { useLanguageContext } from '../contexts/language-context';

const btn = {
  padding: '0.25rem 0.5rem',
  fontSize: '13px',
  fontWeight: 500,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#d1d5db',
  borderRadius: '4px',
  cursor: 'pointer',
  background: 'transparent',
  color: '#6b7280',
} as const;

const active = {
  ...btn,
  background: '#f3f4f6',
  color: '#0a0a0a',
  borderColor: '#9ca3af',
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguageContext();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <button
        type="button"
        aria-label="ภาษาไทย"
        style={locale === 'th' ? active : btn}
        onClick={() => setLocale('th')}
      >
        ไทย
      </button>
      <span style={{ color: '#d1d5db', fontSize: '12px' }}>|</span>
      <button
        type="button"
        aria-label="English"
        style={locale === 'en' ? active : btn}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  );
}
