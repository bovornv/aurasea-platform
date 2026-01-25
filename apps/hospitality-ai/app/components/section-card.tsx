// Section card component for consistent card styling
interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
}

export function SectionCard({ title, children, subtitle }: SectionCardProps) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: '#ffffff',
      }}
    >
      <h3
        style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          marginBottom: subtitle ? '0.25rem' : '0.75rem',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            marginBottom: '0.75rem',
          }}
        >
          {subtitle}
        </p>
      )}
      <div style={{ color: '#374151', fontSize: '0.9375rem', lineHeight: '1.6' }}>
        {children}
      </div>
    </div>
  );
}
