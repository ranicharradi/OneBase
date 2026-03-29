// ── Unified Suppliers — browse golden records with provenance badges ──

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import Pagination from '../components/Pagination';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { useSearch } from '../contexts/SearchContext';
import type { UnifiedSupplierListResponse, SingletonListResponse, DataSource } from '../api/types';

type Tab = 'unified' | 'singletons';

function TypeBadge({ isSingleton }: { isSingleton: boolean }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider
        ${isSingleton
          ? 'bg-secondary-500/10 text-secondary-500 border border-secondary-500/20'
          : 'bg-success-bg text-success-500 border border-success-500/20'
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
  const { query: searchQuery } = useSearch();
  const [tab, setTab] = useState<Tab>('unified');
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState<string>('');
  const [singletonSearch, setSingletonSearch] = useState('');
  const [singletonSourceId, setSingletonSourceId] = useState<string>('');
  const [selectedSingletons, setSelectedSingletons] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [unifiedPage, setUnifiedPage] = useState(0);
  const [singletonsPage, setSingletonsPage] = useState(0);
  const pageSize = 50;

  // Unified suppliers query
  const { data: unifiedData, isLoading: unifiedLoading } = useQuery<UnifiedSupplierListResponse>({
    queryKey: ['unified-suppliers', search, sourceType, unifiedPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (sourceType) params.set('source_type', sourceType);
      params.set('limit', String(pageSize));
      params.set('offset', String(unifiedPage * pageSize));
      return api.get(`/api/unified/suppliers?${params}`);
    },
    enabled: tab === 'unified',
    placeholderData: keepPreviousData,
  });

  // Singletons query
  const { data: singletonData, isLoading: singletonsLoading } = useQuery<SingletonListResponse>({
    queryKey: ['singletons', singletonSearch, singletonSourceId, singletonsPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (singletonSearch) params.set('search', singletonSearch);
      if (singletonSourceId) params.set('source_id', singletonSourceId);
      params.set('limit', String(pageSize));
      params.set('offset', String(singletonsPage * pageSize));
      return api.get(`/api/unified/singletons?${params}`);
    },
    enabled: tab === 'singletons',
    placeholderData: keepPreviousData,
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
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch('/api/unified/export', {
        headers: { Authorization: `Bearer ${localStorage.getItem('onebase_token')}` },
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unified_suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setExportError(message);
    } finally {
      setIsExporting(false);
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
          <h1 className="text-3xl font-display font-extrabold tracking-tight text-on-surface">Unified Suppliers</h1>
          <p className="text-sm text-on-surface-variant/60 mt-1">Golden records with full provenance tracking</p>
        </div>
        <div className="flex items-center gap-3">
          {exportError && (
            <span className="text-xs text-danger-500">{exportError}</span>
          )}
          <button
            onClick={handleExport}
            disabled={isExporting}
            aria-label="Export unified suppliers as CSV"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600/10 text-accent-600 border border-accent-600/20 hover:bg-accent-600/20 transition-all duration-200 text-sm font-medium disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/45 border border-white/70 w-fit">
        {(['unified', 'singletons'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              tab === t
                ? 'bg-accent-600/[0.08] text-accent-600 border border-accent-600/20'
                : 'text-on-surface-variant/60 hover:text-on-surface border border-transparent'
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
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search unified suppliers…"
                value={search}
                onChange={e => { setSearch(e.target.value); setUnifiedPage(0); }}
                className="input-field w-full pl-10 pr-4 py-2.5 text-sm"
              />
            </div>
            <select
              value={sourceType}
              onChange={e => { setSourceType(e.target.value); setUnifiedPage(0); }}
              className="input-field px-3 py-2.5 text-sm"
            >
              <option value="">All types</option>
              <option value="merged">Merged</option>
              <option value="singleton">Singleton</option>
            </select>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-white/40 border-b border-on-surface/5">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Name</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Code</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Type</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Currency</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Sources</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Origin</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/[0.06]">
                {unifiedLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-white/30 rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : unifiedData?.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-on-surface-variant/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                        </svg>
                        <p className="text-on-surface-variant/60 text-sm">No unified suppliers yet</p>
                        <p className="text-outline text-xs">Merge match candidates or promote singletons to build your golden records</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  unifiedData?.items.filter(s => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return s.name?.toLowerCase().includes(q) || s.source_code?.toLowerCase().includes(q);
                  }).map((supplier, i) => (
                    <tr
                      key={supplier.id}
                      onClick={() => navigate(`/unified/${supplier.id}`)}
                      className="hover:bg-white/30 cursor-pointer transition-colors"
                      style={{ animationDelay: `${i * 0.02}s` }}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-on-surface">{supplier.name}</span>
                        {supplier.short_name && (
                          <span className="ml-2 text-xs text-on-surface-variant/60">({supplier.short_name})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-on-surface-variant">{supplier.source_code || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-on-surface-variant">{supplier.supplier_type || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-on-surface-variant">{supplier.currency || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/30 text-xs font-semibold text-on-surface-variant border border-on-surface/[0.06]">
                          {supplier.source_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge isSingleton={supplier.is_singleton} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-on-surface-variant/60">
                          {supplier.created_at ? new Date(supplier.created_at).toLocaleDateString() : '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {unifiedData && unifiedData.total > 0 && (
              <div className="px-4 py-2.5 bg-white/30 border-t border-on-surface/5">
                <span className="text-[11px] text-on-surface-variant/60">{unifiedData.total} unified suppliers</span>
              </div>
            )}
          </div>
          {unifiedData && unifiedData.total > 0 && (
            <Pagination
              page={unifiedPage}
              pageSize={pageSize}
              totalItems={unifiedData.total}
              onPageChange={setUnifiedPage}
            />
          )}
        </div>
      )}

      {/* Singletons tab */}
      {tab === 'singletons' && (
        <div className="space-y-4">
          {/* Filters + bulk action */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search singletons…"
                value={singletonSearch}
                onChange={e => { setSingletonSearch(e.target.value); setSingletonsPage(0); }}
                className="input-field w-full pl-10 pr-4 py-2.5 text-sm"
              />
            </div>
            <select
              value={singletonSourceId}
              onChange={e => { setSingletonSourceId(e.target.value); setSingletonsPage(0); }}
              className="input-field px-3 py-2.5 text-sm"
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
                className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-600/10 text-accent-600 border border-accent-600/20 hover:bg-accent-600/20 transition-all duration-200 text-sm font-medium disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {bulkPromoteMutation.isPending ? 'Promoting…' : `Promote ${selectedSingletons.size} selected`}
              </button>
            )}
          </div>

          {/* Singletons table */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-white/40 border-b border-on-surface/5">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={singletonData ? selectedSingletons.size === singletonData.items.length && singletonData.items.length > 0 : false}
                      onChange={toggleAllSingletons}
                      className="rounded border-on-surface-variant/30 bg-white/40 text-accent-600 focus:ring-accent-600/30"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Name</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Code</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Source</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Currency</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/[0.06]">
                {singletonsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-white/30 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : singletonData?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-on-surface-variant/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <p className="text-on-surface-variant/60 text-sm">All suppliers are matched or unified</p>
                        <p className="text-outline text-xs">No singleton candidates available for promotion</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  singletonData?.items.filter(s => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return s.name?.toLowerCase().includes(q) || s.source_code?.toLowerCase().includes(q);
                  }).map((s) => (
                    <tr key={s.id} className="hover:bg-white/30 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedSingletons.has(s.id)}
                          onChange={() => toggleSingleton(s.id)}
                          className="rounded border-on-surface-variant/30 bg-white/40 text-accent-600 focus:ring-accent-600/30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-on-surface">{s.name || '—'}</span>
                        {s.short_name && <span className="ml-2 text-xs text-on-surface-variant/60">({s.short_name})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-on-surface-variant">{s.source_code || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-accent-600">{s.data_source_name || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-on-surface-variant">{s.currency || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => promoteMutation.mutate(s.id)}
                          disabled={promoteMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success-bg text-success-500 border border-success-500/20 hover:bg-success-bg/80 transition-all text-xs font-medium disabled:opacity-50"
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
              <div className="px-4 py-2.5 bg-white/30 border-t border-on-surface/5">
                <span className="text-[11px] text-on-surface-variant/60">{singletonData.total} singleton candidates</span>
              </div>
            )}
          </div>
          {singletonData && singletonData.total > 0 && (
            <Pagination
              page={singletonsPage}
              pageSize={pageSize}
              totalItems={singletonData.total}
              onPageChange={setSingletonsPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
