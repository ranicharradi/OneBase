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
  TrendingDownIcon,
  MinusIcon,
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
import { Progress } from '@/components/ui/progress';
import Spinner from '../components/ui/Spinner';

const REFRESH_MS = 30_000;

interface MatchProgress {
  stage: string;
  progress: number;
}

// Dashboard response with optional trend data (used in future task phases)
type DashboardResponseWithTrend = DashboardResponse & {
  trend?: { delta: number; period: string } | null;
};

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
    <div className="px-5 py-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-md border p-4">
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
        className="stroke-muted"
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
        className="stroke-primary"
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
        className="fill-foreground font-mono tabular-nums"
        style={{
          fontSize: 56,
          fontWeight: 600,
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
        className="fill-muted-foreground"
        style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}
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

// Convert ISO timestamp to compact relative format (e.g., "5m", "2h", "yest", "Jan 15")
function compactRelative(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yest';
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Group recent activity items by day (Today, Yesterday, or date range)
function groupActivityByDay(items: RecentActivity[]): Array<{ label: string; items: RecentActivity[] }> {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });
  const now = new Date();
  const todayKey = now.toDateString();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yestKey = yest.toDateString();
  const groups = new Map<string, { label: string; items: RecentActivity[] }>();
  for (const item of sorted) {
    if (!item.created_at) continue;
    const d = new Date(item.created_at);
    const key = d.toDateString();
    let label: string;
    if (key === todayKey) label = 'Today';
    else if (key === yestKey) label = 'Yesterday';
    else label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  return Array.from(groups.values());
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
  sourcesCount,
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
  sourcesCount: number | undefined;
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
    <div className="px-5 py-5" data-testid="dashboard-overview">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold m-0">
            <span className="text-muted-foreground font-normal">Modular Data Pipeline · </span>
            Overview
          </h1>
          {matchProgress && (
            <Badge variant="secondary">
              <Spinner size={10} />
              {matchProgress.stage} · {matchProgress.progress}%
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Spinner size={12} /> : <RefreshCwIcon className="size-3" />}
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

      {/* Hero band */}
      <div
        className="mb-6 rounded-lg border border-border bg-gradient-to-r from-card via-card to-muted/50 px-8 py-10"
        data-testid="dashboard-hero"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] items-center gap-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Records Unified
            </div>
            {uploads.total_staged === 0 ? (
              <>
                <h2 className="font-serif text-5xl lg:text-6xl font-medium leading-[1.1] tracking-tight text-foreground mt-3">
                  No records yet. Start by uploading a file.
                </h2>
                <Button asChild className="mt-5">
                  <Link to="/upload">
                    <PlusIcon className="size-3.5" />
                    Upload your first file
                  </Link>
                </Button>
              </>
            ) : unified.total_unified === 0 ? (
              <>
                <h2 className="font-serif text-5xl lg:text-6xl font-medium leading-[1.1] tracking-tight text-foreground mt-3">
                  <span className="font-semibold">0%</span> unified — review pending candidates.
                </h2>
                <div className="mt-4 text-sm text-muted-foreground font-mono tabular-nums">
                  0 of {uploads.total_staged.toLocaleString()} records
                </div>
              </>
            ) : (
              <>
                <h2 className="font-serif text-5xl lg:text-6xl font-medium leading-[1.1] tracking-tight text-foreground mt-3">
                  <span className="font-semibold">{coverage}%</span> of staged records consolidated into golden output.
                </h2>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-muted-foreground font-mono tabular-nums">
                    {unified.total_unified.toLocaleString()} of {uploads.total_staged.toLocaleString()} records
                  </span>
                  {(() => {
                    const trend = (data as DashboardResponseWithTrend).trend;
                    if (!trend) {
                      return (
                        <Badge variant="outline" className="font-normal gap-1.5">
                          <MinusIcon className="size-3 text-muted-foreground" />
                          <span className="font-mono tabular-nums">—</span>
                          <span className="text-muted-foreground">trend pending</span>
                        </Badge>
                      );
                    }
                    const TrendIcon = trend.delta >= 0 ? TrendingUpIcon : TrendingDownIcon;
                    const trendColor = trend.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
                    return (
                      <Badge variant="outline" className={`font-normal gap-1.5 ${trendColor}`}>
                        <TrendIcon className="size-3" />
                        <span className="font-mono tabular-nums">
                          {trend.delta >= 0 ? '+' : ''}{trend.delta.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">{trend.period}</span>
                      </Badge>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col items-center">
            <EmptyRing pct={coverage} />
            {uploads.total_staged > 0 && (
              <div className="mt-2 text-center text-xs font-mono text-muted-foreground tabular-nums">
                {unified.total_unified.toLocaleString()} / {uploads.total_staged.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ops grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Pipeline column */}
        <Card data-testid="dashboard-pipeline">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium">Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {stages.map((s, idx) => {
              const isActive = s.label === activeStage;
              const isLast = idx === stages.length - 1;
              let dotClass = 'bg-muted-foreground/30';
              if (isActive) dotClass = 'bg-primary animate-pulse';
              else if (s.label === 'INGEST' || s.label === 'MATCH') dotClass = 'bg-primary';
              else if (s.label === 'REVIEW' && review.pending > 0) dotClass = 'bg-amber-500';
              else if (s.label === 'UNIFY' && unified.total_unified > 0) dotClass = 'bg-emerald-500';
              return (
                <div key={s.label} className="flex gap-3">
                  <div className="w-3 shrink-0 flex flex-col items-center">
                    <div className={`size-2 rounded-full mt-2 ${dotClass}`} />
                    {!isLast && <div className="w-px bg-border flex-1 mt-1" />}
                  </div>
                  <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                    <div className="flex items-center gap-1.5">
                      <StageIcon label={s.label} />
                      <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                        {s.label}
                      </span>
                    </div>
                    {isActive && matchProgress ? (
                      <div className="mt-1.5">
                        <Progress value={matchProgress.progress} className="h-1.5" />
                        <div className="text-xs text-muted-foreground mt-1">
                          {matchProgress.stage} · {matchProgress.progress}%
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-mono tabular-nums text-2xl font-semibold mt-1 text-foreground">
                          {s.stat}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.unit} · {s.sub}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Next Steps column */}
        <Card data-testid="dashboard-next-steps">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium">Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <CheckCircle2Icon className="size-6 text-emerald-500/70" />
                <span className="text-sm">You're all caught up.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {actions.map((a) => (
                  <Link
                    key={a.key}
                    to={a.to}
                    className={`block rounded-md border p-3 transition-colors hover:bg-foreground/[0.02] dark:hover:bg-foreground/[0.04] ${actionToneBg(a.tone)}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <ActionIcon tone={a.tone} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{a.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{a.detail}</div>
                      </div>
                      <ArrowRightIcon className="size-3.5 text-muted-foreground/60 shrink-0 mt-1" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity column */}
        <Card data-testid="dashboard-activity">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium">Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[280px]">
              <div className="px-4 pb-3">
                {recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <SparklesIcon className="size-6 opacity-50" />
                    <span className="text-sm">Nothing yet — start by uploading data.</span>
                  </div>
                ) : (
                  groupActivityByDay(recentActivity).map((group) => (
                    <div key={group.label} className="mt-3 first:mt-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] font-serif font-medium text-muted-foreground pb-1.5 border-b border-border/50">
                        {group.label}
                      </div>
                      {group.items.map((a) => {
                        const tone = a.tone ?? toneForAction(a.action);
                        const title = a.title ?? a.entity_name ?? a.action;
                        return (
                          <div key={a.id} className="flex items-start gap-2.5 py-2">
                            <div className={`size-1.5 rounded-full ${activityDotClass(tone)} mt-1.5 shrink-0`} />
                            <div className="flex-1 text-xs text-foreground min-w-0">
                              <div className="leading-snug">{title}</div>
                              {a.actor && (
                                <div className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">
                                  {a.actor}
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono tabular-nums shrink-0 mt-1">
                              {compactRelative(a.created_at)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* KPI strip */}
      <Card className="mb-6 overflow-hidden" data-testid="dashboard-kpi-strip">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-border">
          <Link to="/sources" className="block p-4 hover:bg-muted/40 transition-colors">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Sources
            </div>
            <div className="text-2xl font-mono tabular-nums font-medium mt-1.5 text-foreground">
              {sourcesCount !== undefined ? sourcesCount.toLocaleString() : '—'}
            </div>
          </Link>
          <Link to="/history" className="block p-4 hover:bg-muted/40 transition-colors">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Batches
            </div>
            <div className="text-2xl font-mono tabular-nums font-medium mt-1.5 text-foreground">
              {totalBatches.toLocaleString()}
            </div>
          </Link>
          <Link to="/sources" className="block p-4 hover:bg-muted/40 transition-colors">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Total records
            </div>
            <div className="text-2xl font-mono tabular-nums font-medium mt-1.5 text-foreground">
              {uploads.total_staged.toLocaleString()}
            </div>
          </Link>
          <Link to="/match" className="block p-4 hover:bg-muted/40 transition-colors">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Avg confidence
            </div>
            <div className="text-2xl font-mono tabular-nums font-medium mt-1.5 text-foreground">
              {avgConf > 0 ? avgConf.toFixed(2) : '—'}
            </div>
          </Link>
          <div className="p-4 flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              live · 30s refresh
            </span>
          </div>
        </div>
      </Card>

      {/* ML & matching — admin-only */}
      {isAdmin && modelStatus && (
        <Card className="mt-6">
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
                  {Object.values(modelStatus.current_weights).map((w) => w.toFixed(2)).join(' · ')}
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-2.5">
            {confirmAction ? (
              <>
                <div className="text-xs text-muted-foreground">
                  {confirmAction === 'retrain'
                    ? 'Retrain weights from current review data?'
                    : 'Train a new ML model from current review data?'}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onCancelMlAction}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onConfirmMlAction} disabled={isRetraining || isTraining}>
                    {(isRetraining || isTraining) && <Spinner size={10} />}
                    Confirm
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRequestRetrain}
                  disabled={isRetraining || isTraining || modelStatus.review_count < 20}
                >
                  <SlidersHorizontalIcon className="size-3" />
                  Retrain weights
                </Button>
                <Button
                  size="sm"
                  onClick={onRequestTrain}
                  disabled={isRetraining || isTraining || modelStatus.review_count < 50}
                >
                  <SparklesIcon className="size-3" />
                  Train ML model
                </Button>
              </div>
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

  const { data: sourcesList } = useQuery({
    queryKey: ['dashboard-sources-count', selectedType],
    queryFn: () =>
      api.get<Array<{ id: number }>>(
        `/api/sources?type=${encodeURIComponent(selectedType)}`,
      ),
    refetchInterval: REFRESH_MS,
  });
  const sourcesCount = sourcesList?.length;

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
      sourcesCount={sourcesCount}
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
