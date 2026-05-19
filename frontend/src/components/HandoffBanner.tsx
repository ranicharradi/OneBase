import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface HandoffBannerProps {
  icon: LucideIcon;
  text: ReactNode;
  note: string;
}

export default function HandoffBanner({ icon: Icon, text, note }: HandoffBannerProps) {
  return (
    <div className="mt-2 mb-5 flex items-center gap-2.5 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3.5 py-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 text-foreground" aria-hidden="true" />
      <span>
        <strong className="font-semibold text-foreground">Handoff:</strong> {text}
      </span>
      <span className="flex-1" />
      <span className="font-mono text-[10px] text-muted-foreground">{note}</span>
    </div>
  );
}
