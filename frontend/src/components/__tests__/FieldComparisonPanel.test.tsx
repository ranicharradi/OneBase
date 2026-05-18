import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/test-utils'
import FieldComparisonPanel from '../FieldComparisonPanel'
import type { FieldComparison, RecordDetail } from '../../api/types'

const recordA: RecordDetail = {
  id: 10,
  type: 'supplier',
  name: 'Acme',
  normalized_name: 'acme',
  fields: {},
  data_source_id: 1,
  data_source_name: 'SAP',
  raw_data: null,
}

const recordB: RecordDetail = {
  id: 20,
  type: 'supplier',
  name: 'Acme Ltd',
  normalized_name: 'acme ltd',
  fields: {},
  data_source_id: 2,
  data_source_name: 'ERP',
  raw_data: null,
}

const comparisons: FieldComparison[] = [
  {
    field: 'supplier_name',
    label: 'Supplier Name',
    value_a: 'Acme',
    value_b: 'Acme Ltd',
    is_conflict: true,
    is_identical: false,
    is_a_only: false,
    is_b_only: false,
  },
]

describe('FieldComparisonPanel', () => {
  it('shows a resolved badge after a conflict selection is made', () => {
    render(
      <FieldComparisonPanel
        comparisons={comparisons}
        recordA={recordA}
        recordB={recordB}
        layout="sideBySide"
        onLayoutChange={vi.fn()}
        conflictCount={1}
        resolvedCount={1}
        selections={{ supplier_name: 10 }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('resolved')).toBeInTheDocument()
    expect(screen.getAllByText('conflict')).toHaveLength(1)
  })
})
