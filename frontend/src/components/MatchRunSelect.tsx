import type { MatchRunResponse } from '../api/types';
import { relativeTime } from '../utils/time';
import { MODE_LABEL } from '../utils/matchRuns';

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
          #{r.id} · {r.sources && r.sources.length > 0
            ? r.sources.map(s => s.name).join(' × ')
            : (MODE_LABEL[r.mode] ?? r.mode)} · {relativeTime(r.created_at)}
        </option>
      ))}
    </select>
  );
}
