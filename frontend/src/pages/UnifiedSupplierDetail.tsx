// ── Unified Supplier Detail — provenance badges, source records, merge history ──

import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { UnifiedSupplierDetail as DetailType, FieldProvenance } from '../api/types';

const FIELD_LABELS: Record<string, string> = {
  name: 'Supplier Name',
  source_code: 'Supplier Code',
  short_name: 'Short Name',
  currency: 'Currency',
  payment_terms: 'Payment Terms',
  contact_name: 'Contact Name',
  supplier_type: 'Supplier Type',
};

function ProvenanceTag({ prov }: { prov: FieldProvenance }) {
  const isManual = !prov.auto;
  return (
    <div className="flex items-center gap-2 mt-1">
      <span
        className={`
          inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider
          ${isManual
            ? 'bg-accent-500/10 text-accent-300 border border-accent-500/20'
            : 'bg-surface-800 text-surface-400 border border-white/[0.06]'
          }
        `}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {isManual ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          )}
        </svg>
        {prov.source_entity || 'Unknown'}
      </span>
      {prov.chosen_by && (
        <span className="text-[10px] text-surface-600">
          by {prov.chosen_by}
          {prov.chosen_at && ` · ${new Date(prov.chosen_at).toLocaleDateString()}`}
        </span>
      )}
    </div>
  );
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  merge_confirmed: { label: 'Merge confirmed', color: 'text-success-400', icon: '✓' },
  match_rejected: { label: 'Match rejected', color: 'text-danger-400', icon: '✕' },
  match_skipped: { label: 'Match skipped', color: 'text-secondary-400', icon: '→' },
  singleton_promoted: { label: 'Singleton promoted', color: 'text-accent-400', icon: '↑' },
};

export default function UnifiedSupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: supplier, isLoading, error } = useQuery<DetailType>({
    queryKey: ['unified-detail', id],
    queryFn: () => api.get(`/api/unified/suppliers/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="h-8 w-48 bg-surface-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-surface-900/60 border border-white/[0.06] rounded-xl animate-pulse" />
          <div className="h-64 bg-surface-900/60 border border-white/[0.06] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="text-center py-20">
        <p className="text-danger-400 text-lg">Unified supplier not found</p>
        <button onClick={() => navigate('/unified')} className="mt-4 text-accent-400 text-sm hover:underline">
          ← Back to unified suppliers
        </button>
      </div>
    );
  }

  const isSingleton = supplier.match_candidate_id === null;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/unified')}
          className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-accent-400 transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to unified suppliers
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display tracking-tight text-white text-glow-accent">{supplier.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`
                  inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wider
                  ${isSingleton
                    ? 'bg-secondary-500/10 text-secondary-400 border border-secondary-500/20'
                    : 'bg-success-500/10 text-success-400 border border-success-500/20'
                  }
                `}
              >
                {isSingleton ? 'Singleton' : 'Merged'}
              </span>
              <span className="text-xs text-surface-500">
                ID: {supplier.id} · {supplier.source_supplier_ids.length} source record{supplier.source_supplier_ids.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <span className="text-xs text-surface-600">
            Created by {supplier.created_by} · {supplier.created_at ? new Date(supplier.created_at).toLocaleString() : ''}
          </span>
        </div>
      </div>

      {/* Main content — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Field values with provenance — spans 2 cols */}
        <div className="lg:col-span-2 rounded-xl border border-white/[0.06] bg-surface-900/60 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-surface-500 mb-5">Fields & Provenance</h2>
          <div className="space-y-4">
            {Object.entries(FIELD_LABELS).map(([field, label]) => {
              const value = (supplier as unknown as Record<string, unknown>)[field] as string | null;
              const prov = supplier.provenance[field];
              return (
                <div
                  key={field}
                  className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-6 py-3 border-b border-white/[0.04] last:border-0"
                >
                  <div className="w-36 flex-shrink-0">
                    <span className="text-xs font-semibold uppercase tracking-wider text-surface-500">{label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${value ? 'text-gray-200 font-medium' : 'text-surface-600 italic'}`}>
                      {value || 'Not set'}
                    </p>
                    {prov && <ProvenanceTag prov={prov} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right sidebar — source records + history */}
        <div className="space-y-6">
          {/* Source records */}
          <div className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-surface-500 mb-4">Source Records</h2>
            {supplier.source_records.length === 0 ? (
              <p className="text-sm text-surface-600 italic">No source records linked</p>
            ) : (
              <div className="space-y-3">
                {supplier.source_records.map(sr => (
                  <div key={sr.id} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-500/10 text-accent-400 text-xs font-bold border border-accent-500/20">
                        {sr.data_source_name?.[0] || '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 font-medium truncate">{sr.name || 'Unnamed'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold text-accent-400 uppercase">{sr.data_source_name}</span>
                        {sr.source_code && (
                          <span className="text-[10px] font-mono text-surface-500">{sr.source_code}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Merge history / Audit trail */}
          <div className="rounded-xl border border-white/[0.06] bg-surface-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-surface-500 mb-4">Audit Trail</h2>
            {supplier.merge_history.length === 0 ? (
              <p className="text-sm text-surface-600 italic">No audit entries</p>
            ) : (
              <div className="space-y-3">
                {supplier.merge_history.map(entry => {
                  const actionInfo = ACTION_LABELS[entry.action] || {
                    label: entry.action,
                    color: 'text-surface-400',
                    icon: '•',
                  };
                  return (
                    <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                      <span className={`text-base flex-shrink-0 mt-0.5 ${actionInfo.color}`}>
                        {actionInfo.icon}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${actionInfo.color}`}>{actionInfo.label}</p>
                        {entry.details && (
                          <div className="text-[11px] text-surface-500 mt-0.5 space-y-0.5">
                            {entry.details.conflict_count !== undefined && (
                              <p>{String(entry.details.conflict_count)} conflicts resolved</p>
                            )}
                            {entry.details.source != null && (
                              <p>Source: {String(entry.details.source)}</p>
                            )}
                            {entry.details.reviewed_by != null && (
                              <p>By: {String(entry.details.reviewed_by)}</p>
                            )}
                          </div>
                        )}
                        <p className="text-[10px] text-surface-600 mt-1">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
