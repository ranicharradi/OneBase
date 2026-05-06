// ── Unified Suppliers — terminal aesthetic, browse unified records ──

import { useCallback, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { useSearch } from '../contexts/SearchContext';
import type { DataSource, SingletonListResponse, UnifiedSupplierListResponse } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Seg from '../components/ui/Seg';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';
import Pill from '../components/ui/Pill';
import Pagination from '../components/Pagination';

type Tab = 'unified' | 'singletons';

const PAGE_SIZE = 50;

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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [unifiedPage, setUnifiedPage] = useState(0);
  const [singletonsPage, setSingletonsPage] = useState(0);
  const unifiedTableRef = useRef<HTMLDivElement>(null);
  const singletonsTableRef = useRef<HTMLDivElement>(null);

  const handleUnifiedPageChange = useCallback((p: number) => {
    setUnifiedPage(p);
    unifiedTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSingletonsPageChange = useCallback((p: number) => {
    setSingletonsPage(p);
    singletonsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const { data: unifiedData, isLoading: unifiedLoading } = useQuery<UnifiedSupplierListResponse>({
    queryKey: ['unified-suppliers', search, sourceType, fromDate, toDate, unifiedPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (sourceType) params.set('source_type', sourceType);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(unifiedPage * PAGE_SIZE));
      return api.get(`/api/unified/suppliers?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const { data: singletonData, isLoading: singletonsLoading } = useQuery<SingletonListResponse>({
    queryKey: ['singletons', singletonSearch, singletonSourceId, singletonsPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (singletonSearch) params.set('search', singletonSearch);
      if (singletonSourceId) params.set('source_id', singletonSourceId);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(singletonsPage * PAGE_SIZE));
      return api.get(`/api/unified/singletons?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const { data: sources } = useQuery<DataSource[]>({
    queryKey: ['sources'],
    queryFn: () => api.get('/api/sources'),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<{ unified_supplier_id: number }>(`/api/unified/singletons/${id}/promote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['singletons'] });
      queryClient.invalidateQueries({ queryKey: ['unified-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const bulkPromoteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post<{ promoted_count: number }>('/api/unified/singletons/bulk-promote', { supplier_ids: ids }),
    onSuccess: () => {
      setSelectedSingletons(new Set());
      queryClient.invalidateQueries({ queryKey: ['singletons'] });
      queryClient.invalidateQueries({ queryKey: ['unified-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (sourceType) params.set('source_type', sourceType);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const qs = params.toString();
      const response = await fetch(`/api/unified/export${qs ? `?${qs}` : ''}`, {
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
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSingleton = (id: number) => {
    setSelectedSingletons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const filteredUnified = useMemo(() => {
    if (!unifiedData?.items) return [];
    if (!searchQuery) return unifiedData.items;
    const q = searchQuery.toLowerCase();
    return unifiedData.items.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.source_code?.toLowerCase().includes(q),
    );
  }, [unifiedData, searchQuery]);

  const filteredSingletons = useMemo(() => {
    if (!singletonData?.items) return [];
    if (!searchQuery) return singletonData.items;
    const q = searchQuery.toLowerCase();
    return singletonData.items.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.source_code?.toLowerCase().includes(q),
    );
  }, [singletonData, searchQuery]);

  const unifiedTotal = unifiedData?.total ?? 0;
  const singletonTotal = singletonData?.total ?? 0;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        {/* Header */}
        <div className="fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Unified records</h1>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
              {unifiedTotal.toLocaleString()} unified · {singletonTotal.toLocaleString()} singletons awaiting promotion
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="date"
              aria-label="From date"
              className="input mono"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setUnifiedPage(0); }}
              style={{ height: 24, fontSize: 11, padding: '0 6px' }}
            />
            <input
              type="date"
              aria-label="To date"
              className="input mono"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setUnifiedPage(0); }}
              style={{ height: 24, fontSize: 11, padding: '0 6px' }}
            />
            {exportError && (
              <span className="pill danger" style={{ padding: '2px 6px', fontSize: 10 }}>{exportError}</span>
            )}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="btn btn-sm"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span>
              {isExporting ? 'Exporting…' : (search || sourceType || fromDate || toDate) ? 'Export CSV (filtered)' : 'Export CSV'}
            </button>
          </div>
        </div>

        <Panel className="fade">
          <PanelHead>
            <Seg<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'unified', label: 'Unified', count: unifiedTotal },
                { value: 'singletons', label: 'Singletons', count: singletonTotal },
              ]}
            />
            {tab === 'unified' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setUnifiedPage(0); }}
                  placeholder="Filter by name or code…"
                  style={{ width: 260, height: 24, fontSize: 11 }}
                />
                <select
                  value={sourceType}
                  onChange={e => { setSourceType(e.target.value); setUnifiedPage(0); }}
                  className="input mono"
                  style={{ height: 24, fontSize: 11, padding: '0 8px' }}
                >
                  <option value="">All types</option>
                  <option value="merged">Merged</option>
                  <option value="singleton">Singleton</option>
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  value={singletonSearch}
                  onChange={e => { setSingletonSearch(e.target.value); setSingletonsPage(0); }}
                  placeholder="Search singletons…"
                  style={{ width: 220, height: 24, fontSize: 11 }}
                />
                <select
                  value={singletonSourceId}
                  onChange={e => { setSingletonSourceId(e.target.value); setSingletonsPage(0); }}
                  className="input mono"
                  style={{ height: 24, fontSize: 11, padding: '0 8px' }}
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
                    className="btn btn-sm btn-accent"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>verified</span>
                    {bulkPromoteMutation.isPending
                      ? 'Promoting…'
                      : `Promote ${selectedSingletons.size}`}
                  </button>
                )}
              </div>
            )}
          </PanelHead>

          {/* Unified table */}
          {tab === 'unified' && (
            <>
              {unifiedTotal > PAGE_SIZE && (
                <div
                  ref={unifiedTableRef}
                  style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border-0)',
                    scrollMarginTop: 56,
                  }}
                >
                  <Pagination
                    page={unifiedPage}
                    pageSize={PAGE_SIZE}
                    totalItems={unifiedTotal}
                    onPageChange={handleUnifiedPageChange}
                  />
                </div>
              )}

              {unifiedLoading && !unifiedData ? (
                <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                  Loading unified records…
                </div>
              ) : filteredUnified.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--fg-3)' }}>
                    inbox
                  </span>
                  <div style={{ fontSize: 13, marginTop: 8 }}>No unified records yet</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                    Merge match candidates or promote singletons to build your unified records.
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>ID</th>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th style={{ width: 60 }}>Ccy</th>
                      <th className="num" style={{ width: 80 }}>Sources</th>
                      <th>Origin</th>
                      <th>Created</th>
                      <th style={{ width: 30 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUnified.map(s => (
                      <tr
                        key={s.id}
                        className="clickable"
                        onClick={() => navigate(`/unified/${s.id}`)}
                      >
                        <td><IdChip>{s.id}</IdChip></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 500 }}>{s.name || '—'}</span>
                            {s.short_name && (
                              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                                ({s.short_name})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>
                          {s.source_code || '—'}
                        </td>
                        <td>{s.supplier_type || <span style={{ color: 'var(--fg-3)' }}>—</span>}</td>
                        <td className="mono">{s.currency || <span style={{ color: 'var(--fg-3)' }}>—</span>}</td>
                        <td className="num mono">{s.source_count}</td>
                        <td>
                          {s.is_singleton ? (
                            <Pill tone="warn">singleton</Pill>
                          ) : (
                            <Pill tone="ok">merged</Pill>
                          )}
                        </td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                          {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                            chevron_right
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {unifiedTotal > 0 && (
                <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-0)' }}>
                  <Pagination
                    page={unifiedPage}
                    pageSize={PAGE_SIZE}
                    totalItems={unifiedTotal}
                    onPageChange={handleUnifiedPageChange}
                  />
                </div>
              )}
            </>
          )}

          {/* Singletons table */}
          {tab === 'singletons' && (
            <>
              {singletonTotal > PAGE_SIZE && (
                <div
                  ref={singletonsTableRef}
                  style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border-0)',
                    scrollMarginTop: 56,
                  }}
                >
                  <Pagination
                    page={singletonsPage}
                    pageSize={PAGE_SIZE}
                    totalItems={singletonTotal}
                    onPageChange={handleSingletonsPageChange}
                  />
                </div>
              )}

              {singletonsLoading && !singletonData ? (
                <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                  Loading singletons…
                </div>
              ) : filteredSingletons.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--ok)' }}>
                    check_circle
                  </span>
                  <div style={{ fontSize: 13, marginTop: 8 }}>All records matched or unified</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                    No singleton candidates available for promotion.
                  </div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          checked={
                            !!singletonData &&
                            selectedSingletons.size === singletonData.items.length &&
                            singletonData.items.length > 0
                          }
                          onChange={toggleAllSingletons}
                          aria-label="Select all singletons"
                        />
                      </th>
                      <th style={{ width: 80 }}>ID</th>
                      <th>Name</th>
                      <th>Code</th>
                      <th style={{ width: 100 }}>Source</th>
                      <th style={{ width: 60 }}>Ccy</th>
                      <th style={{ width: 110 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSingletons.map(s => (
                      <tr key={s.id}>
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedSingletons.has(s.id)}
                            onChange={() => toggleSingleton(s.id)}
                            aria-label={`Select singleton ${s.id}`}
                          />
                        </td>
                        <td><IdChip>{s.id}</IdChip></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 500 }}>{s.name || '—'}</span>
                            {s.short_name && (
                              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                                ({s.short_name})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>
                          {s.source_code || '—'}
                        </td>
                        <td>
                          {s.data_source_name ? <SourcePill short={s.data_source_name} /> : <span style={{ color: 'var(--fg-3)' }}>—</span>}
                        </td>
                        <td className="mono">{s.currency || <span style={{ color: 'var(--fg-3)' }}>—</span>}</td>
                        <td>
                          <button
                            onClick={() => promoteMutation.mutate(s.id)}
                            disabled={promoteMutation.isPending}
                            className="btn btn-sm"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>verified</span>
                            Promote
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {singletonTotal > 0 && (
                <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-0)' }}>
                  <Pagination
                    page={singletonsPage}
                    pageSize={PAGE_SIZE}
                    totalItems={singletonTotal}
                    onPageChange={handleSingletonsPageChange}
                  />
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
