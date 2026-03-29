// ── Dashboard — Pipeline View ──
// Hero progress ring · pipeline stage cards · contextual next actions

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { DashboardResponse, MatchingNotification, ModelStatusResponse } from '../api/types';
import { useMatchingNotifications } from '../hooks/useMatchingNotifications';
import { useAuth } from '../hooks/useAuth';

const REFRESH_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────────

interface MatchProgress {
  stage: string;
  progress: number;
}

interface NextAction {
  key: string;
  variant: 'danger' | 'warn' | 'info';
  icon: string;
  title: string;
  detail: string;
  to: string;
  cta: string;
}

type DotColor = 'green' | 'yellow' | 'red' | 'accent';

// ── Helpers ────────────────────────────────────────────────────────────

const DOT_COLORS: Record<DotColor, string> = {
  green: 'bg-success-500',
  yellow: 'bg-warning-500',
  red: 'bg-danger-500',
  accent: 'bg-accent-500',
};

const ACTION_VARIANTS: Record<string, { bg: string; iconBg: string; iconColor: string }> = {
  danger: {
    bg: 'bg-danger-500/[0.06] hover:bg-danger-500/[0.12]',
    iconBg: 'bg-danger-500/[0.12]',
    iconColor: 'text-danger-500',
  },
  warn: {
    bg: 'bg-warning-500/[0.06] hover:bg-warning-500/[0.12]',
    iconBg: 'bg-warning-500/[0.12]',
    iconColor: 'text-warning-500',
  },
  info: {
    bg: 'bg-accent-500/[0.06] hover:bg-accent-500/[0.12]',
    iconBg: 'bg-accent-500/[0.12]',
    iconColor: 'text-accent-500',
  },
};

function deriveActions(d: DashboardResponse): NextAction[] {
  const out: NextAction[] = [];

  if (d.uploads.failed > 0) {
    out.push({
      key: 'failed-uploads',
      variant: 'danger',
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
      variant: 'warn',
      icon: 'rate_review',
      title: `Review ${d.review.pending} match candidate${d.review.pending !== 1 ? 's' : ''}`,
      detail: done > 0
        ? `${done} already reviewed \u2014 keep going`
        : 'Confirm or reject potential supplier matches',
      to: '/review',
      cta: 'Start reviewing',
    });
  }

  if (d.unified.total_unified > 0) {
    out.push({
      key: 'view-unified',
      variant: 'info',
      icon: 'download',
      title: `Export ${d.unified.total_unified.toLocaleString()} unified records`,
      detail: `${d.unified.merged} merged \u00b7 ${d.unified.singletons} singletons`,
      to: '/unified',
      cta: 'View records',
    });
  }

  return out.slice(0, 3);
}

// ── Progress Ring ──────────────────────────────────────────────────────

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({
  pct,
  unified,
  total,
}: {
  pct: number;
  unified: number;
  total: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dash = ready ? (pct / 100) * RING_C : 0;

  return (
    <div className="card rounded-2xl p-7 flex flex-col items-center justify-center gap-2 min-w-[210px]">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${pct}% unified`}
      >
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'var(--color-accent-600)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-accent-300)' }} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx="60" cy="60" r={RING_R}
          fill="none" strokeWidth="7"
          style={{ stroke: 'var(--ring-track)' }}
        />
        {/* Arc */}
        <circle
          cx="60" cy="60" r={RING_R}
          fill="none" stroke="url(#ring-grad)" strokeWidth="7"
          strokeDasharray={`${dash} ${RING_C}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{
            transition: 'stroke-dasharray 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--color-accent-500) 40%, transparent))',
          }}
        />
        {/* Percentage */}
        <text
          x="60" y="55"
          textAnchor="middle" dominantBaseline="central"
          style={{
            fontSize: 28,
            fontWeight: 800,
            fontFamily: 'var(--font-display)',
            fill: 'var(--color-on-surface)',
          }}
        >
          {pct}%
        </text>
        {/* Label */}
        <text
          x="60" y="74"
          textAnchor="middle" dominantBaseline="central"
          style={{
            fontSize: 10,
            fontWeight: 500,
            fill: 'var(--color-on-surface-variant)',
            opacity: 0.6,
          }}
        >
          unified
        </text>
      </svg>
      <p className="text-xs text-on-surface-variant/60 text-center">
        {total > 0
          ? `${unified.toLocaleString()} / ${total.toLocaleString()} suppliers`
          : 'Upload files to get started'}
      </p>
    </div>
  );
}

// ── Pipeline Card ──────────────────────────────────────────────────────

