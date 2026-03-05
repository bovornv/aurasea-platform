// Reusable button component
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  type = 'button',
  style,
}: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    padding: '0.625rem 1.25rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    opacity: disabled ? 0.5 : 1,
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#0a0a0a',
      color: '#ffffff',
      borderColor: '#0a0a0a',
    },
    secondary: {
      backgroundColor: '#ffffff',
      color: '#374151',
      borderColor: '#d1d5db',
    },
    danger: {
      backgroundColor: '#ffffff',
      color: '#dc2626',
      borderColor: '#dc2626',
    },
  };

  const hoverStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#374151',
      borderColor: '#374151',
    },
    secondary: {
      backgroundColor: '#f9fafb',
      borderColor: '#9ca3af',
    },
    danger: {
      backgroundColor: '#fef2f2',
      borderColor: '#991b1b',
    },
  };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{ ...baseStyles, ...style }}
      onMouseEnter={(e) => {
        if (!disabled) {
          Object.assign(e.currentTarget.style, hoverStyles[variant]);
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          Object.assign(e.currentTarget.style, variantStyles[variant]);
        }
      }}
      onKeyDown={(e) => {
        // Only handle keyboard events if this is not a submit button in a form
        // For submit buttons, let the form handle submission naturally
        if (type === 'submit') {
          // Let form handle submission - don't prevent default
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled && onClick) {
            onClick();
          }
        }
      }}
    >
      {children}
    </button>
  );
}
