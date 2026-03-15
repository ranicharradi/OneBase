// ── Real-time pipeline progress tracker ──
// Dark Precision Editorial — alive pipeline animation, connecting lines, celebration state

import { useTaskStatus } from '../hooks/useTaskStatus';

interface ProgressTrackerProps {
  taskId: string;
}

const STAGES = [
  { key: 'PARSING', label: 'Parsing', icon: ParseIcon },
  { key: 'NORMALIZING', label: 'Normalizing', icon: NormalizeIcon },
  { key: 'EMBEDDING', label: 'Embedding', icon: EmbedIcon },
  { key: 'MATCHING_ENQUEUED', label: 'Match Enqueued', icon: MatchEnqueuedIcon },
  { key: 'MATCHING', label: 'Matching', icon: MatchingRunIcon },
];

// Matching task stages reported via Celery progress callback
const MATCHING_STAGES = new Set(['BLOCKING', 'SCORING', 'CLUSTERING', 'INSERTING', 'MATCHING']);

// Map backend states to stage index
function getActiveStageIndex(state: string, stage: string | null): number {
  if (state === 'COMPLETE') return STAGES.length; // all done
  if (state === 'FAILURE') return -1;
  if (!stage) return 0;

  // Matching-related stages map to index 4 (the MATCHING stage)
  if (MATCHING_STAGES.has(stage)) return 4;

  const idx = STAGES.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx : 0;
}

function getStageStatus(stageIndex: number, activeIndex: number, state: string): 'pending' | 'active' | 'complete' {
  if (state === 'COMPLETE') return 'complete';
  if (state === 'FAILURE' && stageIndex <= activeIndex) return stageIndex === activeIndex ? 'active' : 'complete';
  if (stageIndex < activeIndex) return 'complete';
  if (stageIndex === activeIndex) return 'active';
  return 'pending';
}

