// ── Source overlap warning — shown when a new upload's rows heavily overlap existing sources ──

import { CopyIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { OverlapMatch } from '../api/types';

interface SourceOverlapDialogProps {
  /** Controlled open state */
  open: boolean;
  /** Called when the dialog requests a close (overlay click, Escape, Cancel button) */
  onOpenChange: (open: boolean) => void;
  matches: OverlapMatch[];
  onReuploadTo: (sourceId: number) => void;
  onCreateAnyway: () => void;
  onCancel?: () => void;
}

export default function SourceOverlapDialog({
  open,
  onOpenChange,
  matches,
  onReuploadTo,
  onCreateAnyway,
  onCancel,
}: SourceOverlapDialogProps) {
  function handleClose() {
    onOpenChange(false);
    onCancel?.();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CopyIcon className="size-4 text-amber-500" />
            This file looks like an existing source
          </DialogTitle>
          <DialogDescription>
            We found significant row overlap with sources you already have:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 pl-4 text-xs leading-relaxed list-disc marker:text-muted-foreground">
          {matches.map((match) => (
            <li key={match.source_id}>
              <span className="font-semibold">{match.source_name}</span>
              {' '}
              <span className="font-mono">{Math.round(match.overlap_ratio * 100)}%</span>
              {' '}
              of rows already exist there
              <Button
                size="sm"
                className="ml-2 h-6 px-2 text-xs"
                aria-label={`Re-upload to ${match.source_name}`}
                onClick={() => onReuploadTo(match.source_id)}
              >
                Re-upload here
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={onCreateAnyway}>
            Create new anyway
          </Button>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
