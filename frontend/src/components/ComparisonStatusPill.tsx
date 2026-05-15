import type { FieldComparison } from '../api/types';

export default function ComparisonStatusPill({ comp }: { comp: FieldComparison }) {
  if (comp.is_conflict) return <span className="pill warn" style={{ padding: '1px 6px', fontSize: 10 }}>conflict</span>;
  if (comp.is_identical) return <span className="pill ok" style={{ padding: '1px 6px', fontSize: 10 }}>identical</span>;
  if (comp.is_a_only || comp.is_b_only) return <span className="pill info" style={{ padding: '1px 6px', fontSize: 10 }}>source-only</span>;
  return null;
}
