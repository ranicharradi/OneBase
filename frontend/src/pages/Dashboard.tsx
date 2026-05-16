// ── Dashboard — terminal aesthetic: overview + pipeline + actions + activity ──

import { useState, useCallback, useEffect } from 'react';
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
}

type AdminMlAction = 'retrain' | 'train';

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
    });
  }

  return out.slice(0, 3);
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

function activityToneColor(tone: string | null | undefined): string {
  if (tone === 'ok') return 'var(--ok)';
  if (tone === 'warn') return 'var(--warn)';
  if (tone === 'danger') return 'var(--danger)';
  if (tone === 'info' || tone === 'accent') return 'var(--accent)';
  return 'var(--fg-3)';
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

// ── Dashboard overview — one pipeline shape for empty and populated states ──
function DashboardOverview({
  data,
  recentActivity,
  modelStatus,
  isAdmin,
  isRefreshing,
  matchProgress,
  confirmAction,
  isRetraining,
  isTraining,
  onRefresh,
  onRequestRetrain,
  onRequestTrain,
  onConfirmMlAction,
  onCancelMlAction,
}: {
  data: DashboardResponse;
  recentActivity: RecentActivity[];
  modelStatus: ModelStatusResponse | undefined;
  isAdmin: boolean;
  isRefreshing: boolean;
  matchProgress: MatchProgress | null;
  confirmAction: AdminMlAction | null;
  isRetraining: boolean;
  isTraining: boolean;
  onRefresh: () => void;
  onRequestRetrain: () => void;
  onRequestTrain: () => void;
  onConfirmMlAction: () => void;
  onCancelMlAction: () => void;
}) {
  const { uploads, matching, review, unified } = data;
  const totalBatches = uploads.completed + uploads.failed;
  const reviewedTotal = review.confirmed + review.rejected;
  const avgConf = matching.avg_confidence ?? 0;
  const coverage = uploads.total_staged > 0
    ? Math.round((unified.total_unified / uploads.total_staged) * 100)
    : 0;
  const actions = deriveActions(data);

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
      stat: matchProgress ? `${matchProgress.progress}%` : uploads.total_staged.toLocaleString(),
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
        ? `${review.confirmed.toLocaleString()} confirmed · ${review.rejected.toLocaleString()} rejected`
        : 'awaiting reviews',
    },
    {
      label: 'UNIFY',
      icon: 'verified',
      stat: unified.total_unified.toLocaleString(),
      unit: 'records',
      sub: unified.total_unified > 0
        ? `${unified.merged.toLocaleString()} merged · ${unified.singletons.toLocaleString()} singletons`
        : 'awaiting unified records',
    },
  ];

  return (
    <div className="dashboard-overview-page">
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
                <EmptyRing pct={coverage} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                    {uploads.total_staged > 0
                      ? `${coverage}% coverage`
                      : 'awaiting data'}
                  </div>
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
                  {uploads.total_staged === 0 ? (
                    <>
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
                    </>
                  ) : actions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {actions.map(a => (
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
                            aria-hidden="true"
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
                            aria-hidden="true"
                          >
                            arrow_forward
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px 12px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--ok)' }}>
                        check_circle
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>All caught up</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                        No failed uploads, reviews, or record exports need attention.
                      </div>
                    </div>
                  )}
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
                      const tone = a.tone ?? toneForAction(a.action);
                      const title = a.title ?? a.entity_name ?? a.action;
                      const actor = a.actor ?? 'System';
                      const subtitle = a.subtitle ?? a.entity_type ?? '';
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
                              background: activityToneColor(tone),
                              marginTop: 6,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.45 }}>
                              <span className="mono" style={{ color: 'var(--fg-3)', marginRight: 6 }}>
                                {formatRelativeTime(a.created_at)}
                              </span>
                              <span style={{ color: 'var(--fg-3)' }}>·</span>
                              <span className="mono" style={{ color: 'var(--fg-2)', marginLeft: 6 }}>
                                {actor}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--fg-0)', lineHeight: 1.4 }}>
                              {title}
                            </div>
                            {subtitle && (
                              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>
                                {subtitle}
                              </div>
                            )}
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
        <Panel className="dashboard-overview-ml fade">
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
                    onClick={onConfirmMlAction}
                    className="btn btn-sm btn-accent"
                    disabled={isRetraining || isTraining}
                  >
                    Confirm
                  </button>
                  <button onClick={onCancelMlAction} className="btn btn-sm">
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
                    onClick={onRequestRetrain}
                    disabled={modelStatus.review_count < 20 || isRetraining}
                    className="btn btn-sm"
                    title={modelStatus.review_count < 20 ? 'Need at least 20 reviews' : ''}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>tune</span>
                    Retrain weights
                  </button>
                  <button
                    onClick={onRequestTrain}
                    disabled={modelStatus.review_count < 50 || isTraining}
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
  const [confirmAction, setConfirmAction] = useState<AdminMlAction | null>(null);

  const retrainMutation = useMutation({
    mutationFn: () => api.post(`/api/matching/retrain?type=${selectedType}`),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => setConfirmAction(null),
  });

  const trainMutation = useMutation({
    mutationFn: () => api.post(`/api/matching/train-model?type=${selectedType}`),
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

  return (
    <DashboardOverview
      data={data}
      recentActivity={data.recent_activity}
      modelStatus={modelStatus}
      isAdmin={isAdmin}
      isRefreshing={isFetching}
      matchProgress={matchProgress}
      confirmAction={confirmAction}
      isRetraining={retrainMutation.isPending}
      isTraining={trainMutation.isPending}
      onRefresh={() => refetch()}
      onRequestRetrain={() => setConfirmAction('retrain')}
      onRequestTrain={() => setConfirmAction('train')}
      onConfirmMlAction={() => {
        if (confirmAction === 'retrain') retrainMutation.mutate();
        if (confirmAction === 'train') trainMutation.mutate();
      }}
      onCancelMlAction={() => setConfirmAction(null)}
    />
  );
}
