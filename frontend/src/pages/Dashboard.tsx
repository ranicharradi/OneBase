// ── Dashboard — operational overview with stats and activity feed ──

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DashboardResponse } from '../api/types';

const DASHBOARD_REFRESH_MS = 30_000;

function StatCard({
  label,
  value,
  accent = false,
  icon,
  sub,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border p-5
        ${accent
          ? 'bg-accent-500/[0.06] border-accent-500/20 glow-accent'
          : 'bg-surface-900/60 border-white/[0.06]'
        }
        transition-all duration-300 hover:border-white/[0.1] hover:bg-surface-900/80
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500 mb-1.5">
            {label}
          </p>
          <p className={`text-3xl font-display tracking-tight ${accent ? 'text-accent-300 text-glow-accent' : 'text-white'}`}>
            {value}
          </p>
          {sub && (
            <p className="text-xs text-surface-500 mt-1">{sub}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${accent ? 'bg-accent-500/10 text-accent-400' : 'bg-white/[0.04] text-surface-500'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-surface-500 w-20 text-right font-medium">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-surface-400 w-14 text-right">{value} <span className="text-surface-600">({pct}%)</span></span>
    </div>
  );
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  merge_confirmed: { label: 'Merge confirmed', color: 'text-success-400' },
  match_rejected: { label: 'Match rejected', color: 'text-danger-400' },
  match_skipped: { label: 'Match skipped', color: 'text-secondary-400' },
  singleton_promoted: { label: 'Singleton promoted', color: 'text-accent-400' },
  unified_exported: { label: 'Data exported', color: 'text-accent-300' },
  file_uploaded: { label: 'File uploaded', color: 'text-success-400' },
  upload_completed: { label: 'Upload completed', color: 'text-success-400' },
  source_created: { label: 'Source created', color: 'text-accent-400' },
  source_updated: { label: 'Source updated', color: 'text-accent-400' },
  user_created: { label: 'User created', color: 'text-accent-400' },
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/unified/dashboard'),
    refetchInterval: DASHBOARD_REFRESH_MS,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-baseline gap-4">
          <h1 className="text-3xl font-display tracking-tight text-white text-glow-accent">Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface-900/60 border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-danger-400">
          {error instanceof Error ? error.message : 'Failed to load dashboard data'}
        </p>
      </div>
    );
  }

  const { uploads, matching, review, unified, recent_activity } = data;
  const reviewTotal = review.pending + review.confirmed + review.rejected + review.skipped;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-baseline gap-4">
        <h1 className="text-3xl font-display tracking-tight text-white text-glow-accent">Dashboard</h1>
        <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Operational Overview</span>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Staged Suppliers"
          value={uploads.total_staged.toLocaleString()}
          sub={`${uploads.completed} uploads completed`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
            </svg>
          }
        />
        <StatCard
          label="Match Candidates"
          value={matching.total_candidates.toLocaleString()}
          sub={`${matching.total_groups} groups${matching.avg_confidence ? ` · avg ${(matching.avg_confidence * 100).toFixed(0)}%` : ''}`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          }
        />
        <StatCard
          label="Pending Review"
          value={review.pending}
          sub={reviewTotal > 0 ? `${review.confirmed + review.rejected} reviewed` : 'No candidates yet'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Unified Records"
          value={unified.total_unified}
          accent
          sub={`${unified.merged} merged · ${unified.singletons} singletons`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          }
        />
      </div>

      {/* Middle row: Review Progress + Upload Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Review progress */}
        <div className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-surface-500 mb-5">Review Progress</h2>
          {reviewTotal === 0 ? (
            <p className="text-sm text-surface-500 italic">No match candidates to review yet</p>
          ) : (
            <div className="space-y-3">
              <ProgressBar label="Confirmed" value={review.confirmed} total={reviewTotal} color="bg-success-500" />
              <ProgressBar label="Rejected" value={review.rejected} total={reviewTotal} color="bg-danger-500" />
              <ProgressBar label="Skipped" value={review.skipped} total={reviewTotal} color="bg-secondary-500" />
              <ProgressBar label="Pending" value={review.pending} total={reviewTotal} color="bg-surface-500" />
            </div>
          )}
        </div>

        {/* Upload stats */}
        <div className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-surface-500 mb-5">Upload Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-surface-800/40 border border-white/[0.04]">
              <p className="text-2xl font-display text-white">{uploads.total_batches}</p>
              <p className="text-[11px] text-surface-500 uppercase tracking-wider mt-1">Total Uploads</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-surface-800/40 border border-white/[0.04]">
              <p className="text-2xl font-display text-success-400">{uploads.completed}</p>
              <p className="text-[11px] text-surface-500 uppercase tracking-wider mt-1">Completed</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-surface-800/40 border border-white/[0.04]">
              <p className="text-2xl font-display text-danger-400">{uploads.failed}</p>
              <p className="text-[11px] text-surface-500 uppercase tracking-wider mt-1">Failed</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-surface-800/40 border border-white/[0.04]">
              <p className="text-2xl font-display text-accent-300">{uploads.total_staged.toLocaleString()}</p>
              <p className="text-[11px] text-surface-500 uppercase tracking-wider mt-1">Staged Records</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-surface-500 mb-5">Recent Activity</h2>
        {recent_activity.length === 0 ? (
          <p className="text-sm text-surface-500 italic">No activity recorded yet</p>
        ) : (
          <div className="space-y-0">
            {recent_activity.map((entry, i) => {
              const actionInfo = ACTION_LABELS[entry.action] || { label: entry.action, color: 'text-surface-400' };
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 py-3 border-b border-white/[0.04] last:border-0"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${actionInfo.color.replace('text-', 'bg-')}`} />
                  <span className={`text-sm font-medium ${actionInfo.color}`}>{actionInfo.label}</span>
                  {entry.details && (
                    <span className="text-xs text-surface-500 truncate">
                      {entry.details.supplier_name
                        ? String(entry.details.supplier_name)
                        : entry.details.unified_supplier_name
                          ? String(entry.details.unified_supplier_name)
                          : entry.details.count
                            ? `${entry.details.count} records`
                            : ''}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-surface-600 flex-shrink-0">{formatTimeAgo(entry.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