export default function ProgressTracker({ taskId }: ProgressTrackerProps) {
  const { state, stage, progress, detail, row_count, isComplete, isFailed } = useTaskStatus(taskId);
  const activeIndex = getActiveStageIndex(state, stage);

  return (
    <div className="card overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-6 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className={`relative flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-500 ${
            isComplete
              ? 'bg-success-500/15 border-success-500/25 shadow-sm shadow-success-500/10'
              : isFailed
                ? 'bg-danger-500/15 border-danger-500/25 shadow-sm shadow-danger-500/10'
                : 'bg-accent-500/10 border-accent-500/20 glow-accent'
          }`}>
            {isComplete ? (
              <svg className="w-5 h-5 text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isFailed ? (
              <svg className="w-5 h-5 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            ) : (
              <div className="w-5 h-5 border-2 border-accent-400/40 border-t-accent-400 rounded-full animate-spin" />
            )}
          </div>
          <div>
            <p className="text-sm font-display text-white tracking-wide">
              {isComplete ? 'Processing Complete' : isFailed ? 'Processing Failed' : 'Processing Upload'}
            </p>
            <p className="text-xs text-surface-500 font-body">
              {isComplete
                ? `${row_count?.toLocaleString() ?? '—'} rows processed`
                : isFailed
                  ? 'An error occurred during processing'
                  : detail || 'Pipeline in progress...'
              }
            </p>
          </div>
        </div>

        {/* Overall progress percentage — prominent display */}
        {!isComplete && !isFailed && progress != null && (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-display tabular-nums text-accent-300 text-glow-accent">
              {Math.round(progress)}
            </span>
            <span className="text-xs text-accent-500/60 font-medium">%</span>
          </div>
        )}
      </div>

      {/* ── Pipeline stages — horizontal with connecting lines ── */}
      <div className="p-6">
        <div className="relative">
          {/* Connection line — base track */}
          <div className="absolute top-6 left-8 right-8 h-[2px] bg-surface-700/40 rounded-full" />

          {/* Connection line — animated fill */}
          <div
            className="absolute top-6 left-8 h-[2px] rounded-full transition-all duration-1000 ease-out"
            style={{
              width: isComplete
                ? 'calc(100% - 4rem)'
                : activeIndex > 0
                  ? `calc(${(activeIndex / (STAGES.length - 1)) * 100}% - 2rem)`
                  : '0%',
              background: isComplete
                ? 'linear-gradient(90deg, rgba(34,197,94,0.6), rgba(34,197,94,0.4))'
                : isFailed
                  ? 'linear-gradient(90deg, rgba(239,68,68,0.5), rgba(239,68,68,0.3))'
                  : 'linear-gradient(90deg, rgba(6,182,212,0.6), rgba(6,182,212,0.3))',
            }}
          />

          {/* Stage nodes */}
          <div className="relative grid grid-cols-5 gap-2">
            {STAGES.map((s, i) => {
              const status = getStageStatus(i, activeIndex, state);
              const StageIcon = s.icon;

              return (
                <div key={s.key} className="flex flex-col items-center text-center">
                  {/* Icon node */}
                  <div className={`
                    relative z-10 flex items-center justify-center w-12 h-12 rounded-xl border
                    transition-all duration-700 ease-out
                    ${status === 'complete'
                      ? 'bg-success-500/15 border-success-500/25 text-success-400 shadow-sm shadow-success-500/10'
                      : status === 'active'
                        ? 'bg-accent-500/15 border-accent-500/30 text-accent-300 shadow-[0_0_25px_-5px_rgba(6,182,212,0.25)]'
                        : 'bg-surface-800/40 border-white/[0.06] text-surface-600'
                    }
                  `}>
                    {/* Active stage glow ring */}
                    {status === 'active' && (
                      <div className="absolute inset-0 rounded-xl animate-pulse-glow" />
                    )}

                    {status === 'complete' ? (
                      <svg className="w-5 h-5 animate-fadeIn" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : status === 'active' ? (
                      <div className="relative">
                        <StageIcon className="w-5 h-5" />
                        {/* Spinning border indicator */}
                        <div className="absolute -inset-1.5 border border-accent-400/30 border-t-accent-400/60 rounded-lg animate-spin" style={{ animationDuration: '3s' }} />
                      </div>
                    ) : (
                      <StageIcon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Label */}
                  <p className={`mt-3 text-xs font-medium transition-colors duration-500 ${
                    status === 'complete'
                      ? 'text-success-400'
                      : status === 'active'
                        ? 'text-accent-300 font-semibold'
                        : 'text-surface-600'
                  }`}>
                    {s.label}
                  </p>

                  {/* Active indicator dot with pulse */}
                  {status === 'active' && !isFailed && (
                    <div className="mt-2 relative">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                      <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-accent-400 animate-ping" />
                    </div>
                  )}

                  {/* Failed indicator */}
                  {status === 'active' && isFailed && (
                    <div className="mt-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-danger-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Completion summary — celebration treatment ── */}
      {isComplete && (
        <div className="px-6 pb-6 animate-slideUp">
          <div className="relative rounded-xl bg-success-500/[0.06] border border-success-500/15 px-5 py-4 overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 bg-success-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-success-500/15 border border-success-500/25">
                <svg className="w-5 h-5 text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-display text-success-300">
                  <span className="font-semibold tabular-nums">{row_count?.toLocaleString() ?? '—'}</span> rows processed
                </p>
                {detail && <p className="text-xs text-success-400/70 mt-0.5">{detail}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Failure message ── */}
      {isFailed && (
        <div className="px-6 pb-6 animate-slideUp">
          <div className="relative rounded-xl bg-danger-500/[0.06] border border-danger-500/15 px-5 py-4 overflow-hidden">
            {/* Danger ambient glow */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 bg-danger-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-danger-500/15 border border-danger-500/25 shrink-0">
                <svg className="w-5 h-5 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-display text-danger-300">Processing failed</p>
                {detail && <p className="text-xs text-danger-400/80 mt-1 leading-relaxed">{detail}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stage icons ──

function ParseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function NormalizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  );
}

function EmbedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  );
}

function MatchEnqueuedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function MatchingRunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      {/* Interlocking circles — represents matching/merging records */}
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </svg>
  );
}
