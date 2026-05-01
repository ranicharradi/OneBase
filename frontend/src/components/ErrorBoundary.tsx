import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 24,
            background: 'var(--bg-0)',
          }}
        >
          <section
            className="panel fade"
            style={{ width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-md)' }}
          >
            <div className="panel-head">
              <span className="panel-title" style={{ color: 'var(--danger)' }}>
                Something went wrong
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                client error
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: 'var(--danger)' }}
                >
                  error
                </span>
                <div className="mono" style={{ fontSize: 12, color: 'var(--fg-1)', wordBreak: 'break-word' }}>
                  {this.state.error?.message || 'An unexpected error occurred'}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--border-0)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button onClick={() => window.location.reload()} className="btn btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
                Reload page
              </button>
              <button onClick={this.handleRetry} className="btn btn-sm btn-accent">
                Try again
              </button>
            </div>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}
