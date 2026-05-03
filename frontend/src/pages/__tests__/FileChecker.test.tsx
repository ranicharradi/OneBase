import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import FileChecker from '../FileChecker'

describe('FileChecker page', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/api/file-checks')) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the standalone file checker shell', async () => {
    render(<FileChecker />)

    expect(screen.getByRole('heading', { name: 'File checker' })).toBeInTheDocument()
    expect(screen.getByText('Drop CSV or TSV file here')).toBeInTheDocument()
    expect(screen.queryByText(/source detected/i)).not.toBeInTheDocument()
  })
})
