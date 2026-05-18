import type { MatchMode } from '../api/types';

export const MODE_LABEL: Record<MatchMode, string> = {
  FILE_VS_FILE:   'File × File',
  FILE_VS_GOLDEN: 'File × Golden',
};
