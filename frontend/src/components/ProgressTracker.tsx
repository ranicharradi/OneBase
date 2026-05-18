// ── Pipeline progress tracker — terminal aesthetic ──

import { useEffect, useRef } from 'react';
import { useTaskStatus } from '../hooks/useTaskStatus';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2Icon, XCircleIcon, CheckIcon } from 'lucide-react';
import Hbar from './ui/Hbar';
import Spinner from './ui/Spinner';

interface ProgressTrackerProps {
  taskId: string;
  onComplete?: () => void;
}

const STAGES = [
  { key: 'PARSING', label: 'Parsing CSV' },
  { key: 'NORMALIZING', label: 'Normalizing fields' },
  { key: 'EMBEDDING', label: 'Generating embeddings (384d)' },
];

function getActiveStageIndex(state: string, stage: string | null): number {
  if (state === 'COMPLETE') return STAGES.length;
  if (state === 'FAILURE') return -1;
  if (!stage) return 0;
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5 justify-between">
          <div className="flex items-center gap-2.5">
            {isComplete ? (
              <CheckCircle2Icon className="size-4 text-emerald-600" />
            ) : isFailed ? (
              <XCircleIcon className="size-4 text-destructive" />
            ) : (
              <Spinner size={14} />
            )}
            <CardTitle className="text-sm">
              {isComplete ? 'Ingestion complete' : isFailed ? 'Ingestion failed' : 'Ingestion in progress'}
            </CardTitle>
            {isComplete && row_count != null && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 ml-auto">
                {row_count.toLocaleString()} rows
              </Badge>
            )}
          </div>
          {!isComplete && !isFailed && (
            <span className="font-mono tabular-nums text-xs font-semibold text-primary">
              {Math.round(overallPct)}%
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Hbar
          value={overallPct}
          fillClassName={isComplete ? 'bg-emerald-500' : isFailed ? 'bg-destructive' : 'bg-primary'}
          className="h-1.5"
        />

        <div className="space-y-0">
          {STAGES.map((s, i) => {
            const done = isComplete || activeIndex > i;
            const active = !isComplete && !isFailed && activeIndex === i;
            const stagePct = active ? Math.round(progress ?? 0) : done ? 100 : 0;
            return (
              <div
                key={s.key}
                className={`grid grid-cols-[20px_1fr_60px_60px] gap-3 py-2 px-0 items-center ${i < STAGES.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex justify-center">
                  {done ? (
                    <CheckIcon className="size-3.5 text-emerald-600" />
                  ) : active ? (
                    <Spinner size={10} />
                  ) : (
                    <div className="size-2 rounded-full border-1.5 border-border" />
                  )}
                </div>
                <span
                  className={`text-xs ${done ? 'text-foreground/80' : active ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {s.label}
                </span>
                <Hbar
                  value={stagePct}
                  fillClassName={done ? 'bg-emerald-500' : active ? 'bg-primary' : undefined}
                  className="h-0.5"
                />
                <span className="font-mono tabular-nums text-xs text-muted-foreground text-right">
                  {done ? 'done' : active ? `${stagePct}%` : 'queued'}
                </span>
              </div>
            );
          })}
        </div>

        {detail && (
          <div className="font-mono text-xs text-muted-foreground mt-3 p-2.5 bg-muted rounded">
            {detail}
          </div>
        )}

        {isFailed && detail && (
          <div className="flex items-start gap-2 mt-3 p-2.5 w-full bg-destructive/10 rounded">
            <XCircleIcon className="size-3 text-destructive flex-shrink-0 mt-0.5" />
            <span className="text-xs text-destructive">{detail}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
