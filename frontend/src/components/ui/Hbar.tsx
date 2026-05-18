// frontend/src/components/ui/Hbar.tsx
import { cn } from '@/lib/utils';

interface HbarProps {
  value: number;          // 0–100
  className?: string;
  fillClassName?: string;
}

export default function Hbar({ value, className, fillClassName }: HbarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-all', fillClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
