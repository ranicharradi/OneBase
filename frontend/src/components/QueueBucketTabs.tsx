interface BucketDef {
  id: string;
  label: string;
  tone: string;
  desc: string;
}

interface QueueBucketTabsProps {
  buckets: BucketDef[];
  active: string;
  counts: Record<string, number>;
  onChange: (id: string) => void;
}

const TONE_CLASSES: Record<string, { text: string; bg: string; border: string; shadow: string; activeBg: string; activeBorder: string }> = {
  ok: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-card',
    border: 'border-border',
    shadow: 'shadow-[inset_0_-3px_0_theme(colors.emerald.500)]',
    activeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    activeBorder: 'border-emerald-500',
  },
  warn: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-card',
    border: 'border-border',
    shadow: 'shadow-[inset_0_-3px_0_theme(colors.amber.500)]',
    activeBg: 'bg-amber-50 dark:bg-amber-950/40',
    activeBorder: 'border-amber-500',
  },
  danger: {
    text: 'text-destructive',
    bg: 'bg-card',
    border: 'border-border',
    shadow: 'shadow-[inset_0_-3px_0_hsl(var(--destructive))]',
    activeBg: 'bg-destructive/5',
    activeBorder: 'border-destructive',
  },
  accent: {
    text: 'text-primary',
    bg: 'bg-card',
    border: 'border-border',
    shadow: 'shadow-[inset_0_-3px_0_hsl(var(--primary))]',
    activeBg: 'bg-primary/5',
    activeBorder: 'border-primary',
  },
};

function getToneClasses(tone: string) {
  return TONE_CLASSES[tone] ?? TONE_CLASSES['accent'];
}

export default function QueueBucketTabs({ buckets, active, counts, onChange }: QueueBucketTabsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {buckets.map(b => {
        const isActive = active === b.id;
        const tc = getToneClasses(b.tone);
        return (
          <button
            key={b.id}
            onClick={() => onChange(b.id)}
            className={[
              'p-3 text-left cursor-pointer rounded-md border flex flex-col gap-1 transition-[background,border-color,box-shadow] duration-100',
              isActive
                ? `${tc.activeBg} ${tc.activeBorder} ${tc.shadow}`
                : `bg-card border-border`,
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${tc.text}`}>
                {b.label}
              </span>
              <span className={`size-1.5 rounded-full bg-current ${tc.text}`} aria-hidden />
            </div>
            <span className={`font-mono tabular-nums text-[26px] font-semibold leading-none ${isActive ? tc.text : 'text-foreground'} transition-colors duration-150`}>
              {counts[b.id] ?? 0}
            </span>
            <span className="text-[10px] text-muted-foreground">{b.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
