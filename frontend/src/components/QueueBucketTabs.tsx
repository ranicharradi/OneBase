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

export default function QueueBucketTabs({ buckets, active, counts, onChange }: QueueBucketTabsProps) {
  return (
    <div className="fade" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
      {buckets.map(b => {
        const isActive = active === b.id;
        return (
          <button
            key={b.id}
            onClick={() => onChange(b.id)}
            style={{
              padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
              background: isActive ? `var(--${b.tone}-soft)` : 'var(--bg-1)',
              border: `1px solid ${isActive ? `var(--${b.tone})` : 'var(--border-0)'}`,
              borderRadius: 6, fontFamily: 'inherit', color: 'var(--fg-0)',
              display: 'flex', flexDirection: 'column', gap: 4,
              boxShadow: isActive ? `inset 0 -3px 0 var(--${b.tone})` : 'none',
              transition: 'background 0.1s, border-color 0.1s, box-shadow 0.1s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: `var(--${b.tone})`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {b.label}
              </span>
              <span className="pill-dot" style={{ background: `var(--${b.tone})` }} />
            </div>
            <span className="mono tnum" style={{
              fontSize: 26, fontWeight: 600, lineHeight: 1,
              color: isActive ? `var(--${b.tone})` : 'var(--fg-0)',
              transition: 'color 0.15s',
            }}>
              {counts[b.id] ?? 0}
            </span>
            <span style={{ fontSize: 10, color: 'var(--fg-2)' }}>{b.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
