// frontend/src/components/ui/LoadingErrorEmpty.tsx
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangleIcon, InboxIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  loading?: boolean;
  error?: Error | string | null;
  empty?: boolean;
  emptyMessage?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function LoadingErrorEmpty({
  loading, error, empty, emptyMessage = 'Nothing to show', children, className,
}: Props) {
  if (loading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-3/5" />
      </div>
    );
  }
  if (error) {
    const msg = typeof error === 'string' ? error : error.message;
    return (
      <div className={cn('flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive', className)}>
        <AlertTriangleIcon className="size-4" />
        <span>{msg}</span>
      </div>
    );
  }
  if (empty) {
    return (
      <div className={cn('flex flex-col items-center gap-2 py-12 text-muted-foreground', className)}>
        <InboxIcon className="size-8 opacity-50" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }
  return <>{children}</>;
}
