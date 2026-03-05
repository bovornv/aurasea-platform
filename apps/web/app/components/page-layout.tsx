// Shared page layout component
'use client';

import { Navigation } from './navigation';
import { usePathname } from 'next/navigation';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Optional node for top-right of header (e.g. language switcher on onboarding) */
  headerRight?: React.ReactNode;
}

export function PageLayout({ title, subtitle, children, headerRight }: PageLayoutProps) {
  const pathname = usePathname() || '';
  // Navigation is now handled by route layouts (GroupLayout, BranchLayout)
  // Only show navigation here for legacy routes that don't have layouts
  const isOrgRoute = pathname.startsWith('/org/');
  const showNavigation =
    pathname !== '/login' &&
    pathname !== '/hospitality/setup' &&
    pathname !== '/hospitality/data-entry' &&
    pathname !== '/hospitality/data-entry-fnb' &&
    pathname !== '/hospitality/data-history' &&
    pathname !== '/hotel/update-operational-data' &&
    pathname !== '/cafe/update-operational-data' &&
    pathname !== '/update-data/cafe-restaurant' &&
    pathname !== '/update-data/hotel-resort' &&
    !pathname.startsWith('/group/') &&
    !pathname.startsWith('/branch/') &&
    !isOrgRoute;

  const isGroupOrBranchRoute =
    isOrgRoute || pathname.startsWith('/group/') || pathname.startsWith('/branch/');
  
  if (isGroupOrBranchRoute) {
    return (
      <div style={{ width: '100%', padding: '1.5rem 0 3rem 0' }}>
        {title && (
          <header style={{ marginBottom: '2rem' }}>
            <h1 style={{ 
              fontSize: '28px', 
              fontWeight: 600, 
              marginBottom: '0.5rem', 
              color: '#0a0a0a',
              letterSpacing: '-0.01em',
              lineHeight: '1.2'
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ 
                color: '#6b7280', 
                fontSize: '15px',
                lineHeight: '1.5',
                marginTop: '0.5rem'
              }}>
                {subtitle}
              </p>
            )}
          </header>
        )}
        <main>{children}</main>
      </div>
    );
  }

  // Legacy routes use constrained width
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 2rem' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 600, 
            marginBottom: '0.5rem', 
            color: '#0a0a0a',
            letterSpacing: '-0.01em',
            lineHeight: '1.2'
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ 
              color: '#6b7280', 
              fontSize: '15px',
              lineHeight: '1.5',
              marginTop: '0.5rem'
            }}>
              {subtitle}
            </p>
          )}
        </div>
        {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
      </header>

      {showNavigation && <Navigation />}

      <main style={{ marginTop: showNavigation ? '2rem' : '0' }}>{children}</main>
    </div>
  );
}
