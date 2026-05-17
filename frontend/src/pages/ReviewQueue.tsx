// ── Review Queue — terminal aesthetic, card-first ──

import { useCallback, useMemo, useRef, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../api/client";
import { useRecordType } from "../hooks/useRecordTypes";
import { useMatchRun } from "../hooks/useMatchRun";
import { fieldSummary } from "../utils/recordDisplay";
import { relativeTime } from "../utils/time";
import { confidenceTone } from "../utils/confidence";
import { useSearch } from "../contexts/SearchContext";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import type {
  ReviewQueueResponse,
  ReviewActionResponse,
  ReviewStats,
} from "../api/types";
import Panel, { PanelHead } from "../components/ui/Panel";
import { LoadingErrorEmpty } from "../components/ui/LoadingErrorEmpty";
import Pagination from "../components/Pagination";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";
import MatchRunSelect from "../components/MatchRunSelect";
import QueueBucketTabs from "../components/QueueBucketTabs";
import Spinner from "../components/ui/Spinner";

// ── Constants ────────────────────────────────────────

type BucketFilter = "pending" | "confirmed" | "rejected";

const BUCKETS: {
  id: BucketFilter;
  label: string;
  desc: string;
  tone: string;
}[] = [
  { id: "pending", label: "Pending", desc: "awaiting decision", tone: "warn" },
  {
    id: "confirmed",
    label: "Confirmed dupe",
    desc: "→ sent to merge",
    tone: "ok",
  },
  {
    id: "rejected",
    label: "Not a dupe",
    desc: "split into separate",
    tone: "danger",
  },
];

const PAGE_SIZE = 20;

// ── Small helpers ────────────────────────────────────

// Small confidence ring — SVG donut centred on a number
function ConfRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = confidenceTone(value);
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ position: "relative", width: 48, height: 48 }}>
      <svg
        viewBox="0 0 40 40"
        style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}
      >
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--border-0)"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={`var(--${tone})`}
          strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          className="mono tnum"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: `var(--${tone})`,
            lineHeight: 1,
          }}
        >
          {pct}
        </span>
        <span
          style={{
            fontSize: 7,
            color: "var(--fg-3)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          conf
        </span>
      </div>
    </div>
  );
}

