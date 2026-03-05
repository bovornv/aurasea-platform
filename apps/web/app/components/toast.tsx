/**
 * Toast Notification Component
 * 
 * Simple toast notification for success/error messages
 */
'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        padding: '0.75rem 1rem',
        backgroundColor: type === 'success' ? '#10b981' : '#ef4444',
        color: '#ffffff',
        borderRadius: '6px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        fontSize: '14px',
        fontWeight: 500,
        zIndex: 10000,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      {message}
    </div>
  );
}
