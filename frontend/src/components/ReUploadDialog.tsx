// ── Re-upload confirmation dialog — dark industrial theme ──

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-surface-900 shadow-2xl shadow-black/40 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
        {/* Header with warning accent */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-warning-500/60 to-transparent" />

          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-warning-500/10 border border-warning-500/20 shrink-0">
              <svg className="w-5 h-5 text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Re-upload Confirmation</h3>
              <p className="text-xs text-surface-500 mt-0.5">This action will supersede existing data</p>
            </div>
          </div>
        </div>

        {/* Impact details */}
        <div className="px-6 pb-5">
          <div className="rounded-xl border border-white/[0.04] bg-surface-800/30 p-4 space-y-3">
            <p className="text-sm text-gray-300 leading-relaxed">
              <span className="font-semibold text-white">{sourceName}</span> already has{' '}
              <span className="font-semibold text-warning-400 tabular-nums">{existingCount.toLocaleString()}</span>{' '}
              staged suppliers from previous uploads.
            </p>

            {pendingMatchCount > 0 ? (
              <p className="text-sm text-gray-300 leading-relaxed">
                Uploading will supersede those records and invalidate{' '}
                <span className="font-semibold text-warning-400 tabular-nums">{pendingMatchCount.toLocaleString()}</span>{' '}
                pending match candidates.
              </p>
            ) : (
              <p className="text-sm text-surface-500 leading-relaxed">
                New upload will supersede existing staged records. Continue?
              </p>
            )}
          </div>

          {/* Warning callout */}
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-warning-500/[0.05] border border-warning-500/10 px-3.5 py-2.5">
            <svg className="w-4 h-4 text-warning-500/70 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-warning-400/80 leading-relaxed">
              This action cannot be undone. Previously staged records will be marked as superseded.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4 bg-surface-800/20">
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/[0.08] bg-surface-800/50 px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:bg-surface-700 hover:border-white/[0.12]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-warning-500 px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-warning-400 active:scale-[0.98] shadow-lg shadow-warning-500/15"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Continue Upload
          </button>
        </div>
      </div>
    </div>
  );
}
