import type { RecordTypeSummary } from '../api/types'

interface TypeFilterProps {
  value: string
  types: RecordTypeSummary[]
  onChange: (type: string) => void
}

export default function TypeFilter({ value, types, onChange }: TypeFilterProps) {
  return (
    <div className="seg" role="tablist" aria-label="Record type">
      {types.map(type => (
        <button
          key={type.key}
          type="button"
          className={value === type.key ? 'active' : ''}
          onClick={() => onChange(type.key)}
          role="tab"
          aria-selected={value === type.key}
        >
          {type.label}
        </button>
      ))}
    </div>
  )
}
