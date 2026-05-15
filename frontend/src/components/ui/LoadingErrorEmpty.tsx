import type { ReactNode } from 'react';
import Spinner from './Spinner';

type Props = {
  isLoading: boolean;
  error?: unknown;
  isEmpty: boolean;
  emptyMessage?: ReactNode;
  errorPrefix?: string;
  children: ReactNode;
};

export function LoadingErrorEmpty({
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'No items',
  errorPrefix,
  children,
}: Props) {
  if (error) {
    const prefix = errorPrefix ? `${errorPrefix}: ` : '';
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div style={{ padding: 28, textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--danger)' }}>error</span>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
          {prefix}{msg}
        </div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
        <Spinner />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div style={{ padding: 36, textAlign: 'center' }}>
        {emptyMessage}
      </div>
    );
  }
  return <>{children}</>;
}
