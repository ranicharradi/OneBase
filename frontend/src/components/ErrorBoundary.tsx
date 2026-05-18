import { Component, type ErrorInfo, type ReactNode } from 'react';
import { XCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <div className="flex items-center justify-center min-h-[60vh] p-6 bg-background">
          <section className="w-full max-w-[480px] rounded-md border border-border shadow-md bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-destructive">
                Something went wrong
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                client error
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <XCircleIcon className="size-4 text-destructive shrink-0 mt-0.5" />
                <div className="font-mono text-xs text-foreground/80 break-words">
                  {this.state.error?.message || 'An unexpected error occurred'}
                </div>
              </div>
            </div>
            <div className="px-3.5 py-2.5 border-t border-border flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCwIcon className="size-3" />
                Reload page
              </Button>
              <Button size="sm" onClick={this.handleRetry}>
                Try again
              </Button>
            </div>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}
