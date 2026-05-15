export type Layout = 'sideBySide' | 'stacked' | 'diff';

export const LAYOUT_KEY = 'onebase_review_layout';

export function getInitialLayout(): Layout {
  const stored = localStorage.getItem(LAYOUT_KEY);
  if (stored === 'sideBySide' || stored === 'stacked' || stored === 'diff') return stored;
  return 'sideBySide';
}
