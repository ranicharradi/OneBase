export function confidenceTone(conf: number): 'ok' | 'warn' | 'danger' {
  return conf >= 0.85 ? 'ok' : conf >= 0.70 ? 'warn' : 'danger';
}

export function dqTone(score: number | null | undefined): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (score == null) return 'neutral';
  return score >= 0.80 ? 'ok' : score >= 0.50 ? 'warn' : 'danger';
}
