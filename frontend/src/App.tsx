// ── App router setup ──

import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import { ApiError } from './api/client';

const Ask = lazy(() => import('./pages/Ask'));
const Compare = lazy(() => import('./pages/Compare'));
const Comparisons = lazy(() => import('./pages/Comparisons'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const FileChecker = lazy(() => import('./pages/FileChecker'));
const Insights = lazy(() => import('./pages/Insights'));
const MergeDetail = lazy(() => import('./pages/MergeDetail'));
const MergeQueue = lazy(() => import('./pages/MergeQueue'));
const ReviewDetail = lazy(() => import('./pages/ReviewDetail'));
const ReviewQueue = lazy(() => import('./pages/ReviewQueue'));
const Sources = lazy(() => import('./pages/Sources'));
const UnifiedRecordDetail = lazy(() => import('./pages/UnifiedRecordDetail'));
const UnifiedRecords = lazy(() => import('./pages/UnifiedRecords'));
const Upload = lazy(() => import('./pages/Upload'));
const Users = lazy(() => import('./pages/Users'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 404) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<PageRoute><Dashboard /></PageRoute>} />
              <Route path="unified" element={<PageRoute><UnifiedRecords /></PageRoute>} />
              <Route path="unified/:id" element={<PageRoute><UnifiedRecordDetail /></PageRoute>} />
              <Route path="review" element={<PageRoute><ReviewQueue /></PageRoute>} />
              <Route path="review/:id" element={<PageRoute><ReviewDetail /></PageRoute>} />
              <Route path="merge" element={<PageRoute><MergeQueue /></PageRoute>} />
              <Route path="merge/:id" element={<PageRoute><MergeDetail /></PageRoute>} />
              <Route path="insights" element={<PageRoute><Insights /></PageRoute>} />
              <Route path="upload" element={<PageRoute><Upload /></PageRoute>} />
              <Route path="file-checker" element={<PageRoute><FileChecker /></PageRoute>} />
              <Route path="sources" element={<PageRoute><Sources /></PageRoute>} />
              <Route path="ask" element={<PageRoute><Ask /></PageRoute>} />
              <Route path="compare" element={<PageRoute><Compare /></PageRoute>} />
              <Route path="runs" element={<PageRoute><Comparisons /></PageRoute>} />
              <Route path="users" element={<PageRoute><Users /></PageRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

function PageRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
