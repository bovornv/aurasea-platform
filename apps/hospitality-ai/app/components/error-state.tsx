// Error state component
interface ErrorStateProps {
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function ErrorState({ title = 'Something went wrong', message, action }: ErrorStateProps) {
  return (
    <div
      style={{
        padding: '2rem',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        backgroundColor: '#fef2f2',
        color: '#991b1b',
      }}
    >
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.875rem', marginBottom: action ? '1rem' : '0' }}>
        {message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid #dc2626',
            backgroundColor: '#ffffff',
            color: '#dc2626',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fee2e2';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
