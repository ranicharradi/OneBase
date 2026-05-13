// ── Unified Record Detail — terminal aesthetic ──

import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { UnifiedRecordDetail as DetailType } from '../api/types';
import RecordFieldRow from '../components/RecordFieldRow';
import { useRecordType } from '../hooks/useRecordTypes';
import Panel, { PanelHead } from '../components/ui/Panel';
import Kpi from '../components/ui/Kpi';
import Pill from '../components/ui/Pill';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';


const ACTION_TONES: Record<string, 'ok' | 'danger' | 'neutral' | 'accent' | 'warn'> = {
  merge_confirmed: 'ok',
  match_rejected: 'danger',
  singleton_promoted: 'accent',
};

const ACTION_LABELS: Record<string, string> = {
  merge_confirmed: 'merge.confirm',
  match_rejected: 'match.reject',
  singleton_promoted: 'singleton.promote',
};



export default function UnifiedRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: record, isLoading, error } = useQuery<DetailType>({
    queryKey: ['unified-detail', id],
    queryFn: () => api.get(`/api/unified/records/${id}`),
    enabled: !!id,
  });
  const { data: recordType } = useRecordType(record?.type);

  if (isLoading) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20, fontSize: 12, color: 'var(--fg-2)' }}>Loading record…</div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20 }}>
          <Panel>
            <div style={{ padding: 28, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--danger)' }}>
                error
              </span>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                {error instanceof Error ? error.message : 'Unified record not found'}
              </div>
              <button onClick={() => navigate('/unified')} className="btn btn-sm" style={{ marginTop: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
                Back to unified
              </button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const isSingleton = record.match_candidate_id === null;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20 }}>
        <button
          onClick={() => navigate('/unified')}
          className="btn btn-sm btn-ghost"
          style={{ marginBottom: 8 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_back</span>
          Unified records
        </button>

        <div className="fade" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <IdChip style={{ fontSize: 13, padding: '3px 8px' }}>№ {record.id}</IdChip>
            <h1
              className="serif"
              style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}
            >
              {record.name}
            </h1>
            <Pill tone={isSingleton ? 'warn' : 'accent'} dot>
              {isSingleton ? 'singleton' : 'merged'}
            </Pill>
            <Pill tone="neutral">{record.type}</Pill>
            {record.match_candidate_id !== null && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => navigate(`/review/${record.match_candidate_id}`)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>history</span>
                Re-open review
              </button>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 6,
              fontSize: 12,
              color: 'var(--fg-2)',
              flexWrap: 'wrap',
            }}
          >
            <span>{record.source_record_ids.length} source records</span>
            <span>
              created by <b style={{ color: 'var(--fg-0)' }}>{record.created_by}</b>
              {record.created_at && ` · ${new Date(record.created_at).toLocaleString()}`}
            </span>
          </div>
        </div>

        {record.dq_score !== undefined && record.dq_score !== null && (
          <Panel className="fade" style={{ marginBottom: 14 }}>
            <PanelHead title="Data Quality" />
            <div style={{ display: 'flex', gap: 12, padding: 12 }}>
              <Kpi label="Score" value={`${Math.round((record.dq_score ?? 0) * 100)}%`} />
              <Kpi label="Completeness" value={`${Math.round((record.dq_completeness ?? 0) * 100)}%`} />
              <Kpi label="Validity" value={`${Math.round((record.dq_validity ?? 0) * 100)}%`} />
            </div>
          </Panel>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}>
          {/* Field provenance */}
          <Panel className="fade">
            <PanelHead title="Field provenance" />
            {recordType?.fields.map(field => (
                <RecordFieldRow
                  key={field.key}
                  field={field}
                  fields={record.fields}
                  provenance={record.provenance[field.key]}
                />
              ))}
          </Panel>

          {/* Sides: contributing records + merge history */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Panel className="fade">
              <PanelHead title="Contributing records" />
              <div style={{ padding: '0 14px' }}>
                {record.source_records.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--fg-2)', textAlign: 'center' }}>
                    No source records linked
                  </div>
                ) : (
                  record.source_records.map((sr, i) => (
                    <div
                      key={sr.id}
                      style={{
                        padding: '10px 0',
                        borderBottom:
                          i < record.source_records.length - 1 ? '1px solid var(--border-0)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {sr.data_source_name && <SourcePill short={sr.data_source_name} />}
                        <span style={{ fontSize: 12, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sr.name || 'Unnamed'}
                        </span>
                        <span style={{ flex: 1 }} />
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>rec #{sr.id}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="fade">
              <PanelHead title="Audit trail" />
              <div style={{ padding: '10px 14px' }}>
                {record.merge_history.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 12, color: 'var(--fg-2)', textAlign: 'center' }}>
                    No audit entries
                  </div>
                ) : (
                  record.merge_history.map((entry, i) => {
                    const tone = ACTION_TONES[entry.action] ?? 'neutral';
                    const label = ACTION_LABELS[entry.action] ?? entry.action;
                    return (
                      <div
                        key={entry.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '90px 1fr',
                          gap: 10,
                          padding: '8px 0',
                          alignItems: 'baseline',
                          borderBottom:
                            i < record.merge_history.length - 1 ? '1px solid var(--border-0)' : 'none',
                          fontSize: 11,
                        }}
                      >
                        <span className="mono" style={{ color: 'var(--fg-2)' }}>
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              background: `var(--${tone}-soft)`,
                              color: `var(--${tone})`,
                              borderRadius: 3,
                              marginRight: 6,
                              fontWeight: 500,
                            }}
                          >
                            {label}
                          </span>
                          {entry.details?.reviewed_by != null && (
                            <span className="mono" style={{ color: 'var(--accent)' }}>
                              {String(entry.details.reviewed_by)}
                            </span>
                          )}
                          {entry.details?.conflict_count !== undefined && (
                            <span style={{ color: 'var(--fg-1)', marginLeft: 6 }}>
                              · {String(entry.details.conflict_count)} conflict
                              {entry.details.conflict_count === 1 ? '' : 's'} resolved
                            </span>
                          )}
                          {entry.details?.source != null && (
                            <span style={{ color: 'var(--fg-1)', marginLeft: 6 }}>
                              · source {String(entry.details.source)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
