// ── Dashboard — terminal aesthetic: KPI grid + pipeline + actions + activity ──

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type {
  DashboardResponse,
  MatchingNotification,
  ModelStatusResponse,
  RecentActivity,
} from '../api/types';
import { useMatchingNotifications } from '../hooks/useMatchingNotifications';
import { useAuth } from '../hooks/useAuth';
import { useSelectedRecordType } from '../contexts/RecordTypeContext';
import Panel, { PanelHead } from '../components/ui/Panel';
import Kpi from '../components/ui/Kpi';
import Pill from '../components/ui/Pill';
import Spinner from '../components/ui/Spinner';

const REFRESH_MS = 30_000;

interface MatchProgress {
  stage: string;
  progress: number;
}

interface NextAction {
  key: string;
  tone: 'danger' | 'warn' | 'info';
  icon: string;
  title: string;
  detail: string;
  to: string;
  cta: string;
}

function deriveActions(d: DashboardResponse): NextAction[] {
  const out: NextAction[] = [];

  if (d.uploads.failed > 0) {
    out.push({
      key: 'failed-uploads',
      tone: 'danger',
      icon: 'error',
      title: `Resolve ${d.uploads.failed} failed upload${d.uploads.failed !== 1 ? 's' : ''}`,
      detail: 'Check column mappings and file format',
      to: '/upload',
      cta: 'View uploads',
    });
  }

  if (d.review.pending > 0) {
    const done = d.review.confirmed + d.review.rejected;
    out.push({
      key: 'pending-review',
      tone: 'warn',
      icon: 'rate_review',
      title: `Review ${d.review.pending} match candidate${d.review.pending !== 1 ? 's' : ''}`,
      detail: done > 0
        ? `${done} already reviewed — keep going`
        : 'Confirm or reject potential duplicate matches',
      to: '/review',
      cta: 'Start reviewing',
    });
  }

  if (d.unified.total_unified > 0) {
    out.push({
      key: 'view-unified',
      tone: 'info',
      icon: 'download',
      title: `Browse ${d.unified.total_unified.toLocaleString()} unified records`,
      detail: `${d.unified.merged} merged · ${d.unified.singletons} singletons`,
      to: '/unified',
      cta: 'Open records',
    });
  }

  return out.slice(0, 3);
}

// ── Progress ring — animates the unified/staged coverage on first render ──
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({ pct, unified, total }: { pct: number; unified: number; total: number }) {
  const dash = (pct / 100) * RING_C;
  const tone = pct >= 75 ? 'var(--ok)' : pct >= 40 ? 'var(--accent)' : 'var(--warn)';

  return (
    <div
      className="panel"
      style={{
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minWidth: 200,
      }}
    >
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${pct}% unified`}>
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth={6}
        />
        {/* Arc */}
        <circle
          className="progress-ring-bar"
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke={tone}
          strokeWidth={6}
          strokeDasharray={RING_C}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{
            '--ring-from': RING_C,
            '--ring-to': RING_C - dash,
          } as React.CSSProperties}
        />
        <text
          x="60"
          y="56"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 24,
            fontWeight: 600,
            fill: 'var(--fg-0)',
            fontFamily: 'IBM Plex Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {pct}%
        </text>
        <text
          x="60"
          y="76"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 9,
            fill: 'var(--fg-2)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          unified
        </text>
      </svg>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', textAlign: 'center' }}>
        {total > 0
          ? `${unified.toLocaleString()} / ${total.toLocaleString()}`
          : 'awaiting data'}
      </div>
    </div>
  );
}

function formatActionMessage(a: RecentActivity): string {
  if (a.entity_type && a.entity_id) {
    return a.entity_name ?? `${a.entity_type} #${a.entity_id}`;
  }
  return '—';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Skeleton() {
  return (
    <div style={{ padding: 20 }}>
      <div className="kpi-grid">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="kpi">
            <div className="kpi-label">Loading…</div>
            <div className="kpi-value mono" style={{ color: 'var(--fg-2)' }}>—</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty-state ring — 75% track with an accent fill arc proportional to pct ──
function EmptyRing({ pct }: { pct: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const r = 92;
  const c = 2 * Math.PI * r;
  const trackArc = c * 0.75;
  const fillArc = ready ? trackArc * Math.max(0, Math.min(pct, 100)) / 100 : 0;
  return (
    <svg
      viewBox="0 0 240 240"
      style={{ width: '100%', maxWidth: 260, display: 'block' }}
      role="img"
      aria-label={`${pct}% unified`}
    >
      <circle
        cx="120"
        cy="120"
        r={r}
        fill="none"
        stroke="var(--bg-3)"
        strokeWidth={14}
        strokeDasharray={`${trackArc} ${c}`}
        strokeLinecap="round"
        transform="rotate(135 120 120)"
      />
      <circle
        cx="120"
        cy="120"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={14}
        strokeDasharray={`${fillArc} ${c}`}
        strokeLinecap="round"
        transform="rotate(135 120 120)"
        style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(0.4,0,0.2,1) 0.2s' }}
      />
      <text
        x="120"
        y="116"
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontSize: 56,
          fontWeight: 600,
          fill: 'var(--fg-0)',
          fontFamily: 'IBM Plex Mono, monospace',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.04em',
        }}
      >
        {pct}%
      </text>
      <text
        x="120"
        y="148"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 11, fill: 'var(--fg-2)', letterSpacing: '0.16em', textTransform: 'uppercase' }}
      >
        unified
      </text>
    </svg>
  );
}

