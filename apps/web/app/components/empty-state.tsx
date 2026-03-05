// Empty state component - Stripe + Linear style
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        color: '#6b7280',
      }}
    >
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '0.75rem', color: '#374151', letterSpacing: '-0.01em' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '15px', marginBottom: (action || secondaryAction) ? '2rem' : '0', lineHeight: '1.6', maxWidth: '500px', margin: description ? '0 auto 2rem' : '0 auto' }}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {action && (
            <button
              onClick={action.onClick}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid #0a0a0a',
                backgroundColor: '#0a0a0a',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#374151';
                e.currentTarget.style.borderColor = '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0a0a0a';
                e.currentTarget.style.borderColor = '#0a0a0a';
              }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
