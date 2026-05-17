// ── Merge Queue — field reconciliation for confirmed duplicate pairs ──

import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import { useMatchRun } from "../hooks/useMatchRun";
import { relativeTime } from "../utils/time";
import { confidenceTone } from "../utils/confidence";
import type {
  ReviewQueueItem,
  ReviewQueueResponse,
  ReviewStats,
} from "../api/types";
import { useSearch } from "../contexts/SearchContext";
import Panel, { PanelHead } from "../components/ui/Panel";
import { LoadingErrorEmpty } from "../components/ui/LoadingErrorEmpty";
import IdChip from "../components/ui/IdChip";
import SourcePill from "../components/ui/SourcePill";
import Pagination from "../components/Pagination";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";
import MatchRunSelect from "../components/MatchRunSelect";
import QueueBucketTabs from "../components/QueueBucketTabs";

const PAGE_SIZE = 50;

type BucketFilter = "confirmed" | "merged" | "rejected";

interface Bucket {
  id: BucketFilter;
  label: string;
  tone: string;
  desc: string;
}

const BUCKETS: Bucket[] = [
  {
    id: "confirmed",
    label: "Ready to merge",
    tone: "accent",
    desc: "confirmed dupes awaiting reconciliation",
  },
  {
    id: "merged",
    label: "Merged",
    tone: "ok",
    desc: "field-reconciled unified records created",
  },
  {
    id: "rejected",
    label: "Rejected",
    tone: "danger",
    desc: "not a duplicate",
  },
];

