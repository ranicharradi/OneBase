const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/;

export function stripUuidPrefix(stored: string): string {
  const m = stored.match(UUID_PREFIX);
  return m ? m[1] : stored;
}

export function trunc(s: string, n = 20): string {
  if (s.length <= n) return s;
  const h = Math.floor((n - 1) / 2);
  const t = Math.ceil((n - 1) / 2);
  return `${s.slice(0, h)}…${s.slice(s.length - t)}`;
}

export function displayFilename(stored: string, maxLen = 20): string {
  return trunc(stripUuidPrefix(stored), maxLen);
}

export function datasourceFileLabel(args: { data_source_name: string; file_extension?: string }): string {
  const ext = (args.file_extension ?? '').trim();
  if (!ext) return args.data_source_name;
  return ext.startsWith('.') ? `${args.data_source_name}${ext}` : `${args.data_source_name}.${ext}`;
}
