import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: number;          // px
  className?: string;
}

export default function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <Loader2Icon
      className={cn('animate-spin text-muted-foreground', className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
