// Overview page - placeholder
import Link from 'next/link';

export default function OverviewPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
        Overview
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Business overview page - to be implemented
      </p>
      <Link href="/home" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
        Back to Home
      </Link>
    </div>
  );
}
