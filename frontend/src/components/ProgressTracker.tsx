// ── Pipeline progress tracker — terminal aesthetic ──

import { useEffect, useRef } from 'react';
import { useTaskStatus } from '../hooks/useTaskStatus';
import Panel, { PanelHead } from './ui/Panel';
import Hbar from './ui/Hbar';
import Spinner from './ui/Spinner';
import Pill from './ui/Pill';

interface ProgressTrackerProps {
  taskId: string;
  onComplete?: () => void;
}

const STAGES = [
  { key: 'PARSING', label: 'Parsing CSV' },
  { key: 'NORMALIZING', label: 'Normalizing fields' },
  { key: 'EMBEDDING', label: 'Generating embeddings (384d)' },
  { key: 'MATCHING_ENQUEUED', label: 'Matching enqueued' },
  { key: 'MATCHING', label: 'Blocking, scoring, clustering' },
];

const MATCHING_STAGES = new Set(['BLOCKING', 'SCORING', 'CLUSTERING', 'INSERTING', 'MATCHING']);

function getActiveStageIndex(state: string, stage: string | null): number {
  if (state === 'COMPLETE') return STAGES.length;
  if (state === 'FAILURE') return -1;
  if (!stage) return 0;
  if (MATCHING_STAGES.has(stage)) return 4;
  const idx = STAGES.findIndex(s => s.key === stage);
  return idx >= 0 ? idx : 0;
}

export default function ProgressTracker({ taskId, onComplete }: ProgressTrackerProps) {
  const { state, stage, progress, detail, row_count, isComplete, isFailed } = useTaskStatus(taskId);
  const activeIndex = getActiveStageIndex(state, stage);
  const firedRef = useRef(false);

  useEffect(() => {
    if (isComplete && !firedRef.current) {
      firedRef.current = true;
      onComplete?.();
    }
  }, [isComplete, onComplete]);

  const overallPct = isComplete ? 100 : isFailed ? 0 : progress ?? 0;

  return (
    <Panel className="fade">
      <PanelHead>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isComplete ? (
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ok)' }}>check_circle</span>
          ) : isFailed ? (
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--danger)' }}>error</span>
          ) : (
            <Spinner size={14} />
          )}
          <span className="panel-title">
            {isComplete ? 'Ingestion complete' : isFailed ? 'Ingestion failed' : 'Ingestion in progress'}
          </span>
          {isComplete && row_count != null && (
            <Pill tone="ok">{row_count.toLocaleString()} rows</Pill>
          )}
        </div>
        {!isComplete && !isFailed && (
          <span
            className="mono tnum"
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}
          >
            {Math.round(overallPct)}%
          </span>
        )}
      </PanelHead>

      <div style={{ padding: 14 }}>
        <Hbar
          value={overallPct}
          tone={isComplete ? 'ok' : isFailed ? 'danger' : 'accent'}
          style={{ height: 6 }}
        />

        <div style={{ marginTop: 16 }}>
          {STAGES.map((s, i) => {
            const done = isComplete || activeIndex > i;
            const active = !isComplete && !isFailed && activeIndex === i;
            const stagePct = active ? Math.round(progress ?? 0) : done ? 100 : 0;
            return (
              <div
                key={s.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr 60px 60px',
                  padding: '8px 0',
                  gap: 12,
                  alignItems: 'center',
                  borderBottom: i < STAGES.length - 1 ? '1px solid var(--border-0)' : 'none',
                }}
              >
                <span style={{ display: 'inline-flex', justifyContent: 'center' }}>
                  {done ? (
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ok)' }}>
                      check
                    </span>
                  ) : active ? (
                    <Spinner size={10} />
                  ) : (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        border: '1.5px solid var(--border-1)',
                      }}
                    />
                  )}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: done ? 'var(--fg-1)' : active ? 'var(--fg-0)' : 'var(--fg-2)',
                  }}
                >
                  {s.label}
                </span>
                <Hbar
                  value={stagePct}
                  tone={done ? 'ok' : active ? 'accent' : undefined}
                  style={{ height: 3 }}
                />
                <span
                  className="mono tnum"
                  style={{ fontSize: 11, textAlign: 'right', color: 'var(--fg-2)' }}
                >
                  {done ? 'done' : active ? `${stagePct}%` : 'queued'}
                </span>
              </div>
            );
          })}
        </div>

        {detail && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--fg-2)',
              marginTop: 12,
              padding: '6px 10px',
              background: 'var(--bg-2)',
              borderRadius: 4,
            }}
          >
            {detail}
          </div>
        )}

        {isFailed && detail && (
          <div
            className="pill danger"
            style={{ marginTop: 12, padding: '6px 10px', width: '100%', justifyContent: 'flex-start' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
            {detail}
          </div>
        )}
      </div>
    </Panel>
  );
}
