/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactNode, type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { SearchProvider } from '../contexts/SearchContext'

// Create a fresh QueryClient per test to prevent cache leaks
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

// AuthProvider excluded — auth state varies per test, mock useAuth instead.
// ThemeProvider excluded — only Layout.tsx consumes it, page tests don't render Layout.
function AllProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createTestQueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SearchProvider>
          {children}
        </SearchProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllProviders, ...options })

// Re-export everything from testing-library
export * from '@testing-library/react'
export { customRender as render }