// Source pill fixed to record-identity color
function RecordPill({ short, tone }: { short: string; tone: "a" | "b" }) {
  const style =
    tone === "a"
      ? {
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-border)",
          color: "var(--accent)",
        }
      : {
          background: "var(--info-soft)",
          border: "1px solid var(--info-border)",
          color: "var(--info)",
        };
  return (
    <span
      className="mono"
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {short.toUpperCase()}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────

export default function ReviewQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query: searchQuery } = useSearch();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const { runId, validRuns, selectedRun, setRunId } =
    useMatchRun(selectedType);
  const { data: recordType } = useRecordType(selectedType);
  const summaryFieldKeys =
    recordType?.fields
      .filter((field) => field.role !== "name")
      .map((field) => field.key) ?? [];
  const runReady =
    selectedRun?.status === "completed" || selectedRun?.status === "stale";

  const [bucket, setBucket] = useState<BucketFilter>("pending");
  const [minConfidence, setMinConfidence] = useState(0);
  const [pageState, setPageState] = useState({ type: selectedType, page: 0 });
  const page = pageState.type === selectedType ? pageState.page : 0;
  const tableRef = useRef<HTMLDivElement>(null);

  const setPage = useCallback(
    (nextPage: number) => {
      setPageState({ type: selectedType, page: nextPage });
    },
    [selectedType],
  );

  const handlePageChange = (p: number) => {
    setPage(p);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", bucket);
    if (minConfidence > 0)
      p.set("min_confidence", (minConfidence / 100).toFixed(2));
    if (runId) p.set("match_run_id", runId);
    p.set("limit", String(PAGE_SIZE));
    p.set("type", selectedType);
    p.set("offset", String(page * PAGE_SIZE));
    return p;
  }, [bucket, minConfidence, runId, page, selectedType]);

  const { data: queue, isLoading } = useQuery({
    queryKey: [
      "review-queue",
      bucket,
      minConfidence,
      page,
      selectedType,
      runId,
    ],
    queryFn: () =>
      api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
    placeholderData: keepPreviousData,
    enabled: !!runId && runReady,
  });

  const { data: stats } = useQuery({
    queryKey: ["review-stats", selectedType, runId],
    queryFn: () =>
      api.get<ReviewStats>(
        `/api/review/stats?type=${selectedType}${runId ? `&match_run_id=${runId}` : ""}`,
      ),
    enabled: !!runId && runReady,
    placeholderData: keepPreviousData,
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({
        queryKey: ["review-stats", selectedType, runId],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({
        queryKey: ["review-stats", selectedType, runId],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const bucketCounts: Record<BucketFilter, number> = {
    pending: stats?.total_pending ?? 0,
    confirmed: stats?.total_confirmed ?? 0,
    rejected: stats?.total_rejected ?? 0,
  };

  const filteredItems = useMemo(() => {
    if (!queue?.items) return [];
    if (!searchQuery) return queue.items;
    const q = searchQuery.toLowerCase();
    return queue.items.filter(
      (item) =>
        item.record_a_name?.toLowerCase().includes(q) ||
        item.record_b_name?.toLowerCase().includes(q) ||
        item.record_a_source?.toLowerCase().includes(q) ||
        item.record_b_source?.toLowerCase().includes(q),
    );
  }, [queue, searchQuery]);

  return (
    <div className="scroll" style={{ height: "100%" }}>
      <div style={{ padding: 20 }}>
        <WorkflowStageRail
          activeStage="review"
          match={{
            onClick: () => navigate("/compare"),
            title: "Go to Match runs",
            count: {
              value:
                (stats?.total_pending ?? 0) +
                (stats?.total_confirmed ?? 0) +
                (stats?.total_rejected ?? 0),
              unit: "matched",
            },
          }}
          review={{
            count: { value: stats?.total_pending ?? "—", unit: "pending" },
          }}
          merge={{
            onClick: () =>
              navigate(
                withRecordType(
                  runId ? `/merge?match_run_id=${runId}` : "/merge",
                ),
              ),
            title: "Go to Merge queue",
            count: { value: stats?.total_confirmed ?? "—", unit: "queued" },
          }}
          unified={{
            onClick: () => navigate(withRecordType("/unified")),
            title: "Go to Unified records",
            count: { value: stats?.total_unified ?? "—", unit: "records" },
          }}
        />

        <HandoffBanner
          icon="call_split"
          text={
            <>
              items confirmed here move to the{" "}
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                Merge queue
              </span>{" "}
              for field-level reconciliation by a data steward.
            </>
          }
          note="auto-routed · no merging on this screen"
        />

        {/* ── Stale warning ── */}
        {selectedRun?.status === "stale" && (
          <div
            style={{
              padding: "6px 14px",
              marginBottom: 8,
              fontSize: 11,
              color: "var(--warn)",
              background: "var(--warn-soft)",
              border: "1px solid var(--border-0)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 12 }}
            >
              warning
            </span>
            Source data has changed since this run — results may be outdated
          </div>
        )}

        {/* ── Title row ── */}
        {/* ── Bucket tabs ── */}
        <QueueBucketTabs
          buckets={BUCKETS}
          active={bucket}
          counts={bucketCounts}
          onChange={(id) => {
            setBucket(id as BucketFilter);
            setPage(0);
          }}
        />

        {/* ── Filters ── */}
        <Panel className="fade">
          <PanelHead>
            <MatchRunSelect
              validRuns={validRuns}
              runId={runId}
              onChange={(id) => {
                setRunId(id);
                setPage(0);
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="label">min confidence</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minConfidence}
                onChange={(e) => {
                  setMinConfidence(Number(e.target.value));
                  setPage(0);
                }}
                style={{ width: 120, accentColor: "var(--accent)" }}
                aria-label="Minimum confidence"
              />
              <span className="mono tnum" style={{ fontSize: 11, width: 36 }}>
                {(minConfidence / 100).toFixed(2)}
              </span>
            </div>
          </PanelHead>

          {/* Top pagination */}
          {queue && queue.total > PAGE_SIZE && (
            <div
              ref={tableRef}
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--border-0)",
                scrollMarginTop: 56,
              }}
            >
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                totalItems={queue.total}
                onPageChange={handlePageChange}
              />
            </div>
          )}

          {/* Card list */}
          <div
            style={{
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <LoadingErrorEmpty
              isLoading={isLoading && !queue}
              isEmpty={!runId || !runReady || filteredItems.length === 0}
              emptyMessage={
                !runId ? (
                  <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 28, color: "var(--fg-3)" }}
                    >
                      compare_arrows
                    </span>
                    <div style={{ marginTop: 8 }}>
                      Select a run above to load the review queue.
                    </div>
                  </div>
                ) : !runReady ? (
                  <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                    <Spinner size={14} />
                    <div style={{ marginTop: 8 }}>
                      Matching run #{runId} is still processing.
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 28, color: "var(--fg-3)" }}
                    >
                      inbox
                    </span>
                    <div style={{ marginTop: 8 }}>
                      No candidates match the current filters.
                    </div>
                  </div>
                )
              }
            >
              <>
                {filteredItems.map((item, i) => {
                  const isPending = item.status === "pending";
                  const statusTone =
                    item.status === "confirmed"
                      ? "ok"
                      : item.status === "rejected"
                        ? "danger"
                        : null;
                  const recordASummary = fieldSummary(
                    item.record_a_fields as Record<string, unknown>,
                    summaryFieldKeys,
                  );
                  const recordBSummary = fieldSummary(
                    item.record_b_fields as Record<string, unknown>,
                    summaryFieldKeys,
                  );

                  return (
                    <div
                      key={item.id}
                      className="review-card"
                      style={{
                        background: "var(--bg-1)",
                        border: "1px solid var(--border-0)",
                        borderLeft: statusTone
                          ? `3px solid var(--${statusTone})`
                          : "3px solid transparent",
                        borderRadius: 6,
                        overflow: "hidden",
                        opacity: !isPending ? 0.75 : 1,
                        transition:
                          "opacity 0.2s, border-color 0.2s, transform 0.12s, box-shadow 0.12s",
                        animation: "fadeIn 0.2s ease both",
                        animationDelay: `${i * 35}ms`,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.transform =
                          "translateY(-1px)";
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          "var(--shadow-md)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.transform =
                          "";
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          "";
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 80px 1fr 260px",
                          alignItems: "stretch",
                        }}
                      >
                        {/* ── Record A ── */}
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRight: "1px solid var(--border-0)",
                            borderLeft: "3px solid var(--accent-border)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              marginBottom: 7,
                            }}
                          >
                            <RecordPill
                              short={item.record_a_source ?? "?"}
                              tone="a"
                            />
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              letterSpacing: "-0.01em",
                              color: "var(--fg-0)",
                              lineHeight: 1.3,
                            }}
                          >
                            {item.record_a_name || "—"}
                          </div>
                          {recordASummary && (
                            <div
                              className="mono"
                              style={{
                                fontSize: 11,
                                color: "var(--fg-2)",
                                marginTop: 5,
                              }}
                            >
                              {recordASummary}
                            </div>
                          )}
                        </div>

                        {/* ── Confidence ring + age ── */}
                        <div
                          style={{
                            padding: "14px 8px",
                            borderRight: "1px solid var(--border-0)",
                            background: "var(--bg-2)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <ConfRing value={item.confidence} />
                          <span
                            className="mono"
                            style={{
                              fontSize: 9,
                              color: "var(--fg-3)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {relativeTime(item.created_at)}
                          </span>
                        </div>

                        {/* ── Record B ── */}
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRight: "1px solid var(--border-0)",
                            borderLeft: "3px solid var(--info-border)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              marginBottom: 7,
                            }}
                          >
                            <RecordPill
                              short={item.record_b_source ?? "?"}
                              tone="b"
                            />
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              letterSpacing: "-0.01em",
                              color: "var(--fg-0)",
                              lineHeight: 1.3,
                            }}
                          >
                            {item.record_b_name || "—"}
                          </div>
                          {recordBSummary && (
                            <div
                              className="mono"
                              style={{
                                fontSize: 11,
                                color: "var(--fg-2)",
                                marginTop: 5,
                              }}
                            >
                              {recordBSummary}
                            </div>
                          )}
                        </div>

                        {/* ── Decision column ── */}
                        <div
                          style={{
                            padding: "12px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            justifyContent: "center",
                          }}
                        >
                          {!isPending ? (
                            <span
                              className={`pill ${statusTone ?? "accent"}`}
                              style={{
                                padding: "3px 8px",
                                justifyContent: "center",
                              }}
                            >
                              <span className="pill-dot" />
                              {item.status === "confirmed"
                                ? "Confirmed dupe"
                                : "Not a duplicate"}
                            </span>
                          ) : (
                            <>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: 6,
                                }}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmMutation.mutate(item.id);
                                  }}
                                  disabled={
                                    confirmMutation.isPending ||
                                    rejectMutation.isPending
                                  }
                                  style={{
                                    padding: "5px 10px",
                                    cursor:
                                      confirmMutation.isPending ||
                                      rejectMutation.isPending
                                        ? "default"
                                        : "pointer",
                                    background: "transparent",
                                    color: "var(--ok)",
                                    border: "1px solid var(--ok)",
                                    borderRadius: 3,
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 3,
                                    letterSpacing: "0.02em",
                                    transition: "background 0.1s, filter 0.1s",
                                    opacity:
                                      confirmMutation.isPending ||
                                      rejectMutation.isPending
                                        ? 0.5
                                        : 1,
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--ok-soft)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "transparent")
                                  }
                                >
                                  ✓ Same
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    rejectMutation.mutate(item.id);
                                  }}
                                  disabled={rejectMutation.isPending}
                                  style={{
                                    padding: "5px 10px",
                                    cursor: "pointer",
                                    background: "transparent",
                                    color: "var(--danger)",
                                    border: "1px solid var(--danger)",
                                    borderRadius: 3,
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 3,
                                    letterSpacing: "0.02em",
                                    transition: "background 0.1s",
                                    opacity: rejectMutation.isPending ? 0.5 : 1,
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--danger-soft)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "transparent")
                                  }
                                >
                                  ✕ Diff
                                </button>
                              </div>
                              <div
                                style={{
                                  borderTop: "1px solid var(--border-0)",
                                  paddingTop: 6,
                                  marginTop: 2,
                                }}
                              >
                                <button
                                  onClick={() =>
                                    navigate(
                                      withRecordType(`/review/${item.id}`),
                                    )
                                  }
                                  style={{
                                    width: "100%",
                                    padding: "5px 8px",
                                    cursor: "pointer",
                                    background: "transparent",
                                    border: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 5,
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11,
                                    color: "var(--accent)",
                                    letterSpacing: "0.03em",
                                    transition: "opacity 0.1s",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.opacity = "0.7")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.opacity = "1")
                                  }
                                >
                                  See evidence
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 12 }}
                                  >
                                    arrow_forward
                                  </span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            </LoadingErrorEmpty>
          </div>

          {/* Bottom pagination */}
          {queue && queue.total > 0 && (
            <div
              style={{
                padding: "8px 14px",
                borderTop: "1px solid var(--border-0)",
              }}
            >
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                totalItems={queue.total}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
