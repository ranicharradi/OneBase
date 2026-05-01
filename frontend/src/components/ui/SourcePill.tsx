import type { PillTone } from './Pill';

const KNOWN_TONES: Record<string, PillTone> = {
  SAP: 'info',
  ORA: 'accent',
  CPA: 'warn',
  ARB: 'neutral',
};

const FALLBACK_TONES: PillTone[] = ['info', 'accent', 'warn', 'neutral', 'ok'];

function toneFor(short: string): PillTone {
  const upper = short.toUpperCase();
  if (KNOWN_TONES[upper]) return KNOWN_TONES[upper];
  // Stable hash → tone so the same short always gets the same color
  let h = 0;
  for (let i = 0; i < upper.length; i++) h = (h * 31 + upper.charCodeAt(i)) | 0;
  return FALLBACK_TONES[Math.abs(h) % FALLBACK_TONES.length];
}

interface SourcePillProps {
  short: string;
  title?: string;
}

export default function SourcePill({ short, title }: SourcePillProps) {
  const code = short.toUpperCase();
  const tone = toneFor(code);
  return (
    <span className={`pill ${tone}`} style={{ padding: '1px 6px', fontSize: 10 }} title={title ?? short}>
      <span className="mono" style={{ fontWeight: 600 }}>{code}</span>
    </span>
  );
}
