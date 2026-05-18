import { Badge } from './ui/badge';
import { CheckCircle2 } from 'lucide-react';

interface UnifiedBadgeProps {
  unified: boolean;
  lastComparedAt: string | null;
}

export default function UnifiedBadge({ unified, lastComparedAt }: UnifiedBadgeProps) {
  if (!unified) return null;
  const title = lastComparedAt
    ? `last compared ${new Date(lastComparedAt).toLocaleString()}`
    : 'compared';
  return (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="size-3" title={title} />
      <span>unified</span>
    </Badge>
  );
}
