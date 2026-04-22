'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ApiError } from '../lib/api-error';
import { clientLogger } from '../lib/client-logger';

type Props = {
  children: ReactNode;
  fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
};

type State = { error: Error | null };

/**
 * Error boundary de app: captura errores de render en el árbol hijo.
 * Colocar en layout raíz del Next app consumidor (app/layout.tsx).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    clientLogger.error('react_render_error', error, {
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset });
      }
      const status = error instanceof ApiError ? error.status : null;
      return (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          <p className="font-medium">Algo salió mal</p>
          {status != null && (
            <p className="mt-1 text-xs font-medium text-red-700">HTTP {status}</p>
          )}
          <p className="mt-1 text-sm">{error.message}</p>
          <button
            type="button"
            className="mt-3 rounded bg-red-700 px-3 py-1 text-sm text-white"
            onClick={this.reset}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
