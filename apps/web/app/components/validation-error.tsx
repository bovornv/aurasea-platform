// Validation error display component
'use client';

interface ValidationErrorProps {
  message: string;
  field?: string;
}

export function ValidationError({ message, field }: ValidationErrorProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        fontSize: '13px',
        color: '#dc2626',
        marginTop: '0.375rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
      }}
    >
      <span style={{ fontSize: '14px' }}>⚠</span>
      <span>{message}</span>
    </div>
  );
}
