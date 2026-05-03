// ── File checker — standalone quality report shell ──

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FileCheckReportListResponse } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Spinner from '../components/ui/Spinner';

export default function FileChecker() {
  const { data: reports, isError, isLoading } = useQuery({
    queryKey: ['file-checks'],
    queryFn: () => api.get<FileCheckReportListResponse>('/api/file-checks'),
  });

  const reportCount = reports?.total ?? reports?.items.length ?? 0;

  return (
    <div className="scroll" style={{ height: '100%', padding: 18 }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650 }}>File checker</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--fg-2)', fontSize: 13 }}>
            Check CSV/TSV files for missing rows and quality issues outside the ingestion pipeline.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <section
            aria-disabled="true"
            aria-label="File upload controls are being prepared"
            style={{
              minHeight: 220,
              border: '1px dashed var(--border-1)',
              borderRadius: 6,
              background: 'var(--bg-0)',
              color: 'var(--fg-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              opacity: 0.72,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: 28, color: 'var(--fg-2)', marginBottom: 10 }}
              >
                rule
              </span>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Drop CSV or TSV file here</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Upload controls are being prepared
              </div>
            </div>
          </section>

          <Panel>
            <PanelHead title="Report history" />
            <div style={{ padding: 14, minHeight: 160, display: 'flex', alignItems: 'center' }}>
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-2)', fontSize: 12 }}>
                  <Spinner size={14} />
                  <span>Loading reports</span>
                </div>
              ) : isError ? (
                <div>
                  <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
                    Could not load file check history
                  </div>
                  <div style={{ marginTop: 4, color: 'var(--fg-2)', fontSize: 12 }}>
                    Refresh the page or try again later.
                  </div>
                </div>
              ) : reportCount > 0 ? (
                <div>
                  <div className="mono" style={{ fontSize: 28, fontWeight: 700 }}>
                    {reportCount}
                  </div>
                  <div style={{ marginTop: 4, color: 'var(--fg-2)', fontSize: 12 }}>
                    {reportCount === 1 ? 'report' : 'reports'} checked
                  </div>
                </div>
              ) : (
                <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>No file checks yet</span>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
