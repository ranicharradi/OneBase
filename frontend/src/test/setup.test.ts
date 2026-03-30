// Smoke test — verifies the Vitest + jsdom + jest-dom wiring works
import { describe, it, expect } from 'vitest'

describe('test infrastructure', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('has jsdom globals available', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })
})
