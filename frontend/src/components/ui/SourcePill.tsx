// frontend/src/components/ui/SourcePill.tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SourcePillProps {
  short: string;          // 2-4 char abbreviation
  title?: string;         // full name (tooltip)
  className?: string;
}

const TONES = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
];

// Stable colors for shorts users see most often; hash for everything else.
const KNOWN_TONES: Record<string, string> = {
  SAP: TONES[1],
  ORA: TONES[3],
  CPA: TONES[2],
  ARB: TONES[0],
};

function toneFor(s: string): string {
  const upper = s.toUpperCase();
  if (KNOWN_TONES[upper]) return KNOWN_TONES[upper];
  let h = 0;
  for (let i = 0; i < upper.length; i++) h = ((h << 5) - h + upper.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export default function SourcePill({ short, title, className }: SourcePillProps) {
  const code = short.toUpperCase();
  return (
    <Badge
      variant="secondary"
      className={cn('font-mono tracking-tight', toneFor(code), className)}
      title={title ?? short}
    >
      {code}
    </Badge>
  );
}
