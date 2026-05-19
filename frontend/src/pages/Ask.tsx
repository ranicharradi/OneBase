import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AskRequest, AskResponse } from '../api/types';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import Spinner from '../components/ui/Spinner';

export default function Ask() {
  const [question, setQuestion] = useState('');
  const askMutation = useMutation<AskResponse, ApiError | Error, AskRequest>({
    mutationFn: (req) => api.post<AskResponse>('/api/ask', req),
  });

  return (
    <div className="p-3 flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Ask your data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which suppliers have a DQ score below 0.6?"
            maxLength={500}
            rows={3}
          />
          <Button
            type="button"
            onClick={() => askMutation.mutate({ question })}
            disabled={!question.trim() || askMutation.isPending}
          >
            {askMutation.isPending ? 'Running…' : 'Run'}
          </Button>
          {askMutation.isError && (
            <div className="text-destructive">{(askMutation.error as Error).message}</div>
          )}
        </CardContent>
      </Card>

      {askMutation.isPending && <Spinner />}

      {askMutation.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Generated SQL</CardTitle>
            </CardHeader>
            <CardContent>
              <details className="p-3">
                <summary>Show SQL</summary>
                <pre className="overflow-auto">{askMutation.data.sql}</pre>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Results ({askMutation.data.rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto p-3">
              <Table>
                <TableHeader>
                  <TableRow>{askMutation.data.columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {askMutation.data.rows.map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => <TableCell key={j}>{cell === null ? '—' : String(cell)}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
