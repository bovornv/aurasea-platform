// Error Boundary Component - Catches React errors and displays fallback UI. Use as AppErrorBoundary for global wrap.
'use client';

import React, { Component, ReactNode } from 'react';
import { ErrorState } from './error-state';
import { isProd } from '../lib/dev-log';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (!isProd) {
      console.error('[STABILITY] Render failure in ErrorBoundary:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Store error info for better error messages
    this.setState({ errorInfo });

    // Attempt automatic recovery for certain errors
    if (this.isRecoverableError(error)) {
      this.scheduleRetry();
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state if children change (e.g., route change)
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
    // Network errors, timeout errors, etc. are recoverable
    const recoverablePatterns = [
      /network/i,
      /timeout/i,
      /fetch/i,
      /connection/i,
      /failed to fetch/i,
    ];
    
    return recoverablePatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  private scheduleRetry() {
    if (this.state.retryCount >= 3) {
      return; // Max 3 retries
    }

    this.retryTimeoutId = setTimeout(() => {
      this.setState(prevState => ({ retryCount: prevState.retryCount + 1 }));
      this.resetErrorBoundary();
    }, 2000 * (this.state.retryCount + 1)); // Exponential backoff
  }

  private resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleRetry = () => {
    this.resetErrorBoundary();
  };

  private getErrorMessage(): string {
    const { error } = this.state;
    
    if (!error) {
      return 'An unexpected error occurred. Please try refreshing the page.';
    }

    // Provide user-friendly error messages
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }

    if (error.message.includes('timeout')) {
      return 'The request took too long to complete. Please try again.';
    }

    if (error.message.includes('Failed to load')) {
      return 'Failed to load data. Please refresh the page or try again later.';
    }

    // Generic error message
    return error.message || 'An unexpected error occurred. Please refresh the page.';
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.getErrorMessage();
      const isRetrying = this.state.retryCount > 0 && this.state.retryCount < 3;

      return (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
          <ErrorState
            title={isRetrying ? 'Retrying...' : 'Something went wrong'}
            message={errorMessage}
            actions={[
              {
                label: 'Try Again',
                onClick: this.handleRetry,
                primary: true,
              },
              {
                label: 'Refresh Page',
                onClick: () => window.location.reload(),
                primary: false,
              },
            ]}
          />
          {isRetrying && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#0c4a6e',
            }}>
              Attempting to recover... ({this.state.retryCount}/3)
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/** Alias for global app error boundary (production hardening). */
export const AppErrorBoundary = ErrorBoundary;
