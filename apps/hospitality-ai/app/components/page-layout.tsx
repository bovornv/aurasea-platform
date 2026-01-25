// Shared page layout component
'use client';

import { Navigation } from './navigation';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function PageLayout({ title, subtitle, children }: PageLayoutProps) {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0a0a0a' }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {subtitle}
          </p>
        )}
      </header>

      <Navigation />

      <main>{children}</main>
    </div>
  );
}
