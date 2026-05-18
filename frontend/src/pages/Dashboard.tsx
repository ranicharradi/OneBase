// ── Dashboard — terminal aesthetic: overview + pipeline + actions + activity ──

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  RefreshCwIcon,
  PlusIcon,
  UploadCloudIcon,
  NetworkIcon,
  ClipboardCheckIcon,
  BadgeCheckIcon,
  ArrowRightIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  CloudOffIcon,
  CheckCircle2Icon,
  DownloadIcon,
  XCircleIcon,
} from 'lucide-react';
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
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
            <div className="text-xs text-muted-foreground">Loading…</div>
            <div className="font-mono tabular-nums text-muted-foreground text-lg font-semibold">—</div>
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

function activityDotClass(tone: string | null | undefined): string {
  if (tone === 'ok') return 'bg-emerald-500';
  if (tone === 'warn') return 'bg-amber-500';
  if (tone === 'danger') return 'bg-destructive';
  if (tone === 'info' || tone === 'accent') return 'bg-primary';
  return 'bg-muted-foreground';
}

function actionToneBg(tone: 'danger' | 'warn' | 'info'): string {
  if (tone === 'danger') return 'bg-destructive/10';
  if (tone === 'warn') return 'bg-amber-100 dark:bg-amber-950/40';
  return 'bg-sky-100 dark:bg-sky-950/40';
}

function actionToneText(tone: 'danger' | 'warn' | 'info'): string {
  if (tone === 'danger') return 'text-destructive';
  if (tone === 'warn') return 'text-amber-600 dark:text-amber-300';
  return 'text-sky-600 dark:text-sky-300';
}

function ActionIcon({ tone }: { tone: 'danger' | 'warn' | 'info' }) {
  const cls = `size-4 ${actionToneText(tone)}`;
  if (tone === 'danger') return <XCircleIcon className={cls} aria-hidden />;
  if (tone === 'warn') return <ClipboardCheckIcon className={cls} aria-hidden />;
  return <DownloadIcon className={cls} aria-hidden />;
}

