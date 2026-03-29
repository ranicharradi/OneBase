// Shared signal display configuration used by ReviewDetail and ReviewQueue

export const SIGNAL_CONFIG: Record<string, { label: string; shortLabel: string; icon: string }> = {
  jaro_winkler:     { label: 'Jaro-Winkler',      shortLabel: 'JW',  icon: '⌨' },
  token_jaccard:    { label: 'Token Jaccard',      shortLabel: 'TJ',  icon: '∩' },
  embedding_cosine: { label: 'Embedding Cosine',   shortLabel: 'EC',  icon: '⟡' },
  short_name_match: { label: 'Short Name',         shortLabel: 'SN',  icon: '◈' },
  currency_match:   { label: 'Currency',           shortLabel: 'CUR', icon: '¤' },
  contact_match:    { label: 'Contact',            shortLabel: 'CON', icon: '◉' },
};
