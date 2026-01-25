// Login page - Simple authentication placeholder
'use client';

import { useState } from 'react';
import { PageLayout } from '../components/page-layout';
import { Button } from '../components/button';
import { useI18n } from '../hooks/use-i18n';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate login
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // In a real app, this would authenticate and set session
    // For now, just redirect to home
    router.push('/home');
  };

  return (
    <PageLayout title={t('login.title')} subtitle={t('login.subtitle')}>
      <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                color: '#374151',
                backgroundColor: '#ffffff',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              required
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                color: '#374151',
                backgroundColor: '#ffffff',
              }}
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.signIn')}
          </Button>

          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: '#6b7280',
              textAlign: 'center',
            }}
          >
            {t('login.placeholder')}
          </p>
        </form>
      </div>
    </PageLayout>
  );
}
