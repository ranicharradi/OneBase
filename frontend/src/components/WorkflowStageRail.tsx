import { cn } from '@/lib/utils';

type StageKey = 'match' | 'review' | 'merge' | 'unified';

interface StageSlot {
  onClick?: () => void;
  title?: string;
}

interface WorkflowStageRailProps {
  activeStage: StageKey;
  match?: StageSlot;
  review?: StageSlot;
  merge?: StageSlot;
  unified?: StageSlot;
}

const STAGE_META: Record<StageKey, { num: string; label: string; subtitle: string }> = {
  match:   { num: '01', label: 'Match',   subtitle: 'Candidate pairs'  },
  review:  { num: '02', label: 'Review',  subtitle: 'Same record?'     },
  merge:   { num: '03', label: 'Merge',   subtitle: 'Reconcile fields' },
  unified: { num: '04', label: 'Unified', subtitle: 'Unified records'  },
};

const STAGE_ORDER: StageKey[] = ['match', 'review', 'merge', 'unified'];

export default function WorkflowStageRail({ activeStage, match, review, merge, unified }: WorkflowStageRailProps) {
  const slots: Record<StageKey, StageSlot | undefined> = { match, review, merge, unified };

  return (
    <div className="mb-3 flex items-stretch overflow-hidden rounded-lg border border-border bg-card">
      {STAGE_ORDER.map((key) => {
        const meta = STAGE_META[key];
        const slot = slots[key];
        const isActive = key === activeStage;
        // Active cell ignores onClick even if passed — runtime guard.
        const clickable = !isActive && !!slot?.onClick;
        const commonClass = cn(
          'relative flex-1 min-w-[180px] overflow-hidden px-4 py-3 text-left',
          'border-l border-border first:border-l-0',
          isActive && 'bg-primary',
          clickable && 'cursor-pointer hover:bg-muted/50',
        );
        const labelClass = cn(
          'relative text-[11px] font-semibold uppercase tracking-wider',
          isActive ? 'text-primary-foreground' : 'text-muted-foreground',
        );
        const subtitleClass = cn(
          'relative mt-0.5 text-[11px]',
          isActive ? 'text-primary-foreground/70' : 'text-muted-foreground',
        );
        const numClass = cn(
          'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none',
          'font-mono text-[52px] font-bold leading-none',
          isActive ? 'text-primary-foreground opacity-[0.22]' : 'text-foreground opacity-[0.05]',
        );

        const body = (
          <>
            <span className={numClass} aria-hidden="true">{meta.num}</span>
            <div className={labelClass}>{meta.label}</div>
            <div className={subtitleClass}>{meta.subtitle}</div>
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-foreground"
              />
            )}
          </>
        );

        if (clickable) {
          return (
            <button
              key={key}
              type="button"
              onClick={slot!.onClick}
              title={slot!.title}
              className={commonClass}
            >
              {body}
            </button>
          );
        }

        return (
          <div
            key={key}
            title={slot?.title}
            className={commonClass}
            aria-current={isActive ? 'step' : undefined}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
