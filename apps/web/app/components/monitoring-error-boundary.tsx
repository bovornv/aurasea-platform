/**
 * Monitoring Error Boundary
 * 
 * Specialized error boundary for monitoring and health score components.
 * Provides graceful degradation when monitoring calculations fail.
 */
'use client';

import React, { Component, ReactNode } from 'react';
import { ErrorState } from './error-state';
import { useI18n } from '../hooks/use-i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class MonitoringErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging (DEV mode only)
    if (process.env.NODE_ENV === 'development') {
      // STABILITY: Log render failures but do not rethrow
      console.error(`[STABILITY] Render failure in ${this.props.componentName || 'monitoring component'}:`, {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }

    // Attempt automatic recovery for monitoring errors
    if (this.isRecoverableError(error)) {
      this.scheduleRetry();
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state if children change (e.g., route change, data refresh)
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.resetErrorBoundary();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private isRecoverableError(error: Error): boolean {
    // Monitoring errors are often recoverable (data loading, calculation errors)
    const recoverablePatterns = [
      /monitoring/i,
      /health.score/i,
      /alert/i,
      /calculation/i,
      /NaN/i,
      /undefined/i,
      /network/i,
      /timeout/i,
    ];
    
    return recoverablePatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  private scheduleRetry() {
    if (this.state.retryCount >= 2) {
      return; // Max 2 retries for monitoring (faster than general errors)
    }

    this.retryTimeoutId = setTimeout(() => {
      this.setState(prevState => ({ retryCount: prevState.retryCount + 1 }));
      this.resetErrorBoundary();
    }, 1000 * (this.state.retryCount + 1)); // Faster retry for monitoring
  }

  private resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
    });
    
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleRetry = () => {
    this.resetErrorBoundary();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <MonitoringErrorFallback
          error={this.state.error}
          retryCount={this.state.retryCount}
          onRetry={this.handleRetry}
          componentName={this.props.componentName}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Monitoring Error Fallback Component
 */
function MonitoringErrorFallback({
  error,
  retryCount,
  onRetry,
  componentName,
}: {
  error: Error | null;
  retryCount: number;
  onRetry: () => void;
  componentName?: string;
}) {
  const { locale } = useI18n();
  const isRetrying = retryCount > 0 && retryCount < 2;

  const getErrorMessage = (): string => {
    if (!error) {
      return locale === 'th' 
        ? 'ไม่สามารถโหลดข้อมูลการตรวจสอบได้'
        : 'Unable to load monitoring data';
    }

    // User-friendly error messages
    if (error.message.includes('NaN') || error.message.includes('undefined')) {
      return locale === 'th'
        ? 'เกิดข้อผิดพลาดในการคำนวณ กรุณาลองใหม่อีกครั้ง'
        : 'Calculation error occurred. Please try again.';
    }

    if (error.message.includes('health score')) {
      return locale === 'th'
        ? 'ไม่สามารถคำนวณคะแนนสุขภาพได้'
        : 'Unable to calculate health score';
    }

    if (error.message.includes('alert')) {
      return locale === 'th'
        ? 'ไม่สามารถโหลดการแจ้งเตือนได้'
        : 'Unable to load alerts';
    }

    return locale === 'th'
      ? 'เกิดข้อผิดพลาดในการตรวจสอบ กรุณาลองใหม่อีกครั้ง'
      : 'Monitoring error occurred. Please try again.';
  };

  return (
    <div style={{
      padding: '1.5rem',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      backgroundColor: '#fef2f2',
      margin: '1rem 0',
    }}>
      <ErrorState
        title={isRetrying 
          ? (locale === 'th' ? 'กำลังลองใหม่...' : 'Retrying...')
          : (locale === 'th' ? 'เกิดข้อผิดพลาด' : 'Error')
        }
        message={getErrorMessage()}
        actions={[
          {
            label: locale === 'th' ? 'ลองอีกครั้ง' : 'Try Again',
            onClick: onRetry,
            primary: true,
          },
        ]}
      />
      {isRetrying && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#0c4a6e',
        }}>
          {locale === 'th' 
            ? `กำลังลองใหม่... (${retryCount}/2)`
            : `Retrying... (${retryCount}/2)`
          }
        </div>
      )}
      {process.env.NODE_ENV === 'development' && error && (
        <details style={{ marginTop: '1rem', fontSize: '12px', color: '#666' }}>
          <summary style={{ cursor: 'pointer' }}>Error Details (DEV)</summary>
          <pre style={{ 
            marginTop: '0.5rem', 
            padding: '0.5rem', 
            backgroundColor: '#f9fafb', 
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '11px',
          }}>
            {error.message}
            {componentName && `\nComponent: ${componentName}`}
          </pre>
        </details>
      )}
    </div>
  );
}
