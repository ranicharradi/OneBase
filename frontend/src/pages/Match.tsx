import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useMatchRunStatus } from "../hooks/useMatchRun";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import type {
  BatchResponse,
  MatchMode,
  MatchRunCreate,
  MatchRunDispatchResponse,
  MatchRunResponse,
  MatchRunStatus,
} from "../api/types";
import Panel, { PanelHead } from "../components/ui/Panel";
import Spinner from "../components/ui/Spinner";
import Pill from "../components/ui/Pill";
import Hbar from "../components/ui/Hbar";
import type { PillTone } from "../components/ui/Pill";
import { stripUuidPrefix, displayFilename } from "../utils/filename";
import { MODE_LABEL } from "../utils/comparisons";
import { relativeTime } from "../utils/time";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";

// ── Constants ─────────────────────────────────────────

const BATCH_TONE: Record<string, PillTone> = {
  done: "ok",
  completed: "ok",
  pending: "neutral",
  running: "info",
  failed: "danger",
  error: "danger",
  superseded: "warn",
};

const COMP_STAGES = [
  { key: "BLOCKING", label: "Blocking" },
  { key: "SCORING", label: "Scoring" },
  { key: "CLUSTERING", label: "Clustering" },
  { key: "INSERTING", label: "Writing" },
];

// ── Active run pipeline card ───────────────────────────

