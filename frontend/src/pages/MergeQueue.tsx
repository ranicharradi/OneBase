// ── Merge Queue — field reconciliation for confirmed duplicate pairs ──

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ReviewQueueItem, ReviewQueueResponse, ReviewStats } from '../api/types';
import { useSearch } from '../contexts/SearchContext';
import Panel, { PanelHead } from '../components/ui/Panel';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 50;

type BucketFilter = 'confirmed' | 'merged' | 'rejected';

interface Bucket {
  id: BucketFilter;
  label: string;
  tone: string;
  desc: string;
}

const BUCKETS: Bucket[] = [
  { id: 'confirmed', label: 'Ready to merge', tone: 'accent', desc: 'confirmed dupes awaiting reconciliation' },
  { id: 'merged',   label: 'Merged',          tone: 'ok',     desc: 'field-reconciled unified records created' },
  { id: 'rejected', label: 'Rejected',         tone: 'danger', desc: 'not a duplicate' },
];

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function confidenceTone(conf: number): 'ok' | 'warn' | 'danger' {
  const pct = conf * 100;
  return pct >= 85 ? 'ok' : pct >= 70 ? 'warn' : 'danger';
}

export default function MergeQueue() {
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();

  const [bucket, setBucket] = useState<BucketFilter>('confirmed');
  const [page, setPage] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', bucket);
    p.set('sort', 'confidence_desc');
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p;
  }, [bucket, page]);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['merge-queue', bucket, page],
    queryFn: () => api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
  });

  const { data: stats } = useQuery({
    queryKey: ['review-stats'],
    queryFn: () => api.get<ReviewStats>('/api/review/stats'),
  });

  const bucketCounts: Record<BucketFilter, number> = {
    confirmed: stats?.total_confirmed ?? 0,
    merged:    stats?.total_merged    ?? 0,
    rejected:  stats?.total_rejected  ?? 0,
  };

  const filteredItems = useMemo<ReviewQueueItem[]>(() => {
    if (!queue?.items) return [];
    if (!searchQuery) return queue.items;
    const q = searchQuery.toLowerCase();
    return queue.items.filter(item =>
      item.supplier_a_name?.toLowerCase().includes(q) ||
      item.supplier_b_name?.toLowerCase().includes(q) ||
      item.supplier_a_source?.toLowerCase().includes(q) ||
      item.supplier_b_source?.toLowerCase().includes(q),
    );
  }, [queue, searchQuery]);

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>

        {/* ── Stage rail ── */}
        <div className="fade" style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderRadius: 6,
          overflow: 'hidden', marginBottom: 12,
        }}>
          {/* 01 Review — dimmed */}
          <div style={{ padding: '10px 16px', minWidth: 180, opacity: 0.5, background: 'var(--bg-2)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden' }}>
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--fg-0)', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>01</span>
            <div className="label" style={{ color: 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>Review</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Same record?</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
              {stats?.total_pending ?? '—'}{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>pending</span>
            </div>
          </div>
          <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>
          {/* 02 Merge — active */}
          <div style={{ padding: '10px 16px', minWidth: 180, background: 'var(--accent-soft)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden' }}>
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--accent)', opacity: 0.08, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>02</span>
            <div className="label" style={{ color: 'var(--accent)', fontWeight: 600, position: 'relative' }}>Merge</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Reconcile fields</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)', marginTop: 4, position: 'relative' }}>
              {stats?.total_confirmed ?? '—'}{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>queued</span>
            </div>
          </div>
          <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>
          {/* 03 Unified — dimmed */}
          <div style={{ padding: '10px 16px', flex: 1, opacity: 0.45, background: 'var(--bg-2)', position: 'relative', overflow: 'hidden' }}>
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--fg-0)', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>03</span>
            <div className="label" style={{ color: 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>Unified</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Unified records</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
              {stats?.total_unified ?? '—'}{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>records</span>
            </div>
          </div>
        </div>

        {/* ── Title row ── */}
        <div className="fade" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="pill accent" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>STAGE 2 · MERGE</span>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Merge queue</h1>
        </div>

        {/* ── Bucket tabs ── */}
        <div className="fade" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {BUCKETS.map(b => {
            const active = bucket === b.id;
            return (
              <button
                key={b.id}
                onClick={() => { setBucket(b.id); setPage(0); }}
                style={{
                  padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                  background: active ? `var(--${b.tone}-soft)` : 'var(--bg-1)',
                  border: `1px solid ${active ? `var(--${b.tone})` : 'var(--border-0)'}`,
                  borderRadius: 6, fontFamily: 'inherit', color: 'var(--fg-0)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  boxShadow: active ? `inset 0 -3px 0 var(--${b.tone})` : 'none',
                  transition: 'background 0.1s, border-color 0.1s, box-shadow 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: `var(--${b.tone})`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {b.label}
                  </span>
                  <span className="pill-dot" style={{ background: `var(--${b.tone})` }} />
                </div>
                <span className="mono tnum" style={{
                  fontSize: 26, fontWeight: 600, lineHeight: 1,
                  color: active ? `var(--${b.tone})` : 'var(--fg-0)',
                  transition: 'color 0.15s',
                }}>
                  {bucketCounts[b.id]}
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-2)' }}>{b.desc}</span>
              </button>
            );
          })}
        </div>

        {/* ── Upstream hint ── */}
        <div className="fade" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', marginBottom: 14,
          background: 'var(--bg-2)', border: '1px solid var(--border-0)',
          borderRadius: 6, fontSize: 12, color: 'var(--fg-1)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fg-2)' }}>history</span>
          <span>
            <b>Upstream:</b> these pairs were confirmed as the same record in the{' '}
            <a
              onClick={(e) => { e.preventDefault(); navigate('/review'); }}
              href="/review"
              style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
            >
              Review queue
            </a>. Pick the correct value for each conflicting field.
          </span>
        </div>

        {/* ── Table ── */}
        <div ref={tableRef}>
          <Panel className="fade">
            <PanelHead title={`${queue?.total ?? 0} item${(queue?.total ?? 0) !== 1 ? 's' : ''}`} />
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Pair</th>
                  <th>Record</th>
                  <th style={{ width: 90 }} className="num">Confidence</th>
                  <th style={{ width: 120 }}>Confirmed by</th>
                  <th style={{ width: 90 }}>Age</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--fg-2)', fontSize: 12 }}>Loading…</td>
                  </tr>
                )}
                {!isLoading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--fg-2)', fontSize: 12 }}>
                      {bucket === 'confirmed' ? 'No items awaiting merge — review queue may still be empty.' : `No ${BUCKETS.find(b => b.id === bucket)?.label.toLowerCase()} items.`}
                    </td>
                  </tr>
                )}
                {filteredItems.map((item, i) => {
                  const tone = confidenceTone(item.confidence);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => navigate(`/merge/${item.id}`)}
                      style={{ cursor: 'pointer', animationDelay: `${i * 30}ms` }}
                    >
                      <td>
                        <IdChip>#{item.id}</IdChip>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {item.supplier_a_name || `#${item.supplier_a_id}`}{' '}
                          <span style={{ color: 'var(--fg-3)', fontWeight: 400 }}>↔</span>{' '}
                          {item.supplier_b_name || `#${item.supplier_b_id}`}
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                          {item.supplier_a_source && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <SourcePill short={item.supplier_a_source} />
                              {item.supplier_a_source_code && (
                                <span className="mono">{item.supplier_a_source_code}</span>
                              )}
                            </span>
                          )}
                          {item.supplier_b_source && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <SourcePill short={item.supplier_b_source} />
                              {item.supplier_b_source_code && (
                                <span className="mono">{item.supplier_b_source_code}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num">
                        <span className="mono tnum" style={{ fontSize: 12, fontWeight: 600, color: `var(--${tone})` }}>
                          {item.confidence.toFixed(3)}
                        </span>
                      </td>
                      <td>
                        {item.reviewed_by ? (
                          <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{item.reviewed_by}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                          {relativeTime(item.reviewed_at ?? item.created_at)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-accent"
                          style={{ padding: '0 10px' }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/merge/${item.id}`); }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>merge</span>
                          Reconcile
                          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>arrow_forward</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(queue?.total ?? 0) > PAGE_SIZE && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-0)' }}>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={queue?.total ?? 0}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
