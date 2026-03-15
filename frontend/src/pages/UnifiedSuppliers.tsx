// ── Unified Suppliers — browse golden records with provenance badges ──

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { UnifiedSupplierListResponse, SingletonListResponse, DataSource } from '../api/types';

type Tab = 'unified' | 'singletons';

function _ProvenanceBadge({ isAuto, sourceEntity }: { isAuto?: boolean; sourceEntity?: string }) {
  if (!sourceEntity) return null;
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider
        ${isAuto
          ? 'bg-surface-800 text-surface-400 border border-white/[0.06]'
          : 'bg-accent-500/10 text-accent-300 border border-accent-500/20'
        }
      `}
      title={isAuto ? 'Auto-resolved (identical or single-source)' : 'Manually chosen during merge'}
    >
      {sourceEntity.length > 20 ? sourceEntity.slice(0, 18) + '…' : sourceEntity}
      {!isAuto && (
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      )}
    </span>
  );
}
void _ProvenanceBadge;

function TypeBadge({ isSingleton }: { isSingleton: boolean }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider
        ${isSingleton
          ? 'bg-secondary-500/10 text-secondary-400 border border-secondary-500/20'
          : 'bg-success-500/10 text-success-400 border border-success-500/20'
        }
      `}
    >
      {isSingleton ? 'Singleton' : 'Merged'}
    </span>
  );
}