function MatchingPipeline({ status }: { status?: MatchRunStatus }) {
  const N = COMP_STAGES.length;
  const isComplete =
    status?.state === "COMPLETE" || status?.state === "SUCCESS";
  const isFailed = status?.state === "FAILURE";
  const activeIdx = status?.stage
    ? COMP_STAGES.findIndex((s) => s.key === status.stage)
    : -1;
  const queued = !status || (status.state === "PENDING" && !status.stage);
  const pct = isComplete ? 100 : (status?.progress ?? 0);

  const sidePct = (1 / (2 * N)) * 100;
  const progressPct = isComplete
    ? 100 - 2 * sidePct
    : (Math.max(0, activeIdx) / Math.max(1, N - 1)) * (100 - 2 * sidePct);

  return (
    <div
      style={{
        padding: "12px 16px 14px",
        borderTop: "1px solid var(--border-0)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <Hbar
          value={pct}
          tone={isComplete ? "ok" : isFailed ? "danger" : "accent"}
          style={{ height: 3, flex: 1 }}
        />
        <span
          className="mono tnum"
          style={{
            fontSize: 11,
            fontWeight: 600,
            width: 36,
            textAlign: "right",
            color: isComplete
              ? "var(--ok)"
              : isFailed
                ? "var(--danger)"
                : "var(--accent)",
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 10,
            left: `${sidePct}%`,
            right: `${sidePct}%`,
            height: 1.5,
            background: "var(--border-0)",
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            left: `${sidePct}%`,
            width: `${progressPct}%`,
            height: 1.5,
            background: isFailed ? "var(--danger)" : "var(--accent)",
            transition: "width 0.5s ease",
            zIndex: 1,
          }}
        />

        <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
          {COMP_STAGES.map((stage, i) => {
            const done = isComplete || (activeIdx >= 0 && i < activeIdx);
            const active = !isComplete && !isFailed && i === activeIdx;
            const failed = isFailed && i === activeIdx;

            const bg = done
              ? "var(--accent)"
              : active
                ? "var(--accent-soft)"
                : failed
                  ? "var(--danger-soft)"
                  : "var(--bg-3)";
            const border = done
              ? "var(--accent)"
              : active
                ? "var(--accent)"
                : failed
                  ? "var(--danger)"
                  : "var(--border-1)";

            return (
              <div
                key={stage.key}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: bg,
                    border: `2px solid ${border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.3s, border-color 0.3s",
                  }}
                >
                  {done ? (
                    <span
                      style={{
                        fontSize: 8,
                        color: "var(--bg-0)",
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                  ) : active ? (
                    <Spinner size={8} color="var(--accent)" />
                  ) : failed ? (
                    <span
                      style={{
                        fontSize: 8,
                        color: "var(--danger)",
                        fontWeight: 700,
                      }}
                    >
                      ✕
                    </span>
                  ) : null}
                </div>
                <span
                  className="label"
                  style={{
                    fontSize: 9,
                    textAlign: "center",
                    color: done || active ? "var(--fg-1)" : "var(--fg-3)",
                  }}
                >
                  {stage.label}
                </span>
                <span
                  className="mono tnum"
                  style={{
                    fontSize: 9,
                    textAlign: "center",
                    minHeight: 12,
                    color: done
                      ? "var(--fg-3)"
                      : active
                        ? "var(--accent)"
                        : "var(--fg-3)",
                  }}
                >
                  {done ? "done" : active ? `${Math.round(pct)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {queued ? (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "var(--fg-3)",
          }}
        >
          <Spinner size={8} color="var(--fg-3)" />
          queued, waiting for worker…
        </div>
      ) : status?.detail ? (
        <div
          className="mono"
          style={{
            marginTop: 10,
            padding: "4px 8px",
            background: "var(--bg-2)",
            borderRadius: 3,
            fontSize: 10,
            color: "var(--fg-2)",
          }}
        >
          {status.detail}
        </div>
      ) : null}
    </div>
  );
}

function ActiveRunCard({
  run,
  onReview,
}: {
  run: MatchRunResponse;
  onReview: (id: number) => void;
}) {
  const { data: liveStatus } = useMatchRunStatus(run.id);
  const isComplete =
    liveStatus?.state === "COMPLETE" || liveStatus?.state === "SUCCESS";

  return (
    <div
      className="fade"
      style={{
        marginBottom: 10,
        background: "var(--bg-1)",
        border: "1px solid var(--accent-border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 14px",
          background: "var(--accent-soft)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 14, color: "var(--accent)", flexShrink: 0 }}
        >
          compare_arrows
        </span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
          Run <span style={{ color: "var(--accent)" }}>#{run.id}</span>
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
          {run.type}
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {run.batch_ids.length} batch{run.batch_ids.length !== 1 ? "es" : ""}
        </span>
        <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
          {relativeTime(run.created_at)}
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isComplete && (
            <button
              className="btn btn-sm btn-accent"
              onClick={() => onReview(run.id)}
              style={{ fontSize: 10 }}
            >
              Review results →
            </button>
          )}
          <Pill tone="info" dot style={{ fontSize: 10 }}>
            {run.status}
          </Pill>
        </div>
      </div>
      <MatchingPipeline status={liveStatus} />
    </div>
  );
}

// ── Batch filename cell ────────────────────────────────

function FileCell({ name }: { name: string }) {
  const clean = stripUuidPrefix(name);
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  return (
    <span
      title={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: 260,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      <svg
        width="13"
        height="15"
        viewBox="0 0 13 15"
        fill="none"
        style={{ flexShrink: 0, opacity: 0.45 }}
      >
        <path
          d="M1 1h7.5L12 4.5V14H1V1z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M8.5 1v4H12"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {stem}
      </span>
      {ext && (
        <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>{ext}</span>
      )}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────

export default function Match() {
  const navigate = useNavigate();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const [selState, setSelState] = useState<{
    type: string;
    ids: Set<number>;
    vsGolden: boolean;
  }>({
    type: selectedType,
    ids: new Set(),
    vsGolden: false,
  });

  const selected = useMemo(
    () => (selState.type === selectedType ? selState.ids : new Set<number>()),
    [selState.type, selState.ids, selectedType],
  );
  const vsGolden = selState.type === selectedType ? selState.vsGolden : false;

  const { data: batches } = useQuery({
    queryKey: ["batches"],
    queryFn: () => api.get<BatchResponse[]>("/api/import/batches"),
  });

  const { data: allRuns } = useQuery({
    queryKey: ["comparison-runs"],
    queryFn: () => api.get<MatchRunResponse[]>("/api/matches/"),
    refetchInterval: (q) => {
      const data = q.state.data as MatchRunResponse[] | undefined;
      return data?.some((r) => r.status === "pending" || r.status === "running")
        ? 3000
        : false;
    },
  });

  const activeRuns = (allRuns ?? []).filter(
    (r) => r.status === "pending" || r.status === "running",
  );

  const typeBatches = useMemo(
    () => (batches ?? []).filter((b) => b.type === selectedType),
    [batches, selectedType],
  );

  const selectedIds = useMemo(() => [...selected], [selected]);
  const effectiveSelection = vsGolden ? selectedIds.slice(0, 1) : selectedIds;
  const dispatchMode: MatchMode = vsGolden ? "FILE_VS_GOLDEN" : "FILE_VS_FILE";
  const minFiles = vsGolden ? 1 : 2;

  const goldenCountQuery = useQuery({
    queryKey: ["golden-count", selectedType],
    queryFn: () => api.get<{ count: number }>(`/api/unified/count?type=${selectedType}`),
  });
  const goldenCount = goldenCountQuery.data?.count ?? 0;
  const noGoldenForSingle = effectiveSelection.length === 1 && goldenCount === 0;

  const isValid = effectiveSelection.length >= minFiles && !noGoldenForSingle;

  const pairwiseRunCount =
    effectiveSelection.length >= 2
      ? (effectiveSelection.length * (effectiveSelection.length - 1)) / 2
      : 0;

  const selectedBatches = useMemo(
    () => typeBatches.filter((b) => effectiveSelection.includes(b.id)),
    [typeBatches, effectiveSelection],
  );

  const launch = useMutation({
    mutationFn: async () => {
      const payload: MatchRunCreate = {
        type: selectedType,
        file_ids: effectiveSelection,
      };
      return api.post<MatchRunDispatchResponse>("/api/matches", payload);
    },
    onSuccess: (dispatch) => {
      const runs = dispatch.runs ?? [];
      if (runs.length === 1) {
        navigate(withRecordType(`/review?match_run_id=${runs[0].id}`));
      } else {
        navigate(withRecordType("/match"));
      }
    },
  });

  const toggleRow = (id: number) => {
    setSelState((prev) => {
      const ids =
        prev.type === selectedType ? new Set(prev.ids) : new Set<number>();
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...prev, type: selectedType, ids };
    });
  };

  const needMore = minFiles - effectiveSelection.length;

  return (
    <div className="scroll" style={{ height: "100%" }}>
      <div style={{ padding: 20 }}>
        <WorkflowStageRail
          activeStage="match"
          match={{
            count: {
              value:
                activeRuns.length > 0
                  ? activeRuns.length
                  : (allRuns?.length ?? "—"),
              unit: activeRuns.length > 0 ? "running" : "runs",
            },
          }}
          review={{
            onClick: () => navigate(withRecordType("/review")),
            title: "Go to Review queue",
          }}
          merge={{
            onClick: () => navigate(withRecordType("/merge")),
            title: "Go to Merge queue",
          }}
          unified={{
            onClick: () => navigate(withRecordType("/unified")),
            title: "Go to Unified records",
          }}
        />

        <HandoffBanner
          icon="compare_arrows"
          text={
            <>
              completed runs deliver matched pairs to the{" "}
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                Review queue
              </span>{" "}
              for human triage.
            </>
          }
          note="auto-routed · no review on this screen"
        />

        {/* Active run cards */}
        {activeRuns.map((r) => (
          <ActiveRunCard
            key={r.id}
            run={r}
            onReview={(id) =>
              navigate(withRecordType(`/review?match_run_id=${id}`))
            }
          />
        ))}

        {/* vs Golden mode banner */}
        {vsGolden && (
          <div
            className="fade"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              marginBottom: 12,
              background: "color-mix(in srgb, var(--accent) 8%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              borderRadius: 6,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 15, color: "var(--accent)", flexShrink: 0 }}
            >
              verified
            </span>
            <span
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent)",
                letterSpacing: "0.04em",
              }}
            >
              FILE × GOLDEN
            </span>
            <span style={{ fontSize: 11, color: "var(--fg-2)" }}>—</span>
            <span style={{ fontSize: 11, color: "var(--fg-2)" }}>
              select one batch to match against the unified golden set
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px" }}
              onClick={() =>
                setSelState((s) => ({ ...s, ids: new Set(), vsGolden: false }))
              }
            >
              cancel
            </button>
          </div>
        )}

        {/* Batches for selected type */}
        {typeBatches.length === 0 ? (
          <Panel>
            <PanelHead>
              <span className="panel-title">Batches</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {effectiveSelection.length > 0 && !vsGolden && (
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--accent)" }}
                  >
                    {MODE_LABEL[dispatchMode]}
                  </span>
                )}
                <button
                  className={`btn btn-sm${vsGolden ? " btn-accent" : ""}`}
                  onClick={() =>
                    setSelState({
                      type: selectedType,
                      ids: new Set(),
                      vsGolden: !vsGolden,
                    })
                  }
                  title="Match selected file against the unified golden set"
                >
                  vs Golden
                </button>
                <Link to="/history" className="btn btn-sm">
                  History ▸
                </Link>
              </div>
            </PanelHead>
            <div
              style={{
                padding: "28px 0",
                textAlign: "center",
                color: "var(--fg-3)",
                fontSize: 12,
              }}
            >
              No batches yet
            </div>
          </Panel>
        ) : (
          <Panel>
            <PanelHead>
              <span className="panel-title">Batches</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {effectiveSelection.length > 0 && !vsGolden && (
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--accent)" }}
                  >
                    {MODE_LABEL[dispatchMode]}
                  </span>
                )}
                <button
                  className={`btn btn-sm${vsGolden ? " btn-accent" : ""}`}
                  onClick={() =>
                    setSelState({
                      type: selectedType,
                      ids: new Set(),
                      vsGolden: !vsGolden,
                    })
                  }
                  title="Match selected file against the unified golden set"
                >
                  vs Golden
                </button>
                <Link to="/history" className="btn btn-sm">
                  History ▸
                </Link>
              </div>
            </PanelHead>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Filename</th>
                  <th>Uploaded</th>
                  <th className="num">Rows</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {typeBatches.map((b) => {
                  const inEffective = effectiveSelection.includes(b.id);
                  const isChecked = selected.has(b.id);
                  const overCap = vsGolden && !inEffective && isChecked;
                  const dimmed =
                    vsGolden &&
                    !inEffective &&
                    !isChecked &&
                    effectiveSelection.length >= 1;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => toggleRow(b.id)}
                      className={inEffective ? "selected" : ""}
                      style={{
                        cursor: "pointer",
                        opacity: overCap || dimmed ? 0.35 : 1,
                      }}
                    >
                      <td>
                        <input type="checkbox" checked={isChecked} readOnly />
                      </td>
                      <td>
                        <FileCell name={b.filename} />
                      </td>
                      <td>
                        <span
                          title={`${new Date(b.created_at).toLocaleString()} by ${b.uploaded_by}`}
                          className="mono"
                          style={{ fontSize: 11, color: "var(--fg-2)" }}
                        >
                          {relativeTime(b.created_at)}
                        </span>
                      </td>
                      <td className="num">
                        {(b.row_count ?? 0).toLocaleString()}
                      </td>
                      <td>
                        <Pill tone={BATCH_TONE[b.status] ?? "neutral"} dot>
                          {b.status}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}

        {/* Sticky footer */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: 16,
            background: "var(--bg-0)",
            borderTop: "1px solid var(--border-0)",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              flex: 1,
            }}
          >
            {effectiveSelection.length === 0 ? (
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--fg-3)" }}
              >
                {vsGolden
                  ? "select 1 batch to match against the golden set"
                  : "select 2+ batches to compare"}
              </span>
            ) : (
              selectedBatches.map((b) => (
                <span
                  key={b.id}
                  className="pill accent"
                  style={{ fontSize: 10, gap: 4, flexShrink: 0 }}
                >
                  <span className="mono" style={{ opacity: 0.6, fontSize: 9 }}>
                    ▤
                  </span>
                  {displayFilename(b.filename, 20)}
                </span>
              ))
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {noGoldenForSingle && (
              <span className="pill warn" style={{ fontSize: 10 }}>
                No golden records yet — select at least 2 files
              </span>
            )}
            {!isValid && !noGoldenForSingle && effectiveSelection.length > 0 && (
              <span className="pill warn" style={{ fontSize: 10 }}>
                need {needMore} more
              </span>
            )}
            {pairwiseRunCount > 1 && (
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--fg-3)" }}
              >
                Will dispatch {pairwiseRunCount} runs
              </span>
            )}
            <button
              className="btn btn-sm btn-accent"
              disabled={!isValid || launch.isPending}
              onClick={() => launch.mutate()}
            >
              {launch.isPending ? <Spinner size={10} color="#fff" /> : null}
              Match ▸
            </button>
          </div>
        </div>

        {launch.isError && (
          <div className="pill danger" style={{ marginTop: 12 }}>
            {(launch.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
}
