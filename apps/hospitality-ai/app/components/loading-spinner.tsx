// Loading spinner component
export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2px solid #e5e7eb`,
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

// Add to globals.css
const spinnerStyles = `
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
`;
