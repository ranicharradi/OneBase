import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RecordFieldRow from '../RecordFieldRow'

describe('RecordFieldRow', () => {
  it('renders field label and value from dynamic fields', () => {
    render(
      <RecordFieldRow
        field={{ key: 'supplier_name', label: 'Supplier Name', role: 'name', required: true }}
        fields={{ supplier_name: 'Acme Corp' }}
      />,
    )

    expect(screen.getByText('Supplier Name')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders missing values as a dash', () => {
    render(
      <RecordFieldRow
        field={{ key: 'currency', label: 'Currency', role: 'enum', required: false }}
        fields={{}}
      />,
    )

    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('renders provenance source when available', () => {
    render(
      <RecordFieldRow
        field={{ key: 'currency', label: 'Currency', role: 'enum', required: true }}
        fields={{ currency: 'USD' }}
        provenance={{
          value: 'USD',
          source_entity: 'SAP',
          source_record_id: 1,
          auto: true,
          chosen_by: null,
          chosen_at: null,
        }}
      />,
    )

    expect(screen.getByText('SAP')).toBeInTheDocument()
  })
})
