// ── Review Queue — terminal aesthetic, card-first ──

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { useSearch } from '../contexts/SearchContext';
import type { ReviewQueueResponse, ReviewActionResponse, ReviewStats, DataSource } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pagination from '../components/Pagination';

type BucketFilter = 'pending' | 'confirmed' | 'rejected';

const BUCKETS: { id: BucketFilter; label: string; desc: string; tone: string }[] = [
  { id: 'pending',   label: 'Pending',       desc: 'awaiting decision',   tone: 'warn'   },
  { id: 'confirmed', label: 'Confirmed dupe', desc: '→ sent to merge',     tone: 'ok'     },
  { id: 'rejected',  label: 'Not a dupe',     desc: 'split into separate', tone: 'danger' },
];

const PAGE_SIZE = 20;

// Small confidence ring — SVG donut centred on a number
function ConfRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 85 ? 'ok' : pct >= 65 ? 'warn' : 'danger';
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 48, height: 48 }}>
      <svg viewBox="0 0 40 40" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border-0)" strokeWidth="3" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke={`var(--${tone})`} strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="mono tnum" style={{ fontSize: 11, fontWeight: 600, color: `var(--${tone})`, lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: 7, color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>conf</span>
      </div>
    </div>
  );
}

// Source pill fixed to record-identity color
function RecordPill({ short, tone }: { short: string; tone: 'a' | 'b' }) {
  const style =
    tone === 'a'
      ? { background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }
      : { background: 'var(--info-soft)', border: '1px solid var(--info-border)', color: 'var(--info)' };
  return (
    <span
      className="mono"
      style={{ ...style, display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}
    >
      {short.toUpperCase()}
    </span>
  );
}

// Relative time from ISO string
function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ReviewQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query: searchQuery } = useSearch();

  const [bucket, setBucket] = useState<BucketFilter>('pending');
  const [minConfidence, setMinConfidence] = useState(0);
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', bucket);
    if (minConfidence > 0) p.set('min_confidence', (minConfidence / 100).toFixed(2));
    if (sourceFilter) p.set('source_a_id', sourceFilter);
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p;
  }, [bucket, minConfidence, sourceFilter, page]);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['review-queue', bucket, minConfidence, sourceFilter, page],
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

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
    },
  });

  const bucketCounts: Record<BucketFilter, number> = {
    pending:   stats?.total_pending   ?? 0,
    confirmed: stats?.total_confirmed ?? 0,
    rejected:  stats?.total_rejected  ?? 0,
  };

  const filteredItems = useMemo(() => {
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
          {/* 01 Review — active */}
          <div style={{ padding: '10px 16px', minWidth: 180, background: 'var(--warn-soft)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden' }}>
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--warn)', opacity: 0.08, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>01</span>
            <div className="label" style={{ color: 'var(--warn)', fontWeight: 600, position: 'relative' }}>Review</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Same record?</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--warn)', marginTop: 4, position: 'relative' }}>
              {stats?.total_pending ?? '—'}{' '}
              <span style={{ fontSize: 10, color: 'var(--fg-2)', fontWeight: 400 }}>pending</span>
            </div>
          </div>
          <div style={{ alignSelf: 'center', padding: '0 8px', color: 'var(--fg-3)', fontSize: 14 }}>→</div>
          {/* 02 Merge — dimmed but clickable */}
          <div
            onClick={() => navigate('/merge')}
            style={{ padding: '10px 16px', minWidth: 180, opacity: 0.5, background: 'var(--bg-2)', borderRight: '1px solid var(--border-0)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
            title="Go to Merge queue"
          >
            <span className="mono" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 52, fontWeight: 700, color: 'var(--fg-0)', opacity: 0.05, lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>02</span>
            <div className="label" style={{ color: 'var(--fg-2)', fontWeight: 600, position: 'relative' }}>Merge</div>
            <div style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 2, position: 'relative' }}>Reconcile fields</div>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-1)', marginTop: 4, position: 'relative' }}>
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
          <span className="pill warn" style={{ padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>STAGE 1 · REVIEW</span>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Review queue</h1>
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

        {/* ── Handoff banner ── */}
        <div className="fade" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', marginBottom: 14,
          background: 'var(--accent-soft)', border: '1px dashed var(--accent-border)',
          borderRadius: 6, fontSize: 12, color: 'var(--fg-1)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>call_split</span>
          <span>
            <b>Handoff:</b> items confirmed here move to the{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Merge queue</span>{' '}
            for field-level reconciliation by a data steward.
          </span>
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>auto-routed · no merging on this screen</span>
        </div>

        {/* ── Filters ── */}
        <Panel className="fade">
          <PanelHead>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <select
                className="input mono"
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
                style={{ height: 24, fontSize: 11, padding: '0 8px', maxWidth: 200 }}
              >
                <option value="">All sources</option>
                {sources?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="label">min confidence</span>
              <input
                type="range" min={0} max={100} step={5} value={minConfidence}
                onChange={(e) => { setMinConfidence(Number(e.target.value)); setPage(0); }}
                style={{ width: 120, accentColor: 'var(--accent)' }}
                aria-label="Minimum confidence"
              />
              <span className="mono tnum" style={{ fontSize: 11, width: 36 }}>
                {(minConfidence / 100).toFixed(2)}
              </span>
            </div>
          </PanelHead>

          {/* Top pagination */}
          {queue && queue.total > PAGE_SIZE && (
            <div ref={tableRef} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-0)', scrollMarginTop: 56 }}>
              <Pagination page={page} pageSize={PAGE_SIZE} totalItems={queue.total} onPageChange={handlePageChange} />
            </div>
          )}

          {/* Card list */}
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isLoading && !queue ? (
              <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                Loading queue…
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--fg-3)' }}>inbox</span>
                <div style={{ marginTop: 8 }}>No candidates match the current filters.</div>
              </div>
            ) : filteredItems.map((item, i) => {
              const isPending = item.status === 'pending';
              const statusTone = item.status === 'confirmed' ? 'ok' : item.status === 'rejected' ? 'danger' : null;

              return (
                <div
                  key={item.id}
                  className="review-card"
                  style={{
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border-0)',
                    borderLeft: statusTone ? `3px solid var(--${statusTone})` : '3px solid transparent',
                    borderRadius: 6,
                    overflow: 'hidden',
                    opacity: !isPending ? 0.75 : 1,
                    transition: 'opacity 0.2s, border-color 0.2s, transform 0.12s, box-shadow 0.12s',
                  animation: 'fadeIn 0.2s ease both',
                  animationDelay: `${i * 35}ms`,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = '';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 260px', alignItems: 'stretch' }}>

                    {/* ── Record A ── */}
                    <div style={{ padding: '14px 16px', borderRight: '1px solid var(--border-0)', borderLeft: '3px solid var(--accent-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                        <RecordPill short={item.supplier_a_source ?? '?'} tone="a" />
                        {item.supplier_a_source_code && (
                          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                            {item.supplier_a_source_code}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg-0)', lineHeight: 1.3 }}>
                        {item.supplier_a_name || '—'}
                      </div>
                      {(item.supplier_a_currency || item.supplier_a_contact) && (
                        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 5 }}>
                          {[item.supplier_a_currency, item.supplier_a_contact].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>

                    {/* ── Confidence ring + age ── */}
                    <div style={{
                      padding: '14px 8px',
                      borderRight: '1px solid var(--border-0)',
                      background: 'var(--bg-2)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <ConfRing value={item.confidence} />
                      <span className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {relativeTime(item.created_at)}
                      </span>
                    </div>

                    {/* ── Record B ── */}
                    <div style={{ padding: '14px 16px', borderRight: '1px solid var(--border-0)', borderLeft: '3px solid var(--info-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                        <RecordPill short={item.supplier_b_source ?? '?'} tone="b" />
                        {item.supplier_b_source_code && (
                          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                            {item.supplier_b_source_code}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg-0)', lineHeight: 1.3 }}>
                        {item.supplier_b_name || '—'}
                      </div>
                      {(item.supplier_b_currency || item.supplier_b_contact) && (
                        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 5 }}>
                          {[item.supplier_b_currency, item.supplier_b_contact].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>

                    {/* ── Decision column ── */}
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                      {!isPending ? (
                        <span className={`pill ${statusTone ?? 'accent'}`} style={{ padding: '3px 8px', justifyContent: 'center' }}>
                          <span className="pill-dot" />
                          {item.status === 'confirmed' ? 'Confirmed dupe' : 'Not a duplicate'}
                        </span>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <button
                              onClick={() => navigate(`/review/${item.id}`)}
                              style={{
                                padding: '5px 10px', cursor: 'pointer',
                                background: 'transparent', color: 'var(--ok)',
                                border: '1px solid var(--ok)', borderRadius: 3,
                                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                letterSpacing: '0.02em', transition: 'background 0.1s, filter 0.1s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--ok-soft)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              ✓ Same
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); rejectMutation.mutate(item.id); }}
                              disabled={rejectMutation.isPending}
                              style={{
                                padding: '5px 10px', cursor: 'pointer',
                                background: 'transparent', color: 'var(--danger)',
                                border: '1px solid var(--danger)', borderRadius: 3,
                                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                letterSpacing: '0.02em', transition: 'background 0.1s',
                                opacity: rejectMutation.isPending ? 0.5 : 1,
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-soft)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              ✕ Diff
                            </button>
                          </div>
                          <div style={{ borderTop: '1px solid var(--border-0)', paddingTop: 6, marginTop: 2 }}>
                            <button
                              onClick={() => navigate(`/review/${item.id}`)}
                              style={{
                                width: '100%', padding: '5px 8px', cursor: 'pointer',
                                background: 'transparent', border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                fontFamily: 'var(--font-mono)', fontSize: 11,
                                color: 'var(--accent)', letterSpacing: '0.03em',
                                transition: 'opacity 0.1s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                            >
                              See evidence
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom pagination */}
          {queue && queue.total > 0 && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-0)' }}>
              <Pagination page={page} pageSize={PAGE_SIZE} totalItems={queue.total} onPageChange={handlePageChange} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
