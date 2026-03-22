// ── Batch history table for data source ──
// Light Glassmorphism — airy table with soft headers and glass rows

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BatchResponse } from '../api/types';

interface BatchHistoryProps {
  dataSourceId?: number;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; glow?: string }> = {
  completed: { bg: 'bg-success-500/10', text: 'text-success-500', dot: 'bg-success-500', glow: 'shadow-sm shadow-success-500/10' },
  complete: { bg: 'bg-success-500/10', text: 'text-success-500', dot: 'bg-success-500', glow: 'shadow-sm shadow-success-500/10' },
  failed: { bg: 'bg-danger-500/10', text: 'text-danger-500', dot: 'bg-danger-500', glow: 'shadow-sm shadow-danger-500/10' },
  failure: { bg: 'bg-danger-500/10', text: 'text-danger-500', dot: 'bg-danger-500', glow: 'shadow-sm shadow-danger-500/10' },
  processing: { bg: 'bg-accent-600/10', text: 'text-accent-600', dot: 'bg-accent-600' },
  pending: { bg: 'bg-accent-600/[0.06]', text: 'text-accent-600', dot: 'bg-accent-600' },
  superseded: { bg: 'bg-white/20', text: 'text-on-surface-variant/60', dot: 'bg-on-surface-variant/40' },
};

const DELETABLE_STATUSES = new Set(['pending', 'failed', 'failure']);

function getStatusStyle(status: string) {
  const key = status.toLowerCase();
  return STATUS_CONFIG[key] ?? STATUS_CONFIG.pending;
}

function displayFilename(stored: string): string {
  // Strip UUID prefix: "a3f9dfee-e1bd-4593-9712-f9819c85d50a_Original.csv" → "Original.csv"
  const match = stored.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/);
  return match ? match[1] : stored;
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
  const queryClient = useQueryClient();

  const { data: batches, isLoading, error } = useQuery({
    queryKey: ['batches', dataSourceId ?? 'all'],
    queryFn: () =>
      api.get<BatchResponse[]>(
        dataSourceId
          ? `/api/import/batches?data_source_id=${dataSourceId}`
          : '/api/import/batches'
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: number) => api.delete(`/api/import/batches/${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-on-surface/[0.06] card">
        <div className="px-5 py-3.5 border-b border-on-surface/[0.06]">
          <div className="h-3 w-32 rounded bg-white/30 animate-pulse" />
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-on-surface/[0.06]">
              {['w-28', 'w-20', 'w-16', 'w-20', 'w-32'].map((w, i) => (
                <th key={i} className="px-5 py-3.5 text-left">
                  <div className={`h-3 ${w} rounded bg-white/30 animate-pulse`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(2)].map((_, i) => (
              <tr key={i} className="border-b border-on-surface/[0.06]">
                <td className="px-5 py-3.5"><div className="h-4 w-36 rounded bg-white/30 animate-pulse" /></td>
                <td className="px-5 py-3.5"><div className="h-4 w-20 rounded bg-white/30 animate-pulse" /></td>
                <td className="px-5 py-3.5"><div className="h-4 w-12 rounded bg-white/30 animate-pulse" /></td>
                <td className="px-5 py-3.5"><div className="h-5 w-20 rounded-full bg-white/30 animate-pulse" /></td>
                <td className="px-5 py-3.5"><div className="h-4 w-28 rounded bg-white/30 animate-pulse" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger-500/20 bg-danger-500/[0.06] p-5 text-center animate-fadeIn">
        <svg className="w-7 h-7 text-danger-500/60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
        <p className="text-sm text-danger-500">Failed to load batch history</p>
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center rounded-2xl border border-on-surface/[0.06] bg-white/15 px-5 py-14 overflow-hidden animate-fadeIn">
        {/* Atmospheric background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-accent-600/[0.04] rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        <div className="relative">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/30 border border-on-surface/5 mb-4 mx-auto animate-float">
            <svg className="w-6 h-6 text-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-display font-bold text-on-surface mb-1 text-center">No uploads yet</p>
          <p className="text-xs text-on-surface-variant/60 text-center">Upload a CSV file to see batch history here</p>
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
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-on-surface/[0.06]">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-accent-600/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Upload History</h4>
        </div>
        <span className="text-[11px] text-outline tabular-nums font-mono">{sorted.length} uploads</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-on-surface/[0.06]">
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Filename</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Uploaded By</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Rows</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Status</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Date</th>
              <th className="px-5 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-on-surface/[0.06]">
            {sorted.map((batch, index) => {
              const style = getStatusStyle(batch.status);
              const isProcessing = batch.status.toLowerCase() === 'processing';
              const canDelete = DELETABLE_STATUSES.has(batch.status.toLowerCase());

              return (
                <tr
                  key={batch.id}
                  className={`transition-all duration-200 hover:bg-white/30 animate-slideUp stagger-${Math.min(index + 1, 8)} group`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-3.5 h-3.5 text-outline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-on-surface font-mono text-xs truncate max-w-[200px]">{displayFilename(batch.filename)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant">{batch.uploaded_by}</td>
                  <td className="px-5 py-3.5 text-right text-on-surface tabular-nums font-mono text-xs">
                    {batch.row_count?.toLocaleString() ?? '--'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border border-on-surface/[0.06] px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${isProcessing ? 'animate-pulse' : ''}`} />
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-on-surface-variant/60 text-xs whitespace-nowrap font-mono">
                    {formatDate(batch.created_at)}
                  </td>
                  <td className="px-2 py-3.5">
                    {canDelete && (
                      <button
                        onClick={() => deleteMutation.mutate(batch.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 transition-all"
                        title="Dismiss"
                        aria-label={`Dismiss batch ${displayFilename(batch.filename)}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-on-surface/[0.06] bg-white/30 px-5 py-3 flex items-center justify-between">
        <p className="text-xs text-on-surface-variant/60 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
                    <div className="w-1.5 h-1.5 rounded-full bg-success-500/50" />
                    <span className="text-[11px] text-outline">{completed} completed</span>
                  </div>
                )}
                {failed > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-danger-500/50" />
                    <span className="text-[11px] text-outline">{failed} failed</span>
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
