import { api } from '../api/client';

export interface HeaderParseResult {
  columns: string[];
  delimiter: string | null;
  format: 'csv' | 'xlsx';
}

export async function parseFileHeaders(file: File): Promise<HeaderParseResult> {
  const formData = new FormData();
  formData.append('file', file);
  return api.upload<HeaderParseResult>('/api/sources/detect-headers', formData);
}
