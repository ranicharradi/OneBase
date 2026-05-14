import type { ComparisonMode } from '../api/types';

interface ShapePreviewProps {
  mode: ComparisonMode;
  fileLabels: string[];
  goldenCount?: number;
  candidateEstimate?: number | null;
  recordType: string;
}

function truncate(s: string, n = 22): string {
  if (s.length <= n) return s;
  const head = Math.floor((n - 1) / 2);
  const tail = Math.ceil((n - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

export default function ShapePreview({ mode, fileLabels, goldenCount, candidateEstimate, recordType }: ShapePreviewProps) {
  let body: string;
  if (mode === 'FILE_VS_FILE') {
    const a = truncate(fileLabels[0] ?? 'pick a file…');
    const b = truncate(fileLabels[1] ?? 'pick a second file…');
    body = `[${a}]  ─┐\n                       ├──►  ×  ─── ${candidateEstimate ? `≈ ${candidateEstimate.toLocaleString()} pairs` : '…'}\n[${b}]  ─┘`;
  } else if (mode === 'FILE_VS_GOLDEN') {
    const a = truncate(fileLabels[0] ?? 'pick a file…');
    body = `[${a}]  ──►  [golden · ${goldenCount ?? '?'} ${recordType}]  ${candidateEstimate ? `≈ ${candidateEstimate.toLocaleString()} pairs` : ''}`;
  } else {
    const labels = fileLabels.length === 0
      ? ['pick files…']
      : fileLabels.slice(0, 5).map(l => truncate(l));
    body = labels.map(l => `[${l}]  ─┐`).join('\n') + `\n${' '.repeat(24)}├──►  ⋈  ${candidateEstimate ? `≈ ${candidateEstimate.toLocaleString()} pairs` : ''}\n${' '.repeat(24)}┘`;
  }
  return (
    <pre
      className="mono shape-preview"
      style={{
        fontSize: 11,
        lineHeight: 1.4,
        color: 'var(--fg-1)',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-0)',
        borderRadius: 4,
        padding: '12px 16px',
        margin: 0,
        overflow: 'hidden',
      }}
    >
      {body}
      <div style={{ marginTop: 8, color: 'var(--fg-2)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {mode.replaceAll('_', ' ')} · {recordType}
      </div>
    </pre>
  );
}
