// ── Protected route guard ──

import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-accent-600/30 border-t-accent-600 rounded-full animate-spin" />
        <span className="text-sm text-on-surface-variant/60 tracking-wide uppercase">
          Loading
        </span>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
