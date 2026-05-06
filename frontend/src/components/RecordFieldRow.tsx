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
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '130px minmax(0, 1fr)' : '180px minmax(0, 1fr)',
        gap: 12,
        padding: compact ? '6px 0' : '9px 0',
        borderBottom: '1px solid var(--border-0)',
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 500 }}>{field.label}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>{field.role}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="mono"
          style={{
            fontSize: 12,
            color: value ? 'var(--fg-0)' : 'var(--fg-3)',
            overflowWrap: 'anywhere',
          }}
        >
          {value ?? '-'}
        </div>
        {provenance?.source_entity && (
          <div style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 3 }}>
            {provenance.source_entity}
          </div>
        )}
      </div>
    </div>
  )
}
