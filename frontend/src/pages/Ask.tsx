import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AskRequest, AskResponse } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Spinner from '../components/ui/Spinner';

export default function Ask() {
  const [question, setQuestion] = useState('');
  const askMutation = useMutation<AskResponse, ApiError | Error, AskRequest>({
    mutationFn: (req) => api.post<AskResponse>('/api/ask', req),
  });

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Panel>
        <PanelHead title="Ask your data" />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which suppliers have a DQ score below 0.6?"
            maxLength={500}
            rows={3}
            style={{ width: '100%' }}
          />
          <button
            type="button"
            onClick={() => askMutation.mutate({ question })}
            disabled={!question.trim() || askMutation.isPending}
          >
            {askMutation.isPending ? 'Running…' : 'Run'}
          </button>
          {askMutation.isError && (
            <div style={{ color: 'var(--err)' }}>{(askMutation.error as Error).message}</div>
          )}
        </div>
      </Panel>

      {askMutation.isPending && <Spinner />}

      {askMutation.data && (
        <>
          <Panel>
            <PanelHead title="Generated SQL" />
            <details style={{ padding: 12 }}>
              <summary>Show SQL</summary>
              <pre style={{ overflow: 'auto' }}>{askMutation.data.sql}</pre>
            </details>
          </Panel>

          <Panel>
            <PanelHead title={`Results (${askMutation.data.rows.length})`} />
            <div style={{ overflow: 'auto', padding: 12 }}>
              <table className="table">
                <thead>
                  <tr>{askMutation.data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {askMutation.data.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j}>{cell === null ? '—' : String(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
