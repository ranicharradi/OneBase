import type { FieldDef, FieldProvenance } from '../api/types'
import { fieldValue } from '../utils/recordDisplay'

interface RecordFieldRowProps {
  field: FieldDef
  fields: Record<string, unknown>
  provenance?: FieldProvenance
  compact?: boolean
}

export default function RecordFieldRow({ field, fields, provenance, compact = false }: RecordFieldRowProps) {
  const value = fieldValue(fields, field.key)

  return (
    <div
      className={[
        'grid gap-3 border-b border-border min-w-0',
        compact ? 'grid-cols-[130px_minmax(0,1fr)] py-1.5' : 'grid-cols-[180px_minmax(0,1fr)] py-2.5',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="text-xs text-foreground/80 font-medium">{field.label}</div>
        <div className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">{field.role}</div>
      </div>
      <div className="min-w-0">
        <div
          className={`font-mono text-xs overflow-wrap-anywhere ${value ? 'text-foreground' : 'text-muted-foreground/70'}`}
          style={{ overflowWrap: 'anywhere' }}
        >
          {value ?? '-'}
        </div>
        {provenance?.source_entity && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {provenance.source_entity}
          </div>
        )}
      </div>
    </div>
  )
}