function PipelineCard({
  dot,
  pulse,
  label,
  value,
  sub,
  delay,
  children,
}: {
  dot: DotColor;
  pulse?: boolean;
  label: string;
  value: string;
  sub?: string;
  delay?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="card card-hover p-4 flex flex-col justify-center rounded-xl animate-fadeIn"
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[dot]} ${pulse ? 'animate-pulse-glow' : ''}`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/60">
          {label}
        </span>
      </div>
      <p className="text-[22px] font-display font-extrabold tracking-tight text-on-surface leading-tight">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{sub}</p>
      )}
      {children}
    </div>
  );
}

// ── Matching Progress Bar ──────────────────────────────────────────────

function MatchingBar({ progress }: { progress: number }) {
  return (
    <>
      <p className="text-[11px] text-accent-600 font-semibold mt-1.5">
        {progress}% complete
      </p>
      <div className="h-1.5 rounded-full bg-white/30 overflow-hidden mt-2">
        <div
          className="h-full rounded-full relative overflow-hidden"
          style={{
            width: `${progress}%`,
            transition: 'width 0.6s ease-out',
            background: 'linear-gradient(90deg, var(--color-accent-600), var(--color-accent-300))',
          }}
        >
          <div className="absolute inset-0 animate-shimmer" />
        </div>
      </div>
    </>
  );
}

// ── Action Item ────────────────────────────────────────────────────────

function ActionItem({ action, delay }: { action: NextAction; delay?: number }) {
  const s = ACTION_VARIANTS[action.variant];
  return (
    <Link
      to={action.to}
      className={`
        group flex items-center justify-between px-4 py-3.5 rounded-xl
        transition-all duration-200 hover:translate-x-0.5
        ${s.bg} animate-fadeIn
      `}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
          <span className={`material-symbols-outlined text-lg ${s.iconColor}`}>
            {action.icon}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-on-surface truncate">
            {action.title}
          </p>
          <p className="text-[11px] text-on-surface-variant/60 mt-px truncate">
            {action.detail}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-accent-600 text-xs font-semibold opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-4">
        {action.cta}
        <span className="material-symbols-outlined text-sm">arrow_forward</span>
      </div>
    </Link>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="w-full lg:w-[210px] h-[210px] rounded-2xl bg-white/30 border border-on-surface/5 animate-pulse" />
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[110px] rounded-xl bg-white/30 border border-on-surface/5 animate-pulse"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
      <div
        className="h-44 rounded-2xl bg-white/30 border border-on-surface/5 animate-pulse"
        style={{ animationDelay: '0.3s' }}
      />
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/unified/dashboard'),
    refetchInterval: REFRESH_MS,
  });

  const { data: modelStatus } = useQuery<ModelStatusResponse>({
    queryKey: ['model-status'],
    queryFn: () => api.get('/api/matching/model-status'),
    enabled: isAdmin,
  });

  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(null);
  const [confirmAction, setConfirmAction] = useState<'retrain' | 'train' | null>(null);

  const retrainMutation = useMutation({
    mutationFn: () => api.post('/api/matching/retrain'),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
    },
    onError: () => {
      setConfirmAction(null);
    },
  });

  const trainMutation = useMutation({
    mutationFn: () => api.post('/api/matching/train-model'),
    onSuccess: () => {
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['model-status'] });
    },
    onError: () => {
      setConfirmAction(null);
    },
  });

  useMatchingNotifications(
    useCallback((n: MatchingNotification) => {
      if (n.type === 'matching_progress') {
        setMatchProgress({
          stage: n.data.stage ?? 'Processing',
          progress: n.data.progress ?? 0,
        });
      } else if (n.type === 'matching_complete' || n.type === 'matching_failed') {
        setMatchProgress(null);
      }
    }, []),
  );

  // ── States ──

  if (isLoading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
        <span className="material-symbols-outlined text-4xl text-danger-500/60 mb-3">
          cloud_off
        </span>
        <p className="text-sm font-medium text-danger-500">
          {error instanceof Error ? error.message : 'Failed to load dashboard'}
        </p>
      </div>
    );
  }

  // ── Derived values ──

  const { uploads, matching, review, unified } = data;
  const pct = uploads.total_staged > 0
    ? Math.round((unified.total_unified / uploads.total_staged) * 100)
    : 0;
  const actions = deriveActions(data);
  const isMatchRunning = matchProgress !== null;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── Hero: Ring + Pipeline Cards ── */}
      <div className="flex flex-col lg:flex-row gap-5 items-stretch">
        <ProgressRing
          pct={pct}
          unified={unified.total_unified}
          total={uploads.total_staged}
        />

        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Ingestion */}
          <PipelineCard
            dot={uploads.failed > 0 ? 'red' : 'green'}
            label="Ingestion"
            value={uploads.failed > 0 ? `${uploads.failed} failed` : 'Healthy'}
            sub={`${uploads.completed} upload${uploads.completed !== 1 ? 's' : ''} completed`}
            delay={0.05}
          />

          {/* Matching */}
          <PipelineCard
            dot={isMatchRunning ? 'accent' : 'green'}
            pulse={isMatchRunning}
            label="Matching"
            value={isMatchRunning ? `${matchProgress.stage}\u2026` : 'Idle'}
            sub={
              isMatchRunning
                ? undefined
                : matching.avg_confidence
                  ? `Avg ${(matching.avg_confidence * 100).toFixed(0)}% confidence`
                  : 'No matches yet'
            }
            delay={0.1}
          >
            {isMatchRunning && <MatchingBar progress={matchProgress.progress} />}
          </PipelineCard>

          {/* Review */}
          <PipelineCard
            dot={review.pending > 0 ? 'yellow' : 'green'}
            label="Review"
            value={String(review.pending)}
            sub={review.pending > 0 ? 'pending review' : 'all reviewed'}
            delay={0.15}
          />

          {/* Unified */}
          <PipelineCard
            dot="accent"
            label="Unified"
            value={unified.total_unified.toLocaleString()}
            sub={`${unified.merged} merged \u00b7 ${unified.singletons} singletons`}
            delay={0.2}
          />
        </div>
      </div>

      {/* ── ML & Matching ── */}
      {isAdmin && modelStatus && (
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant/60">
            ML & Matching
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-lg font-mono font-bold text-on-surface">{modelStatus.review_count}</p>
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">Reviews</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-mono font-bold text-on-surface">
                {modelStatus.ml_model_exists ? 'Trained' : 'None'}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">ML Model</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-mono text-on-surface truncate">
                {modelStatus.last_trained
                  ? new Date(modelStatus.last_trained).toLocaleDateString()
                  : '—'}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">Last Trained</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-mono text-on-surface">
                {Object.values(modelStatus.current_weights).map(w => w.toFixed(2)).join(' · ')}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">Weights</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setConfirmAction('retrain')}
              disabled={modelStatus.review_count < 20 || retrainMutation.isPending}
              className="btn-secondary text-xs disabled:opacity-40"
              title={modelStatus.review_count < 20 ? 'Need at least 20 reviews' : ''}
            >
              {retrainMutation.isPending ? 'Retraining...' : 'Retrain Signal Weights'}
            </button>
            <button
              onClick={() => setConfirmAction('train')}
              disabled={modelStatus.review_count < 50 || trainMutation.isPending}
              className="btn-secondary text-xs disabled:opacity-40"
              title={modelStatus.review_count < 50 ? 'Need at least 50 reviews' : ''}
            >
              {trainMutation.isPending ? 'Training...' : 'Train ML Model'}
            </button>
          </div>

          {confirmAction && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-warning-500/[0.06] border border-warning-500/20">
              <span className="material-symbols-outlined text-warning-500">warning</span>
              <p className="text-xs text-on-surface flex-1">
                {confirmAction === 'retrain'
                  ? 'This will recalculate signal weights from review decisions. Affects all future matching.'
                  : 'This will train a new ML model from review decisions. Affects all future matching.'}
              </p>
              <button
                onClick={() => confirmAction === 'retrain' ? retrainMutation.mutate() : trainMutation.mutate()}
                className="btn-primary text-xs"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmAction(null)} className="btn-secondary text-xs">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Next Actions ── */}
      <div className="card p-5 rounded-2xl animate-fadeIn" style={{ animationDelay: '0.15s' }}>
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant/60 mb-3.5">
          Suggested next steps
        </h2>

        {actions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {actions.map((a, i) => (
              <ActionItem key={a.key} action={a} delay={0.2 + i * 0.05} />
            ))}
          </div>
        ) : uploads.total_staged === 0 ? (
          /* Empty state — no data yet */
          <div className="flex flex-col items-center py-8">
            <span className="material-symbols-outlined text-4xl text-accent-500/40 mb-2">
              cloud_upload
            </span>
            <p className="text-sm font-semibold text-on-surface">Get started</p>
            <p className="text-xs text-on-surface-variant/60 mt-1 mb-4">
              Upload your first supplier CSV to begin unifying your data.
            </p>
            <Link to="/upload" className="btn-primary text-xs">
              Upload a file
            </Link>
          </div>
        ) : (
          /* All clear — nothing needs attention */
          <div className="flex flex-col items-center py-8">
            <span className="material-symbols-outlined text-4xl text-success-500/70 mb-2">
              check_circle
            </span>
            <p className="text-sm font-semibold text-on-surface">All caught up!</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              All suppliers are unified and reviewed. Nice work.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
