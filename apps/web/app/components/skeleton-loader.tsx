// Skeleton loader component for better loading UX
'use client';

interface SkeletonLoaderProps {
  lines?: number;
  width?: string;
  height?: string;
  className?: string;
}

export function SkeletonLoader({ lines = 3, width = '100%', height = '1rem' }: SkeletonLoaderProps) {
  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === lines - 1 ? '60%' : '100%',
            height,
            backgroundColor: '#f3f4f6',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.75rem',
        backgroundColor: '#ffffff',
      }}
    >
      <SkeletonLoader lines={2} height="1.25rem" />
      <div style={{ marginTop: '1.5rem' }}>
        <SkeletonLoader lines={3} height="1rem" />
      </div>
    </div>
  );
}
