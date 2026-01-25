// Shared navigation component
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '../hooks/use-i18n';

export function Navigation() {
  const pathname = usePathname() || '';
  const { t } = useI18n();

  const navItems = [
    { href: '/home', label: t('nav.home') },
    { href: '/alert', label: t('nav.alerts') },
    { href: '/overview', label: t('nav.overview') },
    { href: '/scenario', label: t('nav.scenario') },
    { href: '/history', label: t('nav.history') },
    { href: '/settings', label: t('nav.settings') },
  ];

  return (
    <nav style={{ marginBottom: '2rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/home' && pathname === '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: isActive ? '#0a0a0a' : '#6b7280',
                fontWeight: isActive ? 600 : 400,
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#6b7280';
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
