interface StaleRunWarningProps {
  show: boolean;
}

export default function StaleRunWarning({ show }: StaleRunWarningProps) {
  if (!show) return null;
  return (
    <div style={{
      padding: '6px 14px', marginBottom: 8, fontSize: 11,
      color: 'var(--warn)', background: 'var(--warn-soft)',
      border: '1px solid var(--border-0)', borderRadius: 6,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
      Source data has changed since this run — results may be outdated
    </div>
  );
}
