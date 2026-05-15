import type { ReactNode } from 'react';

const TONE = {
  accent: { bg: 'var(--accent-soft)', border: '1px dashed var(--accent-border)', fg: 'var(--accent)' },
  ok:     { bg: 'var(--ok-soft)',     border: '1px dashed var(--ok)',            fg: 'var(--ok)'     },
} as const;

export default function HandoffBanner({
  icon,
  text,
  note,
  tone = 'accent',
}: {
  icon: string;
  text: ReactNode;
  note: string;
  tone?: keyof typeof TONE;
}) {
  const t = TONE[tone];
  return (
    <div className="fade" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', marginTop: 8, marginBottom: 20,
      background: t.bg, border: t.border,
      borderRadius: 6, fontSize: 12, color: 'var(--fg-1)',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color: t.fg }}>{icon}</span>
      <span><b>Handoff:</b> {text}</span>
      <span style={{ flex: 1 }} />
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>{note}</span>
    </div>
  );
}
