// ── Batch history table for data source ──
// Dark Precision Editorial — matches Users table pattern with staggered rows, accent headers

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BatchResponse } from '../api/types';

interface BatchHistoryProps {
  dataSourceId: number;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; glow?: string }> = {
  completed: { bg: 'bg-success-500/10', text: 'text-success-400', dot: 'bg-success-400', glow: 'shadow-sm shadow-success-500/10' },
  complete: { bg: 'bg-success-500/10', text: 'text-success-400', dot: 'bg-success-400', glow: 'shadow-sm shadow-success-500/10' },
  failed: { bg: 'bg-danger-500/10', text: 'text-danger-400', dot: 'bg-danger-400', glow: 'shadow-sm shadow-danger-500/10' },
  failure: { bg: 'bg-danger-500/10', text: 'text-danger-400', dot: 'bg-danger-400', glow: 'shadow-sm shadow-danger-500/10' },
  processing: { bg: 'bg-accent-500/10', text: 'text-accent-400', dot: 'bg-accent-400' },
  pending: { bg: 'bg-accent-500/[0.06]', text: 'text-accent-400', dot: 'bg-accent-400' },
  superseded: { bg: 'bg-surface-700/30', text: 'text-surface-500', dot: 'bg-surface-600' },
};

function getStatusStyle(status: string) {
  const key = status.toLowerCase();
  return STATUS_CONFIG[key] ?? STATUS_CONFIG.pending;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BatchHistory({ dataSourceId }: BatchHistoryProps) {
  const { data: batches, isLoading, error } = useQuery({
    queryKey: ['batches', dataSourceId],
    queryFn: () => api.get<BatchResponse[]>(`/api/import/batches?data_source_id=${dataSourceId}`),
    enabled: !!dataSourceId,
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-white/[0.04] card">
        <div className="px-5 py-3.5 border-b border-white/[0.06]">
          <div className="h-3 w-32 rounded animate-shimmer" />
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['w-28', 'w-20', 'w-16', 'w-20', 'w-32'].map((w, i) => (
                <th key={i} className="px-5 py-3.5 text-left">
                  <div className={`h-3 ${w} rounded animate-shimmer`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(2)].map((_, i) => (
              <tr key={i} className="border-b border-white/[0.04]">
                <td className="px-5 py-3.5"><div className="h-4 w-36 rounded animate-shimmer" /></td>
                <td className="px-5 py-3.5"><div className="h-4 w-20 rounded animate-shimmer" /></td>
                <td className="px-5 py-3.5"><div className="h-4 w-12 rounded animate-shimmer" /></td>
                <td className="px-5 py-3.5"><div className="h-5 w-20 rounded-full animate-shimmer" /></td>
                <td className="px-5 py-3.5"><div className="h-4 w-28 rounded animate-shimmer" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger-500/20 bg-danger-500/[0.04] p-5 text-center animate-fadeIn">
        <svg className="w-7 h-7 text-danger-400/60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
        <p className="text-sm text-danger-400">Failed to load batch history</p>
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-surface-900/20 px-5 py-14 overflow-hidden animate-fadeIn">
        {/* Atmospheric background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-accent-500/[0.03] rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        <div className="relative">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-surface-800/40 border border-white/[0.06] mb-4 mx-auto animate-float">
            <svg className="w-6 h-6 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-display text-gray-300 mb-1 text-center">No uploads yet</p>
          <p className="text-xs text-surface-500 text-center">Upload a CSV file to see batch history here</p>
        </div>
      </div>
    );
  }

  // Sort by created_at descending
  const sorted = [...batches].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="overflow-hidden rounded-xl card animate-fadeIn">
      {/* Header — matching Users table header pattern */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-accent-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="text-xs font-semibold text-accent-400/70 uppercase tracking-[0.12em]">Upload History</h4>
        </div>
        <span className="text-[11px] text-surface-600 tabular-nums font-mono">{sorted.length} uploads</span>
      </div>

      {/* Table — matching Users table styling */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">Filename</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">Uploaded By</th>
              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">Rows</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">Status</th>
              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400/70">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {sorted.map((batch, index) => {
              const style = getStatusStyle(batch.status);
              const isProcessing = batch.status.toLowerCase() === 'processing';

              return (
                <tr
                  key={batch.id}
                  className={`transition-all duration-200 hover:bg-accent-500/[0.03] animate-slideUp stagger-${Math.min(index + 1, 8)}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-3.5 h-3.5 text-surface-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-gray-300 font-mono text-xs truncate max-w-[200px]">{batch.filename}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-surface-400">{batch.uploaded_by}</td>
                  <td className="px-5 py-3.5 text-right text-gray-300 tabular-nums font-mono text-xs">
                    {batch.row_count?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${style.glow ?? ''}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${isProcessing ? 'animate-pulse' : ''}`} />
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-surface-500 text-xs whitespace-nowrap font-mono">
                    {formatDate(batch.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer — status bar matching Users pattern */}
      <div className="border-t border-white/[0.04] bg-surface-900/50 px-5 py-3 flex items-center justify-between">
        <p className="text-xs text-surface-500 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {sorted.length} upload{sorted.length !== 1 ? 's' : ''} total
        </p>
        <div className="flex items-center gap-3">
          {(() => {
            const completed = sorted.filter(b => ['completed', 'complete'].includes(b.status.toLowerCase())).length;
            const failed = sorted.filter(b => ['failed', 'failure'].includes(b.status.toLowerCase())).length;
            return (
              <>
                {completed > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-success-400/50" />
                    <span className="text-[11px] text-surface-600">{completed} completed</span>
                  </div>
                )}
                {failed > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-danger-400/50" />
                    <span className="text-[11px] text-surface-600">{failed} failed</span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
