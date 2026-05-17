// frontend/src/utils/fileFormat.ts

// Mirror of backend/app/utils/file_format.py — keep in sync.
export const ALLOWED_UPLOAD_EXTENSIONS = ['.csv', '.xlsx'] as const;

export const ALLOWED_UPLOAD_ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot).toLowerCase();
}

export function isAllowedUpload(filename: string): boolean {
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}
