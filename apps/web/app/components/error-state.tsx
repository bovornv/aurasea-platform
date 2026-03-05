// Error state component
interface ErrorAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface ErrorStateProps {
  title?: string;
  message: string;
  action?: ErrorAction;
  actions?: ErrorAction[];
}

export function ErrorState({ title = 'Something went wrong', message, action, actions }: ErrorStateProps) {
  // Support both single action (backward compatible) and multiple actions
  const actionList = actions || (action ? [action] : []);

  return (
    <div
      style={{
        padding: '2rem',
        border: '1px solid #fecaca',
        borderRadius: '12px',
        backgroundColor: '#fef2f2',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: '#dc2626',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          ⚠
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: 600, 
            marginBottom: '0.5rem',
            color: '#991b1b',
            letterSpacing: '-0.01em',
          }}>
            {title}
          </h3>
          <p style={{ 
            fontSize: '15px', 
            marginBottom: actionList.length > 0 ? '1.5rem' : '0',
            color: '#7f1d1d',
            lineHeight: '1.6',
          }}>
            {message}
          </p>
        </div>
      </div>
      {actionList.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          {actionList.map((act, idx) => (
            <button
              key={idx}
              onClick={act.onClick}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: act.primary ? 'none' : '1px solid #dc2626',
                backgroundColor: act.primary ? '#dc2626' : '#ffffff',
                color: act.primary ? '#ffffff' : '#dc2626',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (act.primary) {
                  e.currentTarget.style.backgroundColor = '#b91c1c';
                } else {
                  e.currentTarget.style.backgroundColor = '#fee2e2';
                }
              }}
              onMouseLeave={(e) => {
                if (act.primary) {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                } else {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = '2px solid #3b82f6';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = 'none';
              }}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