export default function MergeQueue() {
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const { runId, validRuns, selectedRun, setRunId } =
    useMatchRun(selectedType);

  const [bucket, setBucket] = useState<BucketFilter>("confirmed");
  const [pageState, setPageState] = useState({ type: selectedType, page: 0 });
  const page = pageState.type === selectedType ? pageState.page : 0;
  const tableRef = useRef<HTMLDivElement>(null);

  const setPage = useCallback(
    (nextPage: number) => {
      setPageState({ type: selectedType, page: nextPage });
    },
    [selectedType],
  );

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [setPage],
  );

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", bucket);
    p.set("sort", "confidence_desc");
    p.set("limit", String(PAGE_SIZE));
    p.set("type", selectedType);
    p.set("offset", String(page * PAGE_SIZE));
    if (runId) p.set("match_run_id", runId);
    return p;
  }, [bucket, page, selectedType, runId]);

  const { data: queue, isLoading } = useQuery({
    queryKey: ["merge-queue", bucket, page, selectedType, runId],
    queryFn: () =>
      api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
    refetchInterval: 30_000,
    enabled: !!runId,
  });

  const { data: stats } = useQuery({
    queryKey: ["review-stats", selectedType, runId],
    queryFn: () =>
      api.get<ReviewStats>(
        `/api/review/stats?type=${selectedType}${runId ? `&match_run_id=${runId}` : ""}`,
      ),
    refetchInterval: 30_000,
    enabled: !!runId,
  });

  const bucketCounts: Record<BucketFilter, number> = {
    confirmed: stats?.total_confirmed ?? 0,
    merged: stats?.total_merged ?? 0,
    rejected: stats?.total_rejected ?? 0,
  };

  const filteredItems = useMemo<ReviewQueueItem[]>(() => {
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
          activeStage="merge"
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
            onClick: () =>
              navigate(
                withRecordType(
                  runId ? `/review?match_run_id=${runId}` : "/review",
                ),
              ),
            title: "Go to Review queue",
            count: { value: stats?.total_pending ?? "—", unit: "pending" },
          }}
          merge={{
            count: { value: stats?.total_confirmed ?? "—", unit: "queued" },
          }}
          unified={{
            onClick: () => navigate(withRecordType("/unified")),
            title: "Go to Unified records",
            count: { value: stats?.total_unified ?? "—", unit: "records" },
          }}
        />

        <HandoffBanner
          icon="merge"
          text={
            <>
              merged pairs produce a golden record in{" "}
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                Unified records
              </span>
              .
            </>
          }
          note="field provenance tracked · one record per group"
        />

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
        <QueueBucketTabs
          buckets={BUCKETS}
          active={bucket}
          counts={bucketCounts}
          onChange={(id) => {
            setBucket(id as BucketFilter);
            setPage(0);
          }}
        />

        {/* ── Upstream hint ── */}
        <div
          className="fade"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            marginBottom: 14,
            background: "var(--bg-2)",
            border: "1px solid var(--border-0)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--fg-1)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 14, color: "var(--fg-2)" }}
          >
            history
          </span>
          <span>
            <b>Upstream:</b> these pairs were confirmed as the same record in
            the{" "}
            <a
              onClick={(e) => {
                e.preventDefault();
                navigate(
                  withRecordType(
                    runId ? `/review?match_run_id=${runId}` : "/review",
                  ),
                );
              }}
              href={withRecordType(
                runId ? `/review?match_run_id=${runId}` : "/review",
              )}
              style={{
                color: "var(--accent)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Review queue
            </a>
            . Pick the correct value for each conflicting field.
          </span>
        </div>

        {/* ── Table ── */}
        <div ref={tableRef}>
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
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--fg-2)" }}
              >
                {runId
                  ? `${queue?.total ?? 0} item${(queue?.total ?? 0) !== 1 ? "s" : ""}`
                  : ""}
              </span>
            </PanelHead>
            <LoadingErrorEmpty
              isLoading={isLoading && !queue}
              isEmpty={!runId || filteredItems.length === 0}
              emptyMessage={
                !runId ? (
                  <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 28,
                        color: "var(--fg-3)",
                        display: "block",
                        marginBottom: 8,
                      }}
                    >
                      merge
                    </span>
                    Select a run above to load the merge queue.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                    {bucket === "confirmed"
                      ? "No items awaiting merge — review queue may still be empty."
                      : `No ${BUCKETS.find((b) => b.id === bucket)?.label.toLowerCase()} items.`}
                  </div>
                )
              }
            >
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Pair</th>
                    <th>Record</th>
                    <th style={{ width: 90 }} className="num">
                      Confidence
                    </th>
                    <th style={{ width: 120 }}>Confirmed by</th>
                    <th style={{ width: 90 }}>Age</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, i) => {
                    const tone = confidenceTone(item.confidence);
                    return (
                      <tr
                        key={item.id}
                        onClick={() =>
                          navigate(withRecordType(`/merge/${item.id}`))
                        }
                        style={{
                          cursor: "pointer",
                          animationDelay: `${i * 30}ms`,
                        }}
                      >
                        <td>
                          <IdChip>#{item.id}</IdChip>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>
                            {item.record_a_name || `#${item.record_a_id}`}{" "}
                            <span
                              style={{ color: "var(--fg-3)", fontWeight: 400 }}
                            >
                              ↔
                            </span>{" "}
                            {item.record_b_name || `#${item.record_b_id}`}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              fontSize: 11,
                              color: "var(--fg-2)",
                              marginTop: 2,
                            }}
                          >
                            {item.record_a_source && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <SourcePill short={item.record_a_source} />
                              </span>
                            )}
                            {item.record_b_source && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <SourcePill short={item.record_b_source} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="num">
                          <span
                            className="mono tnum"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: `var(--${tone})`,
                            }}
                          >
                            {item.confidence.toFixed(3)}
                          </span>
                        </td>
                        <td>
                          {item.reviewed_by ? (
                            <span
                              className="mono"
                              style={{ fontSize: 11, color: "var(--accent)" }}
                            >
                              {item.reviewed_by}
                            </span>
                          ) : (
                            <span
                              style={{ fontSize: 11, color: "var(--fg-3)" }}
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className="mono"
                            style={{ fontSize: 11, color: "var(--fg-2)" }}
                          >
                            {relativeTime(item.reviewed_at ?? item.created_at)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-accent"
                            style={{ padding: "0 10px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(withRecordType(`/merge/${item.id}`));
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 11 }}
                            >
                              merge
                            </span>
                            Reconcile
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 10 }}
                            >
                              arrow_forward
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </LoadingErrorEmpty>

            {(queue?.total ?? 0) > PAGE_SIZE && (
              <div
                style={{
                  padding: "8px 14px",
                  borderTop: "1px solid var(--border-0)",
                }}
              >
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={queue?.total ?? 0}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
