// ── Re-upload confirmation — terminal aesthetic ──

import Panel, { PanelHead } from './ui/Panel';

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
    <div className="backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <Panel
        className="fade"
        style={{
          width: '100%',
          maxWidth: 440,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <PanelHead>
            <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--warn)' }}>
                warning
              </span>
              Re-upload confirmation
            </span>
            <button onClick={onCancel} className="btn btn-ghost btn-sm" style={{ padding: 4 }} aria-label="Close">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </PanelHead>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--fg-0)' }}>
              <b>{sourceName}</b> already has{' '}
              <span className="mono tnum" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                {existingCount.toLocaleString()}
              </span>{' '}
              staged records from previous uploads.
            </p>

            {pendingMatchCount > 0 ? (
              <p style={{ fontSize: 12, margin: 0, color: 'var(--fg-1)' }}>
                Re-uploading supersedes those records and invalidates{' '}
                <span className="mono tnum" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                  {pendingMatchCount.toLocaleString()}
                </span>{' '}
                pending match candidates.
              </p>
            ) : (
              <p style={{ fontSize: 12, margin: 0, color: 'var(--fg-2)' }}>
                Re-uploading supersedes existing staged records for this source.
              </p>
            )}

            <div
              className="pill warn"
              style={{ padding: '6px 10px', width: '100%', justifyContent: 'flex-start' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>info</span>
              <span style={{ fontSize: 11 }}>
                Cannot be undone. Old records get marked as superseded.
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-0)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button onClick={onCancel} className="btn btn-sm">Cancel</button>
            <button onClick={onConfirm} className="btn btn-sm btn-accent">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>cloud_upload</span>
              Continue upload
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
