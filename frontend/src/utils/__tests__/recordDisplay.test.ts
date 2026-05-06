import { describe, expect, it } from 'vitest'
import type { RecordType } from '../../api/types'
import { defaultType, fieldSummary, fieldValue, getNameField } from '../recordDisplay'

const supplierType: RecordType = {
  key: 'supplier',
  label: 'Supplier',
  fields: [
    { key: 'supplier_name', label: 'Supplier Name', role: 'name', required: true },
    { key: 'supplier_code', label: 'Supplier Code', role: 'code', required: true },
    { key: 'currency', label: 'Currency', role: 'enum', required: false },
  ],
  signals: [],
}

describe('recordDisplay helpers', () => {
  it('finds the name field from record type metadata', () => {
    expect(getNameField(supplierType)?.key).toBe('supplier_name')
  })

  it('formats primitive dynamic field values and hides empty values', () => {
    expect(fieldValue({ currency: 'USD' }, 'currency')).toBe('USD')
    expect(fieldValue({ active: true }, 'active')).toBe('true')
    expect(fieldValue({ rank: 7 }, 'rank')).toBe('7')
    expect(fieldValue({ currency: '' }, 'currency')).toBeNull()
    expect(fieldValue({}, 'currency')).toBeNull()
  })

  it('summarizes populated fields in requested order', () => {
    expect(fieldSummary({ supplier_code: 'A-1', currency: 'USD', status: 'active' }, [
      'supplier_code',
      'currency',
      'status',
    ])).toBe('A-1 · USD')
  })

  it('defaults to the first registered type and falls back to supplier', () => {
    expect(defaultType([{ key: 'material' }, { key: 'supplier' }])).toBe('material')
    expect(defaultType(undefined)).toBe('supplier')
  })
})
