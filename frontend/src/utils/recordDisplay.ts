import type { FieldDef, RecordType } from '../api/types'

export function getNameField(recordType: RecordType | undefined): FieldDef | undefined {
  return recordType?.fields.find(field => field.role === 'name')
}

export function fieldValue(fields: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = fields?.[key]
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function fieldSummary(fields: Record<string, unknown> | null | undefined, keys: string[], limit = 2): string {
  return keys
    .map(key => fieldValue(fields, key))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit)
    .join(' · ')
}

export function defaultType(types: { key: string }[] | undefined): string {
  return types?.[0]?.key ?? 'supplier'
}
