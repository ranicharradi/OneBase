import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import ColumnMapper from '../ColumnMapper'

describe('ColumnMapper record type mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/record-types/supplier')) {
        return new Response(JSON.stringify({
          key: 'supplier',
          label: 'Supplier',
          fields: [
            { key: 'supplier_name', label: 'Supplier Name', role: 'name', required: true },
            { key: 'tax_id', label: 'Tax ID', role: 'code', required: false },
          ],
          signals: [],
        }), { headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('not found', { status: 404 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('submits mapped columns with the requested record type', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ColumnMapper
        columns={['Vendor Name', 'Tax Number']}
        type="supplier"
        initialSourceName="SAP Vendors"
        detectedDelimiter=";"
        onSubmit={onSubmit}
      />,
    )

    await screen.findByText('Supplier Name')

    // Open the Supplier Name column-mapping Select and pick 'Vendor Name'
    await user.click(screen.getByRole('combobox', { name: /map supplier name/i }))
    await user.click(await screen.findByRole('option', { name: 'Vendor Name' }))

    // Open the identity field Select and pick 'supplier_name'
    await user.click(screen.getByRole('combobox', { name: /identity column/i }))
    await user.click(await screen.findByRole('option', { name: 'supplier_name' }))

    await user.click(screen.getByRole('button', { name: /create & upload/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'SAP Vendors',
        type: 'supplier',
        description: undefined,
        delimiter: ';',
        column_mapping: { supplier_name: 'Vendor Name' },
        identity_field_key: 'supplier_name',
      })
    })
  })
})
