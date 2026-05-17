import type { MatchRunResponse } from '../api/types';
import { displayFilename } from '../utils/filename';
import { relativeTime } from '../utils/time';
import { MODE_LABEL } from '../utils/comparisons';

interface MatchRunSelectProps {
  validRuns: MatchRunResponse[];
  runId: string | null;
  onChange: (runId: string | null) => void;
}

export default function MatchRunSelect({ validRuns, runId, onChange }: MatchRunSelectProps) {
  return (
    <select
      className="input"
      style={{ height: 26, fontSize: 11, padding: '0 8px', minWidth: 200 }}
      value={runId ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="" disabled>— pick a run —</option>
      {validRuns.map(r => (
        <option key={r.id} value={String(r.id)}>
          #{r.id} · {r.batches.length > 0 ? r.batches.map(b => displayFilename(b.filename)).join(' × ') : (MODE_LABEL[r.mode] ?? r.mode)} · {relativeTime(r.created_at)}
        </option>
      ))}
    </select>
  );
}
