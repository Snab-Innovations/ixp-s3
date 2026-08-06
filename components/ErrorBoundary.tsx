import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#050505] text-[#ededed] flex flex-col items-center justify-center p-4">
          <div className="max-w-xl w-full rounded-2xl border border-[#262626] bg-[#0a0a0a] p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-8 h-8 text-rose-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                <p className="text-xs text-[#a1a1a1] mt-0.5">
                  An unexpected UI runtime error occurred in this view.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 space-y-2">
                <div className="text-xs font-semibold text-rose-400">
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {this.state.errorInfo?.componentStack && (
                  <details className="text-[11px] font-mono text-[#a1a1a1] cursor-pointer">
                    <summary className="hover:text-white transition-colors">Component Stack Trace</summary>
                    <pre className="mt-2 p-2 rounded bg-black/60 overflow-x-auto whitespace-pre-wrap text-[10px] text-[#888]">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-lg shadow-emerald-900/30"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <a
                href="#/recruiter/dashboard"
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#333] bg-[#141414] hover:bg-[#222] text-white font-medium text-sm transition-colors"
              >
                <Home className="w-4 h-4 text-[#aaa]" />
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
