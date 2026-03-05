// Section card component for consistent card styling
'use client';

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function SectionCard({ title, children, subtitle, collapsible, expanded = true, onToggle }: SectionCardProps) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? (subtitle ? '0.25rem' : '0.75rem') : '0' }}>
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#0a0a0a',
            textTransform: 'none',
            letterSpacing: '0',
            margin: 0,
          }}
        >
          {title}
        </h3>
        {collapsible && (
          <button
            onClick={onToggle}
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#6b7280',
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '−' : '+'}
          </button>
        )}
      </div>
      {subtitle && expanded && (
        <p
          style={{
            fontSize: '13px',
            color: '#6b7280',
            marginBottom: '1rem',
          }}
        >
          {subtitle}
        </p>
      )}
      {expanded && (
        <div style={{ color: '#374151', fontSize: '14px', lineHeight: '1.6' }}>
          {children}
        </div>
      )}
    </div>
  );
}
