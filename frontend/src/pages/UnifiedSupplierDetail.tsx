// ── Unified Supplier Detail — terminal aesthetic ──

import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FieldProvenance, UnifiedSupplierDetail as DetailType } from '../api/types';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import IdChip from '../components/ui/IdChip';
import SourcePill from '../components/ui/SourcePill';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  source_code: 'Code',
  short_name: 'Short name',
  currency: 'Currency',
  payment_terms: 'Payment terms',
  contact_name: 'Contact name',
  supplier_type: 'Type',
};

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

function ProvenanceTag({ prov }: { prov: FieldProvenance }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      {prov.auto ? (
        <Pill icon="auto_awesome">auto</Pill>
      ) : (
        <Pill tone="accent">{prov.source_entity || 'manual'}</Pill>
      )}
      {prov.chosen_by && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
          {prov.chosen_by}
          {prov.chosen_at && ` · ${new Date(prov.chosen_at).toLocaleDateString()}`}
        </span>
      )}
    </div>
  );
}

export default function UnifiedSupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: supplier, isLoading, error } = useQuery<DetailType>({
    queryKey: ['unified-detail', id],
    queryFn: () => api.get(`/api/unified/suppliers/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="scroll" style={{ height: '100%' }}>
        <div style={{ padding: 20, fontSize: 12, color: 'var(--fg-2)' }}>Loading record…</div>
      </div>
    );
  }

  if (error || !supplier) {
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

  const isSingleton = supplier.match_candidate_id === null;

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
            <IdChip style={{ fontSize: 13, padding: '3px 8px' }}>№ {supplier.id}</IdChip>
            <h1
              className="serif"
              style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}
            >
              {supplier.name}
            </h1>
            <Pill tone={isSingleton ? 'warn' : 'accent'} dot>
              {isSingleton ? 'singleton' : 'merged'}
            </Pill>
            {supplier.match_candidate_id !== null && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => navigate(`/review/${supplier.match_candidate_id}`)}
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
            {supplier.source_code && <span className="mono">{supplier.source_code}</span>}
            {supplier.supplier_type && <span>{supplier.supplier_type}</span>}
            {supplier.currency && <span className="mono">{supplier.currency}</span>}
            <span>{supplier.source_supplier_ids.length} source records</span>
            <span>
              created by <b style={{ color: 'var(--fg-0)' }}>{supplier.created_by}</b>
              {supplier.created_at && ` · ${new Date(supplier.created_at).toLocaleString()}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }}>
          {/* Field provenance */}
          <Panel className="fade">
            <PanelHead title="Field provenance" />
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Field</th>
                  <th>Value</th>
                  <th style={{ width: 220 }}>Origin</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(FIELD_LABELS).map(([field, label]) => {
                  const value = (supplier as unknown as Record<string, unknown>)[field] as string | null;
                  const prov = supplier.provenance[field];
                  return (
                    <tr key={field}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{label}</div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>{field}</div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {value || <span style={{ color: 'var(--fg-3)' }}>∅</span>}
                      </td>
                      <td>{prov ? <ProvenanceTag prov={prov} /> : <span style={{ color: 'var(--fg-3)' }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          {/* Sides: contributing records + merge history */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Panel className="fade">
              <PanelHead title="Contributing records" />
              <div style={{ padding: '0 14px' }}>
                {supplier.source_records.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--fg-2)', textAlign: 'center' }}>
                    No source records linked
                  </div>
                ) : (
                  supplier.source_records.map((sr, i) => (
                    <div
                      key={sr.id}
                      style={{
                        padding: '10px 0',
                        borderBottom:
                          i < supplier.source_records.length - 1 ? '1px solid var(--border-0)' : 'none',
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
                      {sr.source_code && (
                        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 4 }}>
                          {sr.source_code}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="fade">
              <PanelHead title="Audit trail" />
              <div style={{ padding: '10px 14px' }}>
                {supplier.merge_history.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 12, color: 'var(--fg-2)', textAlign: 'center' }}>
                    No audit entries
                  </div>
                ) : (
                  supplier.merge_history.map((entry, i) => {
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
                            i < supplier.merge_history.length - 1 ? '1px solid var(--border-0)' : 'none',
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
