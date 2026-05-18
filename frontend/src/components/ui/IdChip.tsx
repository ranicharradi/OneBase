import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function IdChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-xs', className)}>
      {children}
    </Badge>
  );
}
