import { describe, expect, it } from 'vitest'
import { defaultType, fieldSummary, fieldValue } from '../recordDisplay'

describe('recordDisplay helpers', () => {
  it('formats primitive dynamic field values and hides empty values', () => {
    expect(fieldValue({ currency: 'USD' }, 'currency')).toBe('USD')
    expect(fieldValue({ active: true }, 'active')).toBe('true')
    expect(fieldValue({ rank: 7 }, 'rank')).toBe('7')
    expect(fieldValue({ currency: '' }, 'currency')).toBeNull()
    expect(fieldValue({}, 'currency')).toBeNull()
  })

  it('summarizes populated fields in requested order', () => {
    expect(fieldSummary({ short_name: 'A-1', currency: 'USD', status: 'active' }, [
      'short_name',
      'currency',
      'status',
    ])).toBe('A-1 · USD')
  })

  it('defaults to the first registered type and falls back to supplier', () => {
    expect(defaultType([{ key: 'material' }, { key: 'supplier' }])).toBe('material')
    expect(defaultType(undefined)).toBe('supplier')
  })
})
