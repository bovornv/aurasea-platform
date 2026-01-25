// Empty state component
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: '3rem 2rem',
        textAlign: 'center',
        color: '#6b7280',
      }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '0.875rem', marginBottom: action ? '1.5rem' : '0' }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
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
          {action.label}
        </button>
      )}
    </div>
  );
}
