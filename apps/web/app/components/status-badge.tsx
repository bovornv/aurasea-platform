// Status badge component
interface StatusBadgeProps {
  status: 'positive' | 'neutral' | 'negative' | 'warning';
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const getStatusStyles = () => {
    switch (status) {
      case 'positive':
        return {
          backgroundColor: '#dcfce7',
          color: '#166534',
          borderColor: '#bbf7d0',
        };
      case 'negative':
        return {
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderColor: '#fecaca',
        };
      case 'warning':
        return {
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderColor: '#fde68a',
        };
      case 'neutral':
      default:
        return {
          backgroundColor: '#f3f4f6',
          color: '#6b7280',
          borderColor: '#e5e7eb',
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <span
      style={{
        fontSize: '0.75rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        border: `1px solid ${styles.borderColor}`,
        fontWeight: 500,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}
