// ── Re-upload preview — shows diff counts before committing ──

import { useMemo } from 'react';
import { AlertTriangleIcon, CloudUploadIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ReUploadDialogProps {
  /** Controlled open state */
  open: boolean;
  /** Called when the dialog requests a close (overlay click, Escape, Cancel button) */
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  preview: { inserted: number; updated: number; retired: number; unchanged: number };
  forceReplace: boolean;
  onForceReplaceChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function ReUploadDialog({
  open,
  onOpenChange,
  sourceName,
  preview,
  forceReplace,
  onForceReplaceChange,
  onConfirm,
  onCancel,
}: ReUploadDialogProps) {
  const total = preview.inserted + preview.updated + preview.retired + preview.unchanged;
  const carryOverRatio = useMemo(
    () => (total > 0 ? (preview.updated + preview.unchanged) / total : 0),
    [total, preview.updated, preview.unchanged],
  );
  const lowOverlap = total >= 20 && carryOverRatio < 0.2;

  function handleClose() {
    onOpenChange(false);
    onCancel?.();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudUploadIcon className="size-4 text-muted-foreground" />
            Re-upload preview
          </DialogTitle>
          <DialogDescription>
            Re-uploading to <strong>{sourceName}</strong>. This is what will happen:
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {lowOverlap && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Only {Math.round(carryOverRatio * 100)}% of these rows exist in{' '}
                <strong>{sourceName}</strong>. Are you sure this is a re-upload, not a new source?
              </span>
            </div>
          )}

          <ul className="space-y-1 pl-4 text-xs leading-relaxed text-foreground marker:text-muted-foreground list-disc">
            <li><strong>{preview.inserted}</strong> new rows will be added</li>
            <li><strong>{preview.updated}</strong> rows will be updated in place</li>
            <li><strong>{preview.retired}</strong> rows missing from the new file will be retired</li>
            <li className="text-muted-foreground">{preview.unchanged} rows unchanged</li>
          </ul>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary"
              checked={forceReplace}
              onChange={(e) => onForceReplaceChange(e.target.checked)}
            />
            Force full replace — discard the prior snapshot entirely (loses match decisions)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            <CloudUploadIcon className="size-3.5" />
            Continue upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
