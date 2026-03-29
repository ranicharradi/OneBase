// ── Review Queue page — pending match candidates sorted by confidence ──
// Light glassmorphism aesthetic — data-dense queue with airy depth

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Pagination from '../components/Pagination';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { useSearch } from '../contexts/SearchContext';
import type { ReviewQueueResponse, ReviewStats, DataSource } from '../api/types';
import { SIGNAL_CONFIG } from '../utils/signals';

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85
      ? 'text-success-500 bg-success-bg border-success-500/20'
      : pct >= 65
        ? 'text-secondary-500 bg-secondary-500/10 border-secondary-500/20'
        : 'text-danger-500 bg-danger-500/10 border-danger-500/20';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-mono font-semibold rounded-md border ${color}`}>
      {pct}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'text-accent-600 bg-accent-600/10 rounded-full text-[10px] font-bold px-4 py-1',
    confirmed: 'text-success-500 bg-success-bg rounded-full text-[10px] font-bold px-4 py-1',
    rejected: 'text-danger-500 bg-danger-500/10 rounded-full text-[10px] font-bold px-4 py-1',
    skipped: 'text-outline bg-white/40 rounded-full text-[10px] font-bold px-4 py-1',
  };

  return (
    <span className={`inline-flex items-center uppercase tracking-wider ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

export default function ReviewQueue() {
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending');
  const [minConfidence, setMinConfidence] = useState('');
  const [maxConfidence, setMaxConfidence] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Build query params
  const params = new URLSearchParams();
  params.set('status', statusFilter);
  if (minConfidence) params.set('min_confidence', minConfidence);
  if (maxConfidence) params.set('max_confidence', maxConfidence);
  if (sourceFilter) params.set('source_a_id', sourceFilter);
  params.set('limit', String(pageSize));
  params.set('offset', String(page * pageSize));

  // Data queries
  const { data: queue, isLoading } = useQuery({
    queryKey: ['review-queue', statusFilter, minConfidence, maxConfidence, sourceFilter, page],
    queryFn: () => api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
    placeholderData: keepPreviousData,
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
          <h1 className="text-3xl font-display font-extrabold tracking-tight text-on-surface">
            Review Queue
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant/60">
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
              <span className="text-2xl font-mono font-bold text-on-surface">
                {stat.value}
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                stat.color === 'accent' ? 'text-accent-600' :
                stat.color === 'success' ? 'text-success-500' :
                stat.color === 'danger' ? 'text-danger-500' :
                stat.color === 'secondary' ? 'text-secondary-500' :
                'text-on-surface-variant'
              }`}>
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Source Entity
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Min Confidence
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              placeholder="0.00"
              value={minConfidence}
              onChange={(e) => { setMinConfidence(e.target.value); setPage(0); }}
              className="input-field w-28 text-sm font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Max Confidence
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              placeholder="1.00"
              value={maxConfidence}
              onChange={(e) => { setMaxConfidence(e.target.value); setPage(0); }}
              className="input-field w-28 text-sm font-mono"
            />
          </div>

          {/* Result count */}
          <div className="ml-auto flex items-center gap-2 text-sm text-on-surface-variant/60">
            {queue && (
              <>
                <span className="font-mono text-accent-600">{queue.total}</span>
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
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-on-surface/[0.06]">
                <div className="animate-shimmer h-4 w-16 rounded" />
                <div className="animate-shimmer h-4 w-40 rounded flex-1" />
                <div className="animate-shimmer h-4 w-40 rounded flex-1" />
                <div className="animate-shimmer h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : !queue?.items.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60">
            <svg className="w-12 h-12 mb-3 text-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">No candidates found</p>
            <p className="text-xs mt-1 text-outline">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_100px_90px_80px] gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 border-b border-on-surface/5 bg-white/40">
              <span>Supplier A</span>
              <span>Supplier B</span>
              <span className="text-center">Confidence</span>
              <span className="text-center">Status</span>
              <span className="text-center">Action</span>
            </div>

            {/* Rows */}
            <div>
              {(() => {
                const filteredItems = queue.items.filter(item => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    item.supplier_a_name?.toLowerCase().includes(q) ||
                    item.supplier_b_name?.toLowerCase().includes(q) ||
                    item.supplier_a_source?.toLowerCase().includes(q) ||
                    item.supplier_b_source?.toLowerCase().includes(q)
                  );
                });
                return filteredItems.map((item, i) => (
                <div
                  key={item.id}
                  className="group hover:bg-white/30 transition-colors cursor-pointer border-b border-on-surface/[0.06] last:border-b-0"
                  style={{ animationDelay: `${i * 0.03}s` }}
                  onClick={() => navigate(`/review/${item.id}`)}
                >
                  <div className="grid grid-cols-[1fr_1fr_100px_90px_80px] gap-4 items-center px-5 py-3.5">
                    {/* Supplier A */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {item.supplier_a_name || '—'}
                      </p>
                      {item.supplier_a_source && (
                        <span className="text-[11px] font-mono text-on-surface-variant/60">
                          {item.supplier_a_source}
                        </span>
                      )}
                    </div>

                    {/* Supplier B */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {item.supplier_b_name || '—'}
                      </p>
                      {item.supplier_b_source && (
                        <span className="text-[11px] font-mono text-on-surface-variant/60">
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
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-600/80 transition-colors"
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

                  {/* Signal badges */}
                  {item.match_signals && Object.keys(item.match_signals).length > 0 && (
                    <div className="px-5 pb-2 -mt-1 flex gap-2 flex-wrap">
                      {Object.entries(item.match_signals).map(([key, value]) => {
                        const config = SIGNAL_CONFIG[key];
                        if (!config) return null;
                        return (
                          <span
                            key={key}
                            className="text-[10px] font-mono text-on-surface-variant/60 bg-white/30 px-1.5 py-0.5 rounded"
                            title={config.label}
                          >
                            {config.shortLabel}: {(value * 100).toFixed(0)}%
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ));
              })()}
            </div>
          </>
        )}
      </div>

      {queue && queue.total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={queue.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
