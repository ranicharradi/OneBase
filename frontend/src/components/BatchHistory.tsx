// ── Batch history table for data source — dark industrial theme ──

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { BatchResponse } from '../api/types';

interface BatchHistoryProps {
  dataSourceId: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  completed: { bg: 'bg-success-500/[0.06]', text: 'text-success-400', dot: 'bg-success-400' },
  complete: { bg: 'bg-success-500/[0.06]', text: 'text-success-400', dot: 'bg-success-400' },
  failed: { bg: 'bg-danger-500/[0.06]', text: 'text-danger-400', dot: 'bg-danger-400' },
  failure: { bg: 'bg-danger-500/[0.06]', text: 'text-danger-400', dot: 'bg-danger-400' },
  processing: { bg: 'bg-warning-500/[0.06]', text: 'text-warning-400', dot: 'bg-warning-400' },
  pending: { bg: 'bg-accent-500/[0.06]', text: 'text-accent-400', dot: 'bg-accent-400' },
  superseded: { bg: 'bg-surface-700/30', text: 'text-surface-500', dot: 'bg-surface-600' },
};

function getStatusStyle(status: string) {
  const key = status.toLowerCase();
  return STATUS_STYLES[key] ?? STATUS_STYLES.pending;
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
      <div className="rounded-xl border border-white/[0.06] bg-surface-900/40 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06]">
          <div className="h-4 w-32 rounded bg-surface-700 animate-pulse" />
        </div>
        <div className="divide-y divide-white/[0.04]">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
              <div className="h-3 w-40 rounded bg-surface-800" />
              <div className="h-3 w-20 rounded bg-surface-800" />
              <div className="h-3 w-16 rounded bg-surface-800" />
              <div className="h-3 w-32 rounded bg-surface-800 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger-500/20 bg-danger-500/[0.04] p-4 text-sm text-danger-400">
        Failed to load batch history
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.04] bg-surface-900/20 px-5 py-8 text-center">
        <svg className="mx-auto w-8 h-8 text-surface-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-surface-500">No uploads yet for this source</p>
      </div>
    );
  }

  // Sort by created_at descending
  const sorted = [...batches].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-900/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-surface-800/20">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Upload History</h4>
        </div>
        <span className="text-xs text-surface-600 tabular-nums">{sorted.length} uploads</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04] text-left">
              <th className="px-5 py-2.5 text-xs font-medium text-surface-600 uppercase tracking-wider">Filename</th>
              <th className="px-5 py-2.5 text-xs font-medium text-surface-600 uppercase tracking-wider">Uploaded By</th>
              <th className="px-5 py-2.5 text-xs font-medium text-surface-600 uppercase tracking-wider text-right">Rows</th>
              <th className="px-5 py-2.5 text-xs font-medium text-surface-600 uppercase tracking-wider">Status</th>
              <th className="px-5 py-2.5 text-xs font-medium text-surface-600 uppercase tracking-wider text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {sorted.map((batch) => {
              const style = getStatusStyle(batch.status);
              return (
                <tr key={batch.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-surface-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-gray-300 font-mono text-xs truncate max-w-[200px]">{batch.filename}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-surface-500">{batch.uploaded_by}</td>
                  <td className="px-5 py-3 text-right text-gray-300 tabular-nums font-mono text-xs">
                    {batch.row_count?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-surface-600 text-xs whitespace-nowrap">
                    {formatDate(batch.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