export default function UnifiedSuppliers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('unified');
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState<string>('');
  const [singletonSearch, setSingletonSearch] = useState('');
  const [singletonSourceId, setSingletonSourceId] = useState<string>('');
  const [selectedSingletons, setSelectedSingletons] = useState<Set<number>>(new Set());

  // Unified suppliers query
  const { data: unifiedData, isLoading: unifiedLoading } = useQuery<UnifiedSupplierListResponse>({
    queryKey: ['unified-suppliers', search, sourceType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (sourceType) params.set('source_type', sourceType);
      params.set('limit', '100');
      return api.get(`/api/unified/suppliers?${params}`);
    },
    enabled: tab === 'unified',
  });

  // Singletons query
  const { data: singletonData, isLoading: singletonsLoading } = useQuery<SingletonListResponse>({
    queryKey: ['singletons', singletonSearch, singletonSourceId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (singletonSearch) params.set('search', singletonSearch);
      if (singletonSourceId) params.set('source_id', singletonSourceId);
      params.set('limit', '100');
      return api.get(`/api/unified/singletons?${params}`);
    },
    enabled: tab === 'singletons',
  });

  // Sources for filter
  const { data: sources } = useQuery<DataSource[]>({
    queryKey: ['sources'],
    queryFn: () => api.get('/api/sources'),
  });

  // Promote single
  const promoteMutation = useMutation({
    mutationFn: (id: number) => api.post<{ unified_supplier_id: number }>(`/api/unified/singletons/${id}/promote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['singletons'] });
      queryClient.invalidateQueries({ queryKey: ['unified-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  // Bulk promote
  const bulkPromoteMutation = useMutation({
    mutationFn: (ids: number[]) => api.post<{ promoted_count: number }>('/api/unified/singletons/bulk-promote', { supplier_ids: ids }),
    onSuccess: () => {
      setSelectedSingletons(new Set());
      queryClient.invalidateQueries({ queryKey: ['singletons'] });
      queryClient.invalidateQueries({ queryKey: ['unified-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  // Export
  const handleExport = async () => {
    try {
      const response = await fetch('/api/unified/export', {
        headers: { Authorization: `Bearer ${localStorage.getItem('onebase_token')}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unified_suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      // Error handling
    }
  };

  const toggleSingleton = (id: number) => {
    setSelectedSingletons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllSingletons = () => {
    if (!singletonData) return;
    if (selectedSingletons.size === singletonData.items.length) {
      setSelectedSingletons(new Set());
    } else {
      setSelectedSingletons(new Set(singletonData.items.map(s => s.id)));
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display tracking-tight text-white text-glow-accent">Unified Suppliers</h1>
          <p className="text-sm text-surface-500 mt-1">Golden records with full provenance tracking</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500/10 text-accent-300 border border-accent-500/20 hover:bg-accent-500/20 transition-all duration-200 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-surface-900/80 border border-white/[0.06] w-fit">
        {(['unified', 'singletons'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              tab === t
                ? 'bg-accent-500/[0.08] text-accent-300 border border-accent-500/20'
                : 'text-surface-500 hover:text-gray-200 border border-transparent'
            }`}
          >
            {t === 'unified' ? `Unified Records${unifiedData ? ` (${unifiedData.total})` : ''}` : `Singletons${singletonData ? ` (${singletonData.total})` : ''}`}
          </button>
        ))}
      </div>

      {/* Unified tab */}
      {tab === 'unified' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search unified suppliers…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-800/60 border border-white/[0.08] text-sm text-gray-200 placeholder:text-surface-500 focus:outline-none focus:border-accent-500/40 focus:bg-surface-800 transition-all"
              />
            </div>
            <select
              value={sourceType}
              onChange={e => setSourceType(e.target.value)}
              className="px-3 py-2.5 rounded-lg bg-surface-800/60 border border-white/[0.08] text-sm text-gray-200 focus:outline-none focus:border-accent-500/40"
            >
              <option value="">All types</option>
              <option value="merged">Merged</option>
              <option value="singleton">Singleton</option>
            </select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-900/80 border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Code</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Type</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Currency</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Sources</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Origin</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Created</th>
                </tr>
              </thead>
              <tbody>
                {unifiedLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.04]">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-surface-800 rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : unifiedData?.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-surface-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                        </svg>
                        <p className="text-surface-500 text-sm">No unified suppliers yet</p>
                        <p className="text-surface-600 text-xs">Merge match candidates or promote singletons to build your golden records</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  unifiedData?.items.map((supplier, i) => (
                    <tr
                      key={supplier.id}
                      onClick={() => navigate(`/unified/${supplier.id}`)}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors"
                      style={{ animationDelay: `${i * 0.02}s` }}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-200">{supplier.name}</span>
                        {supplier.short_name && (
                          <span className="ml-2 text-xs text-surface-500">({supplier.short_name})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-surface-400">{supplier.source_code || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-surface-400">{supplier.supplier_type || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-surface-400">{supplier.currency || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-800 text-xs font-semibold text-surface-400 border border-white/[0.06]">
                          {supplier.source_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge isSingleton={supplier.is_singleton} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-surface-500">
                          {supplier.created_at ? new Date(supplier.created_at).toLocaleDateString() : '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {unifiedData && unifiedData.total > 0 && (
              <div className="px-4 py-2.5 border-t border-white/[0.04] bg-surface-900/40">
                <span className="text-[11px] text-surface-500">{unifiedData.total} unified suppliers</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Singletons tab */}
      {tab === 'singletons' && (
        <div className="space-y-4">
          {/* Filters + bulk action */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search singletons…"
                value={singletonSearch}
                onChange={e => setSingletonSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-800/60 border border-white/[0.08] text-sm text-gray-200 placeholder:text-surface-500 focus:outline-none focus:border-accent-500/40 focus:bg-surface-800 transition-all"
              />
            </div>
            <select
              value={singletonSourceId}
              onChange={e => setSingletonSourceId(e.target.value)}
              className="px-3 py-2.5 rounded-lg bg-surface-800/60 border border-white/[0.08] text-sm text-gray-200 focus:outline-none focus:border-accent-500/40"
            >
              <option value="">All sources</option>
              {sources?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedSingletons.size > 0 && (
              <button
                onClick={() => bulkPromoteMutation.mutate([...selectedSingletons])}
                disabled={bulkPromoteMutation.isPending}
                className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-500/10 text-accent-300 border border-accent-500/20 hover:bg-accent-500/20 transition-all duration-200 text-sm font-medium disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {bulkPromoteMutation.isPending ? 'Promoting…' : `Promote ${selectedSingletons.size} selected`}
              </button>
            )}
          </div>

          {/* Singletons table */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-900/80 border-b border-white/[0.06]">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={singletonData ? selectedSingletons.size === singletonData.items.length && singletonData.items.length > 0 : false}
                      onChange={toggleAllSingletons}
                      className="rounded border-surface-600 bg-surface-800 text-accent-500 focus:ring-accent-500/30"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Code</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Source</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Currency</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-surface-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {singletonsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.04]">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-surface-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : singletonData?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-surface-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <p className="text-surface-500 text-sm">All suppliers are matched or unified</p>
                        <p className="text-surface-600 text-xs">No singleton candidates available for promotion</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  singletonData?.items.map((s, _i) => (
                    <tr key={s.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSingletons.has(s.id)}
                          onChange={() => toggleSingleton(s.id)}
                          className="rounded border-surface-600 bg-surface-800 text-accent-500 focus:ring-accent-500/30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-200">{s.name || '—'}</span>
                        {s.short_name && <span className="ml-2 text-xs text-surface-500">({s.short_name})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-surface-400">{s.source_code || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-accent-400">{s.data_source_name || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-surface-400">{s.currency || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => promoteMutation.mutate(s.id)}
                          disabled={promoteMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success-500/10 text-success-400 border border-success-500/20 hover:bg-success-500/20 transition-all text-xs font-medium disabled:opacity-50"
                        >
                          Promote
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {singletonData && singletonData.total > 0 && (
              <div className="px-4 py-2.5 border-t border-white/[0.04] bg-surface-900/40">
                <span className="text-[11px] text-surface-500">{singletonData.total} singleton candidates</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
