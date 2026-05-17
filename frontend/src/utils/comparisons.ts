import type { MatchMode } from '../api/types';

export const MODE_LABEL: Record<MatchMode, string> = {
  FILE_VS_FILE:   'File × File',
  FILE_VS_GOLDEN: 'File × Golden',
  MULTI_FILE:     'N-Way',
};

export const MODE_GLYPH: Record<MatchMode, string> = {
  FILE_VS_FILE:   '⊕',
  FILE_VS_GOLDEN: '⊞',
  MULTI_FILE:     '⋈',
};
