import Hbar from './Hbar';
import { cn } from '@/lib/utils';

interface ConfMiniProps {
  value: number;       // 0–1 (fraction) or 0–100 (percent — autodetect)
  className?: string;
}

function tone(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-amber-500';
  return 'bg-destructive';
}

export default function ConfMini({ value, className }: ConfMiniProps) {
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return (
    <div className={cn('flex items-center gap-2 w-24', className)}>
      <Hbar value={pct} fillClassName={tone(pct)} className="flex-1" />
      <span className="text-xs font-mono tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}
