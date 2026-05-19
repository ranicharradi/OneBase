import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface KpiProps {
  label: string;
  value: ReactNode;
  delta?: { value: string; tone?: 'positive' | 'negative' | 'neutral' };
  icon?: ReactNode;
  className?: string;
}

export default function Kpi({ label, value, delta, icon, className }: KpiProps) {
  const deltaClass =
    delta?.tone === 'positive'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
      : delta?.tone === 'negative'
        ? 'bg-destructive/10 text-destructive'
        : '';
  return (
    <Card size="sm" className={cn('gap-2', className)}>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          {icon}
        </div>
        <span className="text-2xl font-medium tabular-nums">{value}</span>
        {delta && (
          <Badge variant={delta.tone === 'neutral' ? 'outline' : 'secondary'} className={deltaClass}>
            {delta.value}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
