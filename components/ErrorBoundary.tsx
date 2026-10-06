import React from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a render crash in one view from taking the whole storefront down.
 * Without this, React unmounts the entire tree and the shopper sees a blank page.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // console.error keeps the component stack for debugging in devtools.
    console.error('Storefront crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-offwhite dark:bg-dark-bg px-6">
          <div className="max-w-md w-full bg-white dark:bg-dark-card shadow-xl rounded-lg p-10 text-center">
            <h1 className="text-3xl font-bold text-brand-dark dark:text-dark-text">
              Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-4 text-sm">
              The store hit an unexpected error. Your cart and saved products are still in this
              browser — reloading should pick up where you left off.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 bg-brand-dark text-white py-3 px-8 rounded-full font-semibold hover:bg-gray-800 transition-colors duration-300"
            >
              Reload the store
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;