// ── Re-upload confirmation dialog ──
// Light Glassmorphism — light modal with warning treatment

interface ReUploadDialogProps {
  sourceName: string;
  existingCount: number;
  pendingMatchCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ReUploadDialog({
  sourceName,
  existingCount,
  pendingMatchCount,
  onConfirm,
  onCancel,
}: ReUploadDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl animate-scaleIn overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative p-6">
          {/* Warning icon */}
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-warning-500/10 border border-warning-500/15 mx-auto mb-4">
            <svg className="w-7 h-7 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h3 className="text-lg font-display font-extrabold text-on-surface text-center mb-2">Re-upload Confirmation</h3>
          <p className="text-xs text-on-surface-variant/60 text-center mb-5">This action will supersede existing data</p>

          {/* Impact details */}
          <div className="rounded-xl border border-on-surface/[0.06] bg-surface-100 p-4 space-y-3 mb-4">
            <p className="text-sm text-on-surface leading-relaxed">
              <span className="font-semibold text-on-surface">{sourceName}</span> already has{' '}
              <span className="font-display text-base text-warning-500 tabular-nums">{existingCount.toLocaleString()}</span>{' '}
              staged suppliers from previous uploads.
            </p>

            {pendingMatchCount > 0 ? (
              <p className="text-sm text-on-surface leading-relaxed">
                Uploading will supersede those records and invalidate{' '}
                <span className="font-display text-base text-warning-500 tabular-nums">{pendingMatchCount.toLocaleString()}</span>{' '}
                pending match candidates.
              </p>
            ) : (
              <p className="text-sm text-on-surface-variant/60 leading-relaxed">
                New upload will supersede existing staged records.
              </p>
            )}
          </div>

          {/* Warning callout */}
          <div className="flex items-start gap-2.5 rounded-xl bg-warning-500/[0.08] border border-warning-500/15 px-4 py-3 mb-6">
            <svg className="w-4 h-4 text-warning-500/70 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-warning-500/80 leading-relaxed">
              This action cannot be undone. Previously staged records will be marked as superseded.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-white/60 bg-white/40 px-4 py-2.5 text-sm font-medium text-on-surface-variant transition-all duration-200 hover:bg-white/60 hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-warning-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-warning-400 active:scale-[0.98] shadow-lg shadow-warning-500/15"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Continue Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
