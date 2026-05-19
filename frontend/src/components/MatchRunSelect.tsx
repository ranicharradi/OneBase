import type { MatchRunResponse } from '../api/types';
import { relativeTime } from '../utils/time';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MatchRunSelectProps {
  validRuns: MatchRunResponse[];
  runId: string | null;
  onChange: (runId: string | null) => void;
}

export default function MatchRunSelect({ validRuns, runId, onChange }: MatchRunSelectProps) {
  return (
    <Select
      value={runId ?? ''}
      onValueChange={(val) => onChange(val || null)}
    >
      <SelectTrigger size="sm" className="min-w-[200px] text-xs">
        <SelectValue placeholder="— pick a run —" />
      </SelectTrigger>
      <SelectContent>
        {validRuns.map(r => (
          <SelectItem key={r.id} value={String(r.id)}>
            #{r.id} · {r.name} · {relativeTime(r.created_at)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
