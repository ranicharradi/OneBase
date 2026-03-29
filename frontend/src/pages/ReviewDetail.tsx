// ── Review Detail page — side-by-side match comparison + merge UI ──
// Light glassmorphism aesthetic — field-level conflict resolution

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  MatchDetailResponse,
  FieldComparison,
  FieldSelection,
  ReviewActionResponse,
} from '../api/types';
import { SIGNAL_CONFIG } from '../utils/signals';

function SignalBar({ label, icon, value }: { label: string; icon: string; value: number }) {
  const pct = Math.round(value * 100);
  const barColor =
    pct >= 80 ? 'bg-success-500' : pct >= 50 ? 'bg-secondary-500' : 'bg-danger-500';

  return (
    <div className="flex items-center gap-3">
      <span className="text-base w-5 text-center opacity-60">{icon}</span>
      <span className="text-xs text-on-surface-variant w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-on-surface-variant w-10 text-right">{pct}%</span>
    </div>
  );
}

function ConfidenceRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (value * circumference);
  const color =
    pct >= 85 ? '#4CAF50' : pct >= 65 ? '#fbbf24' : '#f87171';

  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="var(--ring-track)" strokeWidth="4" />
        <circle
          cx="40" cy="40" r="36" fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-mono font-bold text-on-surface">{pct}%</span>
        <span className="text-[9px] uppercase tracking-wider text-on-surface-variant/60 mt-0.5">match</span>
      </div>
    </div>
  );
}

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Field selections for merge conflicts
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  // Load match detail
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['review-detail', id],
    queryFn: () => api.get<MatchDetailResponse>(`/api/review/candidates/${id}`),
    enabled: !!id,
  });

  // Conflict analysis
  const conflicts = useMemo(
    () => detail?.field_comparisons.filter((f) => f.is_conflict) ?? [],
    [detail],
  );
  const allConflictsResolved = conflicts.every((f) => selections[f.field] !== undefined);
  const isPending = detail?.status === 'pending';

  // Mutations
  const mergeMutation = useMutation({
    mutationFn: (body: { field_selections: FieldSelection[] }) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/merge`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      queryClient.invalidateQueries({ queryKey: ['review-detail', id] });
      setActionInFlight(null);
    },
    onError: () => setActionInFlight(null),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      queryClient.invalidateQueries({ queryKey: ['review-detail', id] });
      setActionInFlight(null);
    },
    onError: () => setActionInFlight(null),
  });

  const skipMutation = useMutation({
    mutationFn: () => api.post<ReviewActionResponse>(`/api/review/candidates/${id}/skip`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      queryClient.invalidateQueries({ queryKey: ['review-detail', id] });
      setActionInFlight(null);
    },
    onError: () => setActionInFlight(null),
  });

  const handleMerge = () => {
    if (!allConflictsResolved || !detail) return;
    setActionInFlight('merge');
    const fieldSelections: FieldSelection[] = Object.entries(selections).map(
      ([field, chosen_supplier_id]) => ({ field, chosen_supplier_id }),
    );
    mergeMutation.mutate({ field_selections: fieldSelections });
  };

  const handleReject = () => {
    setActionInFlight('reject');
    rejectMutation.mutate();
  };

  const handleSkip = () => {
    setActionInFlight('skip');
    skipMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="animate-shimmer h-8 w-64 rounded" />
        <div className="animate-shimmer h-64 w-full rounded-xl" />
        <div className="animate-shimmer h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant/60">
        <p className="text-sm">Match candidate not found</p>
        <button
          onClick={() => navigate('/review')}
          className="mt-4 text-xs text-accent-600 hover:text-accent-600/80"
        >
          ← Back to queue
        </button>
      </div>
    );
  }

  const { supplier_a, supplier_b, field_comparisons, match_signals } = detail;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header with back nav */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/review')}
          aria-label="Back to review queue"
          className="p-2 rounded-lg text-on-surface-variant/60 hover:text-accent-600 hover:bg-accent-600/10 transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-extrabold tracking-tight text-on-surface">
            Match Review
          </h1>
          <p className="text-sm text-on-surface-variant/60">
            Candidate #{detail.id} · {supplier_a.data_source_name} ↔ {supplier_b.data_source_name}
          </p>
        </div>

        {/* Status badge */}
        {!isPending && (
          <span className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-md border ${
            detail.status === 'confirmed'
              ? 'text-success-500 bg-success-bg border-success-500/20'
              : detail.status === 'rejected'
                ? 'text-danger-500 bg-danger-500/10 border-danger-500/20'
                : 'text-outline bg-white/40 border-on-surface/5'
          }`}>
            {detail.status}
            {detail.reviewed_by && (
              <span className="ml-1.5 text-on-surface-variant/60 normal-case">
                by {detail.reviewed_by}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Top section: confidence + signals */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        {/* Confidence ring */}
        <div className="card p-6 flex flex-col items-center justify-center gap-2">
          <ConfidenceRing value={detail.confidence} />
          <span className="text-[11px] uppercase tracking-wider text-on-surface-variant/60 font-semibold">
            Overall Confidence
          </span>
        </div>

        {/* Signal breakdowns */}
        <div className="card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-4">
            Signal Breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(match_signals).map(([key, value]) => {
              const config = SIGNAL_CONFIG[key] || { label: key, icon: '·' };
              return (
                <SignalBar
                  key={key}
                  label={config.label}
                  icon={config.icon}
                  value={value}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Side-by-side field comparison */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-on-surface/5 bg-white/40">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">
            Field Comparison
          </h3>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[160px_1fr_40px_1fr] gap-0 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 border-b border-on-surface/5">
          <span>Field</span>
          <span className="px-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-600/60" />
              {supplier_a.data_source_name}
            </span>
          </span>
          <span />
          <span className="px-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary-500/60" />
              {supplier_b.data_source_name}
            </span>
          </span>
        </div>

        {/* Field rows */}
        {field_comparisons.map((comp) => (
          <FieldRow
            key={comp.field}
            comp={comp}
            supplierAId={supplier_a.id}
            supplierBId={supplier_b.id}
            selectedId={selections[comp.field]}
            onSelect={(supplierId) =>
              setSelections((prev) => ({ ...prev, [comp.field]: supplierId }))
            }
            isPending={isPending}
          />
        ))}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              {conflicts.length > 0 ? (
                <span className="text-on-surface-variant">
                  {Object.keys(selections).length}/{conflicts.length} conflicts resolved
                  {!allConflictsResolved && (
                    <span className="ml-2 text-secondary-500">
                      — resolve all conflicts to merge
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-success-500">
                  No conflicts — all fields match or are source-only
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                disabled={actionInFlight !== null}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface border border-white/70 hover:border-on-surface/20 rounded-lg transition-all disabled:opacity-50"
              >
                {actionInFlight === 'skip' ? 'Skipping…' : 'Skip'}
              </button>
              <button
                onClick={handleReject}
                disabled={actionInFlight !== null}
                className="px-4 py-2 text-sm font-medium text-danger-500 hover:text-danger-500/80 border border-danger-500/20 hover:border-danger-500/40 hover:bg-danger-500/10 rounded-lg transition-all disabled:opacity-50"
              >
                {actionInFlight === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
              <button
                onClick={handleMerge}
                disabled={!allConflictsResolved || actionInFlight !== null}
                className="btn-primary"
              >
                {actionInFlight === 'merge' ? (
                  'Merging…'
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Confirm Merge
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error display */}
          {(mergeMutation.error || rejectMutation.error || skipMutation.error) && (
            <div className="mt-3 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-sm text-danger-500">
              {(mergeMutation.error as Error)?.message ||
               (rejectMutation.error as Error)?.message ||
               (skipMutation.error as Error)?.message}
            </div>
          )}
        </div>
      )}

      {/* Post-action banner */}
      {!isPending && detail.status === 'confirmed' && (
        <div className="card p-4 border-success-500/20 bg-success-bg/60">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-success-500">
              This match has been merged into a unified supplier record.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Field comparison row ──

function FieldRow({
  comp,
  supplierAId,
  supplierBId,
  selectedId,
  onSelect,
  isPending,
}: {
  comp: FieldComparison;
  supplierAId: number;
  supplierBId: number;
  selectedId?: number;
  onSelect: (id: number) => void;
  isPending: boolean;
}) {
  // Row styling based on field status
  let rowBg = '';
  let indicator = null;

  if (comp.is_conflict) {
    rowBg = 'bg-secondary-500/[0.04]';
    indicator = (
      <div className="flex items-center justify-center" title="Conflict — pick one">
        <svg className="w-4 h-4 text-secondary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
    );
  } else if (comp.is_identical) {
    rowBg = '';
    indicator = (
      <div className="flex items-center justify-center" title="Identical">
        <svg className="w-4 h-4 text-success-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    );
  } else if (comp.is_a_only || comp.is_b_only) {
    indicator = (
      <div className="flex items-center justify-center" title="Source-only">
        <span className="text-xs text-accent-600/60">→</span>
      </div>
    );
  } else {
    indicator = <div />;
  }

  const canSelect = comp.is_conflict && isPending;

  return (
    <div className={`grid grid-cols-[160px_1fr_40px_1fr] gap-0 px-5 py-3 border-b border-on-surface/[0.06] transition-colors ${rowBg}`}>
      {/* Field label */}
      <div className="flex items-center">
        <span className="text-xs font-medium text-on-surface-variant">{comp.label}</span>
      </div>

      {/* Value A */}
      <div
        className={`px-3 py-1.5 rounded-md transition-all cursor-${canSelect ? 'pointer' : 'default'} ${
          canSelect && selectedId === supplierAId
            ? 'bg-accent-600/10 border border-accent-600/30 ring-1 ring-accent-600/20'
            : canSelect
              ? 'hover:bg-white/30 border border-transparent'
              : 'border border-transparent'
        }`}
        onClick={() => canSelect && onSelect(supplierAId)}
      >
        <div className="flex items-center gap-2">
          {canSelect && (
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              selectedId === supplierAId
                ? 'border-accent-600 bg-accent-600'
                : 'border-on-surface-variant/40'
            }`}>
              {selectedId === supplierAId && (
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface" />
              )}
            </div>
          )}
          <span className={`text-sm font-mono ${
            comp.value_a ? 'text-on-surface' : 'text-outline italic'
          }`}>
            {comp.value_a || '—'}
          </span>
        </div>
      </div>

      {/* Indicator */}
      {indicator}

      {/* Value B */}
      <div
        className={`px-3 py-1.5 rounded-md transition-all cursor-${canSelect ? 'pointer' : 'default'} ${
          canSelect && selectedId === supplierBId
            ? 'bg-secondary-500/10 border border-secondary-500/30 ring-1 ring-secondary-500/20'
            : canSelect
              ? 'hover:bg-white/30 border border-transparent'
              : 'border border-transparent'
        }`}
        onClick={() => canSelect && onSelect(supplierBId)}
      >
        <div className="flex items-center gap-2">
          {canSelect && (
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              selectedId === supplierBId
                ? 'border-secondary-500 bg-secondary-500'
                : 'border-on-surface-variant/40'
            }`}>
              {selectedId === supplierBId && (
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface" />
              )}
            </div>
          )}
          <span className={`text-sm font-mono ${
            comp.value_b ? 'text-on-surface' : 'text-outline italic'
          }`}>
            {comp.value_b || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
