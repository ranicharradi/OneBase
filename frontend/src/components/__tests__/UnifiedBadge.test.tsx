import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UnifiedBadge from '../UnifiedBadge';

describe('UnifiedBadge', () => {
  it('renders when unified=true', () => {
    render(<UnifiedBadge unified={true} lastComparedAt="2026-04-22T10:00:00Z" />);
    expect(screen.getByText(/unified/i)).toBeInTheDocument();
  });

  it('renders nothing when unified=false', () => {
    const { container } = render(<UnifiedBadge unified={false} lastComparedAt={null} />);
    expect(container.firstChild).toBeNull();
  });
});
