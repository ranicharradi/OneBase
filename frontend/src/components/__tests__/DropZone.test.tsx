import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import DropZone from '../DropZone'

describe('DropZone file validation', () => {
  it('shows an error and does not select unsupported files', async () => {
    const onFileSelected = vi.fn()
    render(<DropZone onFileSelected={onFileSelected} />)

    fireEvent.drop(screen.getByRole('button', { name: /drop a csv or excel file/i }), {
      dataTransfer: {
        files: [new File(['name\tvalue\n'], 'vendors.tsv', { type: 'text/tab-separated-values' })],
      },
    })

    expect(onFileSelected).not.toHaveBeenCalled()
    expect(screen.getByText('Only CSV and Excel files are accepted.')).toBeInTheDocument()
  })
})
