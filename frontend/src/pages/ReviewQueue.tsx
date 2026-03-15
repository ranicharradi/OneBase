// ── Review Queue page — pending match candidates sorted by confidence ──
// Dark Precision Editorial aesthetic — data-dense queue with atmospheric depth

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { ReviewQueueResponse, ReviewStats, DataSource } from '../api/types';

// ── Signal label formatting ──
const _SIGNAL_LABELS: Record<string, string> = {
  jaro_winkler: 'Jaro-Winkler',
  token_jaccard: 'Token Jaccard',
  embedding_cosine: 'Embedding',
  short_name_match: 'Short Name',
  currency_match: 'Currency',
  contact_match: 'Contact',
};
void _SIGNAL_LABELS;

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85
      ? 'text-success-400 bg-success-500/10 border-success-500/20'
      : pct >= 65
        ? 'text-secondary-400 bg-secondary-500/10 border-secondary-500/20'
        : 'text-danger-400 bg-danger-500/10 border-danger-500/20';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-mono font-semibold rounded-md border ${color}`}>
      {pct}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'text-accent-400 bg-accent-500/10 border-accent-500/20',
    confirmed: 'text-success-400 bg-success-500/10 border-success-500/20',
    rejected: 'text-danger-400 bg-danger-500/10 border-danger-500/20',
    skipped: 'text-surface-400 bg-surface-500/10 border-surface-500/20',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded border ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

export default function ReviewQueue() {
  const navigate = useNavigate();

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending');
  const [minConfidence, setMinConfidence] = useState('');
  const [maxConfidence, setMaxConfidence] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Build query params
  const params = new URLSearchParams();
  params.set('status', statusFilter);
  if (minConfidence) params.set('min_confidence', minConfidence);
  if (maxConfidence) params.set('max_confidence', maxConfidence);
  if (sourceFilter) params.set('source_a_id', sourceFilter);

  // Data queries
  const { data: queue, isLoading } = useQuery({
    queryKey: ['review-queue', statusFilter, minConfidence, maxConfidence, sourceFilter],
    queryFn: () => api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
  });

  const { data: stats } = useQuery({
    queryKey: ['review-stats'],
    queryFn: () => api.get<ReviewStats>('/api/review/stats'),
  });

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display tracking-tight text-white text-glow-accent">
            Review Queue
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Match candidates awaiting human review
          </p>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-slideUp">
          {[
            { label: 'Pending', value: stats.total_pending, color: 'accent' },
            { label: 'Confirmed', value: stats.total_confirmed, color: 'success' },
            { label: 'Rejected', value: stats.total_rejected, color: 'danger' },
            { label: 'Skipped', value: stats.total_skipped, color: 'surface' },
            { label: 'Unified', value: stats.total_unified, color: 'secondary' },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="card px-4 py-3 flex flex-col items-center gap-1"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="text-2xl font-mono font-bold text-white">
                {stat.value}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider text-${stat.color}-400`}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Status filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-36 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
              <option value="skipped">Skipped</option>
              <option value="">All</option>
            </select>
          </div>

          {/* Source filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
              Source Entity
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="input-field w-40 text-sm"
            >
              <option value="">All Sources</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Confidence range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
              Min Confidence
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              placeholder="0.00"
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
              className="input-field w-28 text-sm font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
              Max Confidence
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              placeholder="1.00"
              value={maxConfidence}
              onChange={(e) => setMaxConfidence(e.target.value)}
              className="input-field w-28 text-sm font-mono"
            />
          </div>

          {/* Result count */}
          <div className="ml-auto flex items-center gap-2 text-sm text-surface-500">
            {queue && (
              <>
                <span className="font-mono text-accent-400">{queue.total}</span>
                <span>candidates</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Queue table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="space-y-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.04]">
                <div className="animate-shimmer h-4 w-16 rounded" />
                <div className="animate-shimmer h-4 w-40 rounded flex-1" />
                <div className="animate-shimmer h-4 w-40 rounded flex-1" />
                <div className="animate-shimmer h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : !queue?.items.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-surface-500">
            <svg className="w-12 h-12 mb-3 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">No candidates found</p>
            <p className="text-xs mt-1 text-surface-600">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_100px_90px_80px] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-surface-500 border-b border-white/[0.06] bg-surface-900/50">
              <span>Supplier A</span>
              <span>Supplier B</span>
              <span className="text-center">Confidence</span>
              <span className="text-center">Status</span>
              <span className="text-center">Action</span>
            </div>

            {/* Rows */}
            {queue.items.map((item, i) => (
              <div
                key={item.id}
                className="group grid grid-cols-[1fr_1fr_100px_90px_80px] gap-4 items-center px-5 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
                style={{ animationDelay: `${i * 0.03}s` }}
                onClick={() => navigate(`/review/${item.id}`)}
              >
                {/* Supplier A */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {item.supplier_a_name || '—'}
                  </p>
                  {item.supplier_a_source && (
                    <span className="text-[11px] font-mono text-surface-500">
                      {item.supplier_a_source}
                    </span>
                  )}
                </div>

                {/* Supplier B */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {item.supplier_b_name || '—'}
                  </p>
                  {item.supplier_b_source && (
                    <span className="text-[11px] font-mono text-surface-500">
                      {item.supplier_b_source}
                    </span>
                  )}
                </div>

                {/* Confidence */}
                <div className="text-center">
                  <ConfidenceBadge value={item.confidence} />
                </div>

                {/* Status */}
                <div className="text-center">
                  <StatusBadge status={item.status} />
                </div>

                {/* Action */}
                <div className="text-center">
                  <button
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-400 hover:text-accent-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/review/${item.id}`);
                    }}
                  >
                    Review
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer status */}
      {queue && queue.total > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-surface-600">
          <span>
            Showing {queue.items.length} of {queue.total} candidates
          </span>
          {queue.has_more && (
            <span className="text-surface-500">
              Scroll or adjust filters to see more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
