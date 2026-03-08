'use client';

/**
 * Subtle platform badge for post-login layout. Bottom-right corner.
 */
export function PoweredByAuraSea() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '0.75rem',
        right: '1rem',
        fontSize: '11px',
        color: '#9CA3AF',
        fontWeight: 500,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      Powered by AuraSea
    </div>
  );
}