function toneForAction(action: string): 'ok' | 'warn' | 'accent' | 'fg-3' {
  if (action.endsWith('.confirm')) return 'ok';
  if (action.endsWith('.reject') || action.endsWith('.failed')) return 'warn';
  if (
    action.endsWith('.completed') ||
    action.endsWith('.created') ||
    action.endsWith('.started')
  ) {
    return 'accent';
  }
  return 'fg-3';
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const hhmm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today, ${hhmm}`;
  if (isYest) return `Yesterday, ${hhmm}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${hhmm}`;
}

// ── Pre-data Overview — previews the pipeline shape before the first batch ──
function EmptyOverview({
  data,
  recentActivity,
  modelStatus,
  isAdmin,
  isRefreshing,
  matchProgress,
  onRefresh,
}: {
  data: DashboardResponse;
  recentActivity: RecentActivity[];
  modelStatus: ModelStatusResponse | undefined;
  isAdmin: boolean;
  isRefreshing: boolean;
  matchProgress: MatchProgress | null;
  onRefresh: () => void;
}) {
  // Parent guarantees uploads.total_staged === 0 here.
  const { uploads, matching, review, unified } = data;
  const totalBatches = uploads.completed + uploads.failed;
  const reviewedTotal = review.confirmed + review.rejected;
  const avgConf = matching.avg_confidence ?? 0;

  // All ingestion sub-stages (parsing/normalizing/embedding) live under INGEST.
  const activeStage: 'INGEST' | null = matchProgress ? 'INGEST' : null;

  const stages: Array<{
    label: 'INGEST' | 'MATCH' | 'REVIEW' | 'UNIFY';
    icon: string;
    stat: string;
    unit: string;
    sub: string;
  }> = [
    {
      label: 'INGEST',
      icon: 'cloud_upload',
      stat: matchProgress ? `${matchProgress.progress}%` : '0',
      unit: matchProgress ? matchProgress.stage : 'rows',
      sub: totalBatches > 0
        ? `${uploads.completed} of ${totalBatches} batches${uploads.failed > 0 ? ` · ${uploads.failed} failed` : ''}`
        : 'no batches yet',
    },
    {
      label: 'MATCH',
      icon: 'hub',
      stat: matching.total_candidates.toLocaleString(),
      unit: 'pairs',
      sub: `${matching.total_groups.toLocaleString()} groups`,
    },
    {
      label: 'REVIEW',
      icon: 'rate_review',
      stat: review.pending.toLocaleString(),
      unit: 'pending',
      sub: reviewedTotal > 0
        ? `${review.confirmed.toLocaleString()} ✓ · ${review.rejected.toLocaleString()} ✗`
        : 'awaiting reviews',
    },
    {
      label: 'UNIFY',
      icon: 'verified',
      stat: unified.total_unified.toLocaleString(),
      unit: 'records',
      sub: `${unified.merged.toLocaleString()} merged · ${unified.singletons.toLocaleString()} singletons`,
    },
  ];

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        {/* Page header */}
        <div
          className="fade"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
              <span style={{ color: 'var(--fg-2)', fontWeight: 400 }}>Modular Data Pipeline · </span>
              Overview
            </h1>
            {matchProgress ? (
              <Pill tone="accent">
                <Spinner size={10} />
                {matchProgress.stage} · {matchProgress.progress}%
              </Pill>
            ) : (
              <Pill tone="accent" dot>
                <span className="live-dot">live</span>
              </Pill>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onRefresh} disabled={isRefreshing} className="btn btn-sm">
              {isRefreshing ? (
                <Spinner size={12} />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
              )}
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link to="/upload" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
              New batch
            </Link>
          </div>
        </div>

        {/* 3-column layout: Unified% · Pipeline+NextSteps · Activity */}
        <div className="empty-overview-wrap fade">
          <div className="empty-overview-grid">
            {/* LEFT — Unified ring */}
            <Panel className="eo-ring" style={{ display: 'flex', flexDirection: 'column' }}>
              <PanelHead title="Unified %" />
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px 18px 28px',
                  gap: 14,
                }}
              >
                <EmptyRing pct={0} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>awaiting data</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6 }}>
                    {unified.total_unified.toLocaleString()} / {uploads.total_staged.toLocaleString()} records
                  </div>
                </div>
              </div>
            </Panel>

            {/* MIDDLE — Pipeline Health + Next Steps */}
            <div className="eo-pipeline" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <Panel>
                <PanelHead title="Pipeline Health" />
                <div style={{ padding: '18px 16px 18px' }}>
                  <div className="eo-sysmap">
                    {stages.flatMap((s, i) => {
                      const isActive = s.label === activeStage;
                      const node = (
                        <div
                          key={s.label}
                          className={`eo-node${isActive ? ' eo-node-active' : ''}`}
                        >
                          <div className="eo-node-title">
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 12, color: 'var(--accent)' }}
                              aria-hidden="true"
                            >
                              {s.icon}
                            </span>
                            {s.label}
                            {isActive && (
                              <span style={{ marginLeft: 'auto' }}>
                                <Spinner size={10} />
                              </span>
                            )}
                          </div>
                          <div className="eo-node-stat">
                            {s.stat}
                            <span className="u">{s.unit}</span>
                          </div>
                          <div className="eo-node-sub">{s.sub}</div>
                        </div>
                      );
                      if (i === stages.length - 1) return [node];
                      return [
                        node,
                        <div key={`${s.label}-q`} className="eo-connector" aria-hidden="true">
                          <span />
                          <span className="material-symbols-outlined">arrow_forward</span>
                          <span />
                        </div>,
                      ];
                    })}
                  </div>

                  <div className="eo-sysmap-legend">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden="true">
                        auto_graph
                      </span>
                      Avg confidence · {avgConf ? avgConf.toFixed(3) : '—'}
                    </span>
                    {modelStatus && (
                      <span style={{ marginLeft: 'auto', color: 'var(--fg-2)' }}>
                        {modelStatus.review_count.toLocaleString()} review{modelStatus.review_count === 1 ? '' : 's'} ·{' '}
                        {modelStatus.ml_model_exists ? 'ML model trained' : 'no ML model'}
                      </span>
                    )}
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHead title="Next steps" />
                <div style={{ padding: '16px 18px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'var(--accent-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 18, color: 'var(--accent)' }}
                        aria-hidden="true"
                      >
                        cloud_upload
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-0)' }}>
                        Upload your first CSV
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                        We'll auto-detect schema, delimiter, and types
                      </div>
                    </div>
                  </div>
                  <Link
                    to="/upload"
                    className="btn btn-lg"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border-1)',
                      color: 'var(--fg-0)',
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    Upload
                  </Link>
                </div>
              </Panel>
            </div>

            {/* RIGHT — Recent Activity */}
            <Panel className="eo-activity" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <PanelHead>
                <span className="panel-title">Recent Activity</span>
                <Pill tone="ok" dot>
                  <span className="live-dot">streaming</span>
                </Pill>
              </PanelHead>
              <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
                {recentActivity.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                    No activity yet
                  </div>
                ) : (
                  <div style={{ padding: '6px 0' }}>
                    {recentActivity.slice(0, 20).map((a, i, arr) => {
                      const tone = toneForAction(a.action);
                      const text = a.entity_name ?? a.action;
                      return (
                        <div
                          key={a.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '14px 1fr',
                            gap: 10,
                            padding: '10px 16px',
                            borderBottom: i < arr.length - 1 ? '1px solid var(--border-0)' : 'none',
                            alignItems: 'flex-start',
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background:
                                tone === 'ok'
                                  ? 'var(--ok)'
                                  : tone === 'warn'
                                  ? 'var(--warn)'
                                  : tone === 'accent'
                                  ? 'var(--accent)'
                                  : 'var(--fg-3)',
                              marginTop: 6,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.45 }}>
                              <span className="mono" style={{ color: 'var(--fg-3)', marginRight: 6 }}>
                                {formatRelativeTime(a.created_at)}
                              </span>
                              <span style={{ color: 'var(--fg-3)' }}>·</span>
                              <span style={{ color: 'var(--fg-0)', marginLeft: 6 }}>{text}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        {/* ML & matching */}
        {isAdmin && modelStatus && (
          <Panel className="fade" style={{ marginTop: 14 }}>
            <PanelHead title="ML & matching" />
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div>
                <div className="label">Reviews</div>
                <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                  {modelStatus.review_count}
                </div>
              </div>
              <div>
                <div className="label">ML model</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, color: 'var(--fg-2)' }}>
                  {modelStatus.ml_model_exists ? 'Trained' : 'None'}
                </div>
              </div>
              <div>
                <div className="label">Last trained</div>
                <div className="mono" style={{ fontSize: 12, marginTop: 4, color: 'var(--fg-2)' }}>
                  {modelStatus.last_trained ? new Date(modelStatus.last_trained).toLocaleDateString() : '—'}
                </div>
              </div>
              <div>
                <div className="label">Signal weights</div>
                <div className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--fg-1)' }}>
                  {Object.values(modelStatus.current_weights).map(w => w.toFixed(2)).join(' · ')}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--border-0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                Retraining requires ≥20 reviews · ML training requires ≥50 reviews.
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" disabled title="Need at least 20 reviews">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>tune</span>
                  Retrain weights
                </button>
                <button className="btn btn-sm" disabled title="Need at least 50 reviews">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                  Train ML model
                </button>
              </div>
            </div>
          </Panel>
        )}

        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { selectedType } = useSelectedRecordType();

  const { data, isLoading, isFetching, error, refetch } = useQuery<DashboardResponse>({
    queryKey: ['dashboard', selectedType],
    queryFn: () => api.get(`/api/unified/dashboard?type=${selectedType}`),
    refetchInterval: REFRESH_MS,
  });

  const { data: modelStatus } = useQuery<ModelStatusResponse>({
    queryKey: ['model-status', selectedType],
    queryFn: () => api.get(`/api/matching/model-status?type=${selectedType}`),
    enabled: isAdmin,
  });

  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(null);
  const [confirmAction, setConfirmAction] = useState<'retrain' | 'train' | null>(null);

  const retrainMutation = useMutation({
    mutationFn: () => api.post('/api/matching/retrain'),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => setConfirmAction(null),
  });

  const trainMutation = useMutation({
    mutationFn: () => api.post('/api/matching/train-model'),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => setConfirmAction(null),
  });

  useMatchingNotifications(useCallback((n: MatchingNotification) => {
    if (n.type === 'matching_progress') {
      setMatchProgress({ stage: n.data.stage ?? 'Processing', progress: n.data.progress ?? 0 });
    } else if (n.type === 'matching_complete' || n.type === 'matching_failed') {
      setMatchProgress(null);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [queryClient]));

  // ── Hoisted KPI memos (must be above early returns to satisfy Rules of Hooks) ──
  const uploads = data?.uploads;
  const matching = data?.matching;
  const review = data?.review;

  const recordStagedKpi = useMemo(() => {
    if (!uploads) return null;
    const totalBatches = uploads.completed + uploads.failed;
    const successRate = totalBatches > 0
      ? Math.round((uploads.completed / totalBatches) * 100)
      : 100;
    const tone = uploads.failed > 0
      ? (successRate >= 90 ? 'warn' : 'danger')
      : 'ok';
    return (
      <Kpi
        icon="inventory_2"
        label="Records staged"
        value={uploads.total_staged.toLocaleString()}
        delta={
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
              {uploads.failed > 0 ? 'error' : 'check_circle'}
            </span>
            {uploads.completed} of {totalBatches} batches{uploads.failed > 0 ? ` · ${uploads.failed} failed` : ' clean'}
          </>
        }
        bar={successRate}
        tone={tone}
      />
    );
  }, [uploads]);

  const pendingReviewKpi = useMemo(() => {
    if (!review) return null;
    const reviewedTotal = review.confirmed + review.rejected;
    const grandTotal = review.pending + reviewedTotal;
    const completionPct = grandTotal > 0
      ? Math.round((reviewedTotal / grandTotal) * 100)
      : 100;
    const tone = review.pending === 0 ? 'ok' : 'warn';
    return (
      <Kpi
        icon="pending_actions"
        label="Pending review"
        value={review.pending.toLocaleString()}
        delta={
          review.pending === 0 ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'var(--ok)' }}>
                task_alt
              </span>
              queue clear · {reviewedTotal.toLocaleString()} reviewed
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>schedule</span>
              {completionPct}% reviewed · {review.confirmed.toLocaleString()} ✓ · {review.rejected.toLocaleString()} ✗
            </>
          )
        }
        bar={completionPct}
        tone={tone}
      />
    );
  }, [review]);

  const avgConfidenceKpi = useMemo(() => {
    if (!matching) return null;
    const conf = matching.avg_confidence ?? 0;
    const pct = Math.round(conf * 100);
    const tone = conf === 0 ? 'warn' : conf >= 0.85 ? 'ok' : conf >= 0.70 ? 'accent' : 'warn';
    return (
      <Kpi
        icon="auto_graph"
        label="Avg confidence"
        value={matching.avg_confidence ? matching.avg_confidence.toFixed(3) : '—'}
        delta={
          matching.total_groups > 0 ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>hub</span>
              {matching.total_candidates.toLocaleString()} candidates · {matching.total_groups.toLocaleString()} groups
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>hourglass_empty</span>
              awaiting matches
            </>
          )
        }
        bar={pct}
        tone={tone}
      />
    );
  }, [matching]);

  if (isLoading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20 }}>
          <Panel>
            <div style={{ padding: 28, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--danger)' }}>
                cloud_off
              </span>
              <p style={{ marginTop: 12, color: 'var(--danger)', fontWeight: 500 }}>
                {error instanceof Error ? error.message : 'Failed to load dashboard'}
              </p>
              <button onClick={() => refetch()} className="btn btn-sm" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
                Retry
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const { unified, recent_activity } = data;

  if (data.uploads.total_staged === 0) {
    return (
      <EmptyOverview
        data={data}
        recentActivity={recent_activity}
        modelStatus={modelStatus}
        isAdmin={isAdmin}
        isRefreshing={isFetching}
        matchProgress={matchProgress}
        onRefresh={() => refetch()}
      />
    );
  }

  // total_staged > 0 here — empty case early-returned above.
  const coverage = Math.round((unified.total_unified / data.uploads.total_staged) * 100);
  const actions = deriveActions(data);
  const isMatchRunning = matchProgress !== null;

  const reviewedTotal = data.review.confirmed + data.review.rejected;

  // Per-stage completion → derive the "current" stage as the first not-done one.
  const stageDone = [
    true,
    data.matching.total_candidates > 0 && !isMatchRunning,
    reviewedTotal > 0 && data.review.pending === 0,
    unified.total_unified > 0 && coverage >= 99,
  ];
  let activeIdx = stageDone.findIndex(d => !d);
  if (activeIdx === -1) activeIdx = stageDone.length;

  type StageStatus = 'done' | 'active' | 'queued';
  const pipelineStages: Array<{
    n: number;
    label: string;
    stat: string;
    unit: string;
    status: StageStatus;
  }> = [
    { n: 1, label: 'Ingest', stat: data.uploads.total_staged.toLocaleString(), unit: 'rows' },
    { n: 2, label: 'Match', stat: data.matching.total_candidates.toLocaleString(), unit: 'pairs' },
    { n: 3, label: 'Review', stat: data.review.pending.toLocaleString(), unit: 'pending' },
    { n: 4, label: 'Unify', stat: unified.total_unified.toLocaleString(), unit: 'merged' },
  ].map((s, i) => ({
    ...s,
    status: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'queued',
  }));

  const lineFillPct = pipelineStages.length > 1
    ? (Math.min(activeIdx, pipelineStages.length - 1) / (pipelineStages.length - 1)) * 100
    : 0;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        {/* Page header */}
        <div className="fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Overview</h1>
              <Pill tone="accent" dot>
                <span className="live-dot">live</span>
              </Pill>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
              Record unification pipeline · {data.uploads.total_staged.toLocaleString()} rows staged · {unified.total_unified.toLocaleString()} unified
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => refetch()} disabled={isFetching} className="btn btn-sm">
              {isFetching ? (
                <Spinner size={12} />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span>
              )}
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link to="/upload" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
              New batch
            </Link>
          </div>
        </div>

        {/* Hero ring + KPI grid */}
        <div
          className="fade"
          style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}
        >
          <ProgressRing pct={coverage} unified={unified.total_unified} total={data.uploads.total_staged} />
          <div
            className="kpi-grid"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
          >
            {/* Records staged — ingestion success rate */}
            {recordStagedKpi}

            {/* Unified records — coverage = unified / staged */}
            <Kpi
              icon="verified"
              label="Unified records"
              value={unified.total_unified.toLocaleString()}
              delta={
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>donut_large</span>
                  {coverage}% coverage · {unified.merged.toLocaleString()} merged · {unified.singletons.toLocaleString()} singletons
                </>
              }
              bar={coverage}
              tone="accent"
            />

            {/* Pending review — load on the queue */}
            {pendingReviewKpi}

            {/* Avg confidence — match score health */}
            {avgConfidenceKpi}
          </div>
        </div>

        {/* Pipeline + Suggested actions row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, marginTop: 14 }}>
          <Panel className="fade">
            <PanelHead>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="panel-title">Pipeline</span>
                <Pill tone="ok" dot>healthy</Pill>
              </div>
              {isMatchRunning && (
                <Pill tone="accent">
                  <Spinner size={10} />
                  {matchProgress!.stage} · {matchProgress!.progress}%
                </Pill>
              )}
            </PanelHead>
            <div style={{ padding: '20px 14px 22px', overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${pipelineStages.length}, 1fr)`,
                  gap: 0,
                  position: 'relative',
                }}
              >
                {/* Track */}
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: '6%',
                    right: '6%',
                    height: 2,
                    background: 'var(--border-0)',
                    zIndex: 0,
                  }}
                />
                {/* Filled progress */}
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: '6%',
                    width: `calc((100% - 12%) * ${lineFillPct / 100})`,
                    height: 2,
                    background: 'var(--accent)',
                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 0,
                  }}
                />
                {pipelineStages.map(s => {
                  const isActive = s.status === 'active';
                  const isDone = s.status === 'done';
                  const squareBg = isActive ? 'var(--accent)' : 'var(--bg-1)';
                  const squareBorder = isActive || isDone ? 'var(--accent)' : 'var(--border-1)';
                  const squareColor = isActive ? '#fff' : isDone ? 'var(--accent)' : 'var(--fg-2)';
                  const labelColor = isActive ? 'var(--accent)' : isDone ? 'var(--fg-1)' : 'var(--fg-2)';
                  const statColor = isActive ? 'var(--accent)' : isDone ? 'var(--fg-0)' : 'var(--fg-2)';
                  return (
                    <div key={s.n} style={{ textAlign: 'center', position: 'relative', padding: '0 4px', zIndex: 1 }}>
                      <div
                        className={isActive ? 'pulse-scale' : undefined}
                        style={{
                          position: 'relative',
                          width: 32,
                          height: 32,
                          margin: '0 auto',
                          background: squareBg,
                          border: `2px solid ${squareBorder}`,
                          color: squareColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'IBM Plex Mono, monospace',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 6,
                          transition: 'background 0.3s ease, color 0.3s ease, border-color 0.3s ease',
                        }}
                      >
                        {isDone ? (
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
                            check
                          </span>
                        ) : (
                          s.n
                        )}
                      </div>
                      <div className="label" style={{ marginTop: 8, color: labelColor }}>
                        {s.label}
                      </div>
                      <div
                        className="mono tnum"
                        style={{
                          fontSize: 18,
                          fontWeight: 600,
                          marginTop: 2,
                          color: statColor,
                        }}
                      >
                        {s.stat}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                        {s.unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel className="fade">
            <PanelHead title="Next steps" />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actions.length > 0 ? (
                actions.map(a => (
                  <Link
                    key={a.key}
                    to={a.to}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: 10,
                      background: `var(--${a.tone}-soft)`,
                      borderRadius: 4,
                      textDecoration: 'none',
                      color: 'var(--fg-0)',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16, color: `var(--${a.tone})`, marginTop: 1 }}
                    >
                      {a.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-0)' }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>{a.detail}</div>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, color: `var(--${a.tone})`, marginTop: 1 }}
                    >
                      arrow_forward
                    </span>
                  </Link>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--ok)' }}>
                    check_circle
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>All caught up</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                    No pending uploads, reviews, or merges.
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Activity log */}
        <Panel className="fade" style={{ marginTop: 14 }}>
          <PanelHead
            title="Activity log"
            actions={
              <Pill dot>
                <span className="live-dot">streaming</span>
              </Pill>
            }
          />
          <div className="scroll" style={{ maxHeight: 400 }}>
            {recent_activity.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                No activity yet
              </div>
            ) : (
              recent_activity.slice(0, 20).map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 100px 1fr',
                    gap: 10,
                    padding: '8px 14px',
                    borderBottom: i < recent_activity.length - 1 ? '1px solid var(--border-0)' : 'none',
                    fontSize: 11,
                    alignItems: 'baseline',
                  }}
                >
                  <span className="mono" style={{ color: 'var(--fg-2)' }}>{formatTime(a.created_at)}</span>
                  <span className="mono" style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.entity_type ?? 'system'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <span
                      className="mono"
                      style={{
                        color: 'var(--accent)',
                        fontSize: 10,
                        fontWeight: 500,
                        background: 'var(--accent-soft)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        marginRight: 6,
                      }}
                    >
                      {a.action}
                    </span>
                    <span style={{ color: 'var(--fg-0)' }}>{formatActionMessage(a)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* ML & Matching (admin) */}
        {isAdmin && modelStatus && (
          <Panel className="fade" style={{ marginTop: 14 }}>
            <PanelHead title="ML & matching" />
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div>
                <div className="label">Reviews</div>
                <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                  {modelStatus.review_count}
                </div>
              </div>
              <div>
                <div className="label">ML model</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                  {modelStatus.ml_model_exists ? 'Trained' : 'None'}
                </div>
              </div>
              <div>
                <div className="label">Last trained</div>
                <div className="mono" style={{ fontSize: 12, marginTop: 4, color: 'var(--fg-1)' }}>
                  {modelStatus.last_trained ? new Date(modelStatus.last_trained).toLocaleDateString() : '—'}
                </div>
              </div>
              <div>
                <div className="label">Signal weights</div>
                <div className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--fg-1)' }}>
                  {Object.values(modelStatus.current_weights).map(w => w.toFixed(2)).join(' · ')}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--border-0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {confirmAction ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                    {confirmAction === 'retrain'
                      ? 'Recalculate signal weights from review decisions?'
                      : 'Train a new ML model from review decisions?'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => (confirmAction === 'retrain' ? retrainMutation.mutate() : trainMutation.mutate())}
                      className="btn btn-sm btn-accent"
                    >
                      Confirm
                    </button>
                    <button onClick={() => setConfirmAction(null)} className="btn btn-sm">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                    Retraining requires ≥20 reviews · ML training requires ≥50 reviews.
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setConfirmAction('retrain')}
                      disabled={modelStatus.review_count < 20 || retrainMutation.isPending}
                      className="btn btn-sm"
                      title={modelStatus.review_count < 20 ? 'Need at least 20 reviews' : ''}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>tune</span>
                      Retrain weights
                    </button>
                    <button
                      onClick={() => setConfirmAction('train')}
                      disabled={modelStatus.review_count < 50 || trainMutation.isPending}
                      className="btn btn-sm"
                      title={modelStatus.review_count < 50 ? 'Need at least 50 reviews' : ''}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                      Train ML model
                    </button>
                  </div>
                </>
              )}
            </div>
          </Panel>
        )}

        {/* spacer for breathing room */}
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}
