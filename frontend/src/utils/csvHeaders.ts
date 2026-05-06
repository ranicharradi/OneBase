export interface HeaderParseResult {
  columns: string[];
  delimiter: string;
}

const DELIMITERS = [',', ';', '\t', '|'] as const;

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current.trim().replace(/^"|"$/g, ''));
  return out.filter(Boolean);
}

export async function parseCsvHeaders(file: File): Promise<HeaderParseResult> {
  const text = await file.slice(0, 64 * 1024).text();
  const firstLine = text.split(/\r?\n/).find(line => line.trim().length > 0);
  if (!firstLine) return { columns: [], delimiter: ',' };

  const delimiter = DELIMITERS
    .map(candidate => ({ candidate, count: splitLine(firstLine, candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate;

  return { columns: splitLine(firstLine, delimiter), delimiter };
}
