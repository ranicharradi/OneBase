import Pill from './ui/Pill';

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
    <Pill tone="ok" dot>
      <span className="material-symbols-outlined" style={{ fontSize: 11 }} title={title}>
        verified
      </span>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>unified</span>
    </Pill>
  );
}
