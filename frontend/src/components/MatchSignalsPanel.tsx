import { SIGNAL_CONFIG } from '../utils/signals';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import Hbar from './ui/Hbar';

interface MatchSignalsPanelProps {
  signals: Record<string, number>;
  confidence: number;
  tone: 'ok' | 'warn' | 'danger';
}

const getToneColors = (tone: 'ok' | 'warn' | 'danger') => {
  switch (tone) {
    case 'ok':
      return { text: 'text-emerald-600', fill: 'bg-emerald-500' };
    case 'warn':
      return { text: 'text-amber-600', fill: 'bg-amber-500' };
    case 'danger':
      return { text: 'text-destructive', fill: 'bg-destructive' };
  }
};

export default function MatchSignalsPanel({ signals, confidence, tone }: MatchSignalsPanelProps) {
  const { text: toneText, fill: toneFill } = getToneColors(tone);

  return (
    <Card className="mb-3">
      <CardHeader>
        <CardTitle>Signals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${Object.keys(signals).length + 1}, 1fr)` }}>
          {Object.entries(signals).map(([k, v]) => {
            const meta = SIGNAL_CONFIG[k] ?? { label: k, shortLabel: k, icon: '·' };
            const pct = Math.round(v * 100);
            const t = pct >= 85 ? 'ok' : pct >= 60 ? 'warn' : 'danger';
            const { text: signalText, fill: signalFill } = getToneColors(t);

            return (
              <div key={k} className="border-r border-border px-3.5 py-2.5">
                <div className="text-foreground/80">{meta.label}</div>
                <div className={`font-mono tabular-nums text-lg font-semibold ${signalText} mt-1`}>
                  {v.toFixed(2)}
                </div>
                <div className="mt-1.5">
                  <Hbar value={pct} fillClassName={signalFill} />
                </div>
              </div>
            );
          })}
          <div className="bg-muted px-3.5 py-2.5">
            <div className="text-foreground/80">Overall</div>
            <div className={`font-mono tabular-nums text-xl font-semibold ${toneText} mt-1`}>
              {confidence.toFixed(3)}
            </div>
            <div className="mt-1.5">
              <Hbar value={Math.round(confidence * 100)} fillClassName={toneFill} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