function StageIcon({ label }: { label: string }) {
  const cls = 'size-3 text-primary shrink-0';
  if (label === 'INGEST') return <UploadCloudIcon className={cls} aria-hidden />;
  if (label === 'MATCH') return <NetworkIcon className={cls} aria-hidden />;
  if (label === 'REVIEW') return <ClipboardCheckIcon className={cls} aria-hidden />;
  return <BadgeCheckIcon className={cls} aria-hidden />;
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold m-0">
            <span className="text-muted-foreground font-normal">Modular Data Pipeline · </span>
            Overview
          </h1>
          {matchProgress ? (
            <Badge variant="secondary">
              <Spinner size={10} />
              {matchProgress.stage} · {matchProgress.progress}%
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <span className="live-dot">live</span>
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <Spinner size={12} />
            ) : (
              <RefreshCwIcon className="size-3" />
            )}
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button asChild size="sm">
            <Link to="/upload">
              <PlusIcon className="size-3" />
              New batch
            </Link>
          </Button>
        </div>
      </div>

      {/* 3-column layout: Unified% · Pipeline+NextSteps · Activity */}
      <div className="empty-overview-wrap">
        <div className="empty-overview-grid">
            {/* LEFT — Unified ring */}
            <Card className="eo-ring flex flex-col">
              <CardHeader>
                <CardTitle>Unified %</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center py-6 gap-3">
                <EmptyRing pct={coverage} />
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">
                    {uploads.total_staged > 0
                      ? `${coverage}% coverage`
                      : 'awaiting data'}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground/70 mt-1.5">
                    {unified.total_unified.toLocaleString()} / {uploads.total_staged.toLocaleString()} records
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* MIDDLE — Pipeline Health + Next Steps */}
            <div className="eo-pipeline flex flex-col gap-3.5 min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline Health</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="eo-sysmap">
                    {stages.flatMap((s, i) => {
                      const isActive = s.label === activeStage;
                      const node = (
                        <div
                          key={s.label}
                          className={`eo-node${isActive ? ' eo-node-active' : ''}`}
                        >
                          <div className="eo-node-title">
                            <StageIcon label={s.label} />
                            {s.label}
                            {isActive && (
                              <span className="ml-auto">
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
                          <ArrowRightIcon className="size-4" />
                          <span />
                        </div>,
                      ];
                    })}
                  </div>

                  <div className="eo-sysmap-legend">
                    <span className="inline-flex items-center gap-1">
                      <TrendingUpIcon className="size-3" aria-hidden />
                      Avg confidence · {avgConf ? avgConf.toFixed(3) : '—'}
                    </span>
                    {modelStatus && (
                      <span className="ml-auto text-muted-foreground">
                        {modelStatus.review_count.toLocaleString()} review{modelStatus.review_count === 1 ? '' : 's'} ·{' '}
                        {modelStatus.ml_model_exists ? 'ML model trained' : 'no ML model'}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Next steps</CardTitle>
                </CardHeader>
                <CardContent>
                  {uploads.total_staged === 0 ? (
                    <>
                      <div className="flex items-center gap-3 mb-3.5">
                        <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <UploadCloudIcon className="size-[18px] text-primary" aria-hidden />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            Upload your first CSV
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            We'll auto-detect schema, delimiter, and types
                          </div>
                        </div>
                      </div>
                      <Button asChild variant="outline" className="w-full justify-center">
                        <Link to="/upload">Upload</Link>
                      </Button>
                    </>
                  ) : actions.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {actions.map(a => (
                        <Link
                          key={a.key}
                          to={a.to}
                          className={`flex items-start gap-2.5 p-2.5 rounded ${actionToneBg(a.tone)} no-underline text-foreground`}
                        >
                          <ActionIcon tone={a.tone} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-foreground">{a.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{a.detail}</div>
                          </div>
                          <ArrowRightIcon className={`size-3.5 mt-0.5 ${actionToneText(a.tone)}`} aria-hidden />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-5 px-3">
                      <CheckCircle2Icon className="size-7 text-emerald-500 mx-auto" />
                      <div className="text-sm font-medium mt-2">All caught up</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        No failed uploads, reviews, or record exports need attention.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT — Recent Activity */}
            <Card className="eo-activity flex flex-col min-h-0">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <span className="live-dot">streaming</span>
                  </Badge>
                </div>
              </CardHeader>
              <ScrollArea className="flex-1 min-h-0">
                {recentActivity.length === 0 ? (
                  <div className="p-7 text-center text-xs text-muted-foreground">
                    No activity yet
                  </div>
                ) : (
                  <div className="py-1.5">
                    {recentActivity.slice(0, 20).map((a, i, arr) => {
                      const tone = a.tone ?? toneForAction(a.action);
                      const title = a.title ?? a.entity_name ?? a.action;
                      const actor = a.actor ?? 'System';
                      const subtitle = a.subtitle ?? a.entity_type ?? '';
                      return (
                        <div
                          key={a.id}
                          className="grid gap-2.5 px-4 py-2.5 items-start"
                          style={{
                            gridTemplateColumns: '14px 1fr',
                            borderBottom: i < arr.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                          }}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-1.5 ${activityDotClass(tone)}`}
                          />
                          <div className="min-w-0">
                            <div className="text-xs text-foreground/80 leading-snug">
                              <span className="font-mono text-muted-foreground/70 mr-1.5">
                                {formatRelativeTime(a.created_at)}
                              </span>
                              <span className="text-muted-foreground/70">·</span>
                              <span className="font-mono text-muted-foreground ml-1.5">
                                {actor}
                              </span>
                            </div>
                            <div className="text-xs text-foreground leading-snug">
                              {title}
                            </div>
                            {subtitle && (
                              <div className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">
                                {subtitle}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </Card>
        </div>
      </div>

      {/* ML & matching */}
      {isAdmin && modelStatus && (
        <Card className="dashboard-overview-ml mt-4">
          <CardHeader>
            <CardTitle>ML &amp; matching</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3.5">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Reviews</div>
                <div className="font-mono tabular-nums text-lg font-semibold mt-1">
                  {modelStatus.review_count}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">ML model</div>
                <div className="text-sm font-medium mt-1 text-muted-foreground">
                  {modelStatus.ml_model_exists ? 'Trained' : 'None'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Last trained</div>
                <div className="font-mono text-xs mt-1 text-muted-foreground">
                  {modelStatus.last_trained ? new Date(modelStatus.last_trained).toLocaleDateString() : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Signal weights</div>
                <div className="font-mono text-[11px] mt-1 text-foreground/80">
                  {Object.values(modelStatus.current_weights).map(w => w.toFixed(2)).join(' · ')}
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-2.5">
            {confirmAction ? (
              <>
                <span className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangleIcon className="size-3.5" />
                  {confirmAction === 'retrain'
                    ? 'Recalculate signal weights from review decisions?'
                    : 'Train a new ML model from review decisions?'}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={onConfirmMlAction}
                    disabled={isRetraining || isTraining}
                  >
                    Confirm
                  </Button>
                  <Button variant="outline" size="sm" onClick={onCancelMlAction}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  Retraining requires ≥20 reviews · ML training requires ≥50 reviews.
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRequestRetrain}
                    disabled={modelStatus.review_count < 20 || isRetraining}
                    title={modelStatus.review_count < 20 ? 'Need at least 20 reviews' : ''}
                  >
                    <SlidersHorizontalIcon className="size-3" />
                    Retrain weights
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRequestTrain}
                    disabled={modelStatus.review_count < 50 || isTraining}
                    title={modelStatus.review_count < 50 ? 'Need at least 50 reviews' : ''}
                  >
                    <SparklesIcon className="size-3" />
                    Train ML model
                  </Button>
                </div>
              </>
            )}
          </CardFooter>
        </Card>
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
    if (n.type === 'ingestion_progress') {
      setMatchProgress({ stage: n.data.stage ?? 'Processing', progress: n.data.progress ?? 0 });
    } else if (n.type === 'ingestion_complete' || n.type === 'ingestion_failed') {
      setMatchProgress(null);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [queryClient]));

  if (isLoading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="h-full overflow-auto">
        <div className="p-5">
          <Card>
            <CardContent className="p-7 text-center">
              <CloudOffIcon className="size-8 text-destructive mx-auto" />
              <p className="mt-3 text-destructive font-medium">
                {error instanceof Error ? error.message : 'Failed to load dashboard'}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                <RefreshCwIcon className="size-3" />
                Retry
              </Button>
            </CardContent>
          </Card>
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
