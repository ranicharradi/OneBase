// ── Unified Records — terminal aesthetic, browse unified records ──

import { useCallback, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  BadgeCheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useRecordType } from "../hooks/useRecordTypes";
import { fieldValue } from "../utils/recordDisplay";
import { dqTone } from "../utils/confidence";
import { api } from "../api/client";
import { useSearch } from "../contexts/SearchContext";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import type {
  DataSource,
  SingletonListResponse,
  UnifiedRecordListResponse,
} from "../api/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import IdChip from "../components/ui/IdChip";
import SourcePill from "../components/ui/SourcePill";
import Pagination from "../components/Pagination";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";
import { LoadingErrorEmpty } from "../components/ui/LoadingErrorEmpty";

type Tab = "unified" | "singletons";

const PAGE_SIZE = 50;

export default function UnifiedRecords() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query: searchQuery } = useSearch();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const { data: recordType } = useRecordType(selectedType);
  const displayFields = (recordType?.fields ?? [])
    .filter((field) => field.role !== "name")
    .slice(0, 3);

  const [tab, setTab] = useState<Tab>("unified");
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState<string>("");
  const [singletonSearch, setSingletonSearch] = useState("");
  const [singletonSourceId, setSingletonSourceId] = useState<string>("");
  const [selectedSingletonState, setSelectedSingletonState] = useState<{
    type: string;
    ids: Set<number>;
  }>({
    type: selectedType,
    ids: new Set(),
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [unifiedPageState, setUnifiedPageState] = useState({
    type: selectedType,
    page: 0,
  });
  const [singletonsPageState, setSingletonsPageState] = useState({
    type: selectedType,
    page: 0,
  });
  const unifiedPage =
    unifiedPageState.type === selectedType ? unifiedPageState.page : 0;
  const singletonsPage =
    singletonsPageState.type === selectedType ? singletonsPageState.page : 0;
  const selectedSingletons = useMemo(
    () =>
      selectedSingletonState.type === selectedType
        ? selectedSingletonState.ids
        : new Set<number>(),
    [selectedSingletonState, selectedType],
  );
  const unifiedTableRef = useRef<HTMLDivElement>(null);
  const singletonsTableRef = useRef<HTMLDivElement>(null);

  const setUnifiedPage = useCallback(
    (nextPage: number) => {
      setUnifiedPageState({ type: selectedType, page: nextPage });
    },
    [selectedType],
  );

  const setSingletonsPage = useCallback(
    (nextPage: number) => {
      setSingletonsPageState({ type: selectedType, page: nextPage });
    },
    [selectedType],
  );

  const setSelectedSingletons = useCallback(
    (ids: Set<number>) => {
      setSelectedSingletonState({ type: selectedType, ids });
    },
    [selectedType],
  );

  const handleUnifiedPageChange = useCallback(
    (p: number) => {
      setUnifiedPage(p);
      unifiedTableRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [setUnifiedPage],
  );

  const handleSingletonsPageChange = useCallback(
    (p: number) => {
      setSingletonsPage(p);
      singletonsTableRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [setSingletonsPage],
  );

  const { data: unifiedData, isLoading: unifiedLoading } =
    useQuery<UnifiedRecordListResponse>({
      queryKey: [
        "unified-records",
        search,
        sourceType,
        fromDate,
        toDate,
        unifiedPage,
        selectedType,
      ],
      queryFn: () => {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (sourceType) params.set("source_type", sourceType);
        if (fromDate) params.set("from_date", fromDate);
        if (toDate) params.set("to_date", toDate);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(unifiedPage * PAGE_SIZE));
        params.set("type", selectedType);
        return api.get(`/api/unified/records?${params}`);
      },
      placeholderData: keepPreviousData,
      refetchInterval: 30_000,
    });

  const { data: singletonData, isLoading: singletonsLoading } =
    useQuery<SingletonListResponse>({
      queryKey: [
        "singletons",
        singletonSearch,
        singletonSourceId,
        singletonsPage,
        selectedType,
      ],
      queryFn: () => {
        const params = new URLSearchParams();
        if (singletonSearch) params.set("search", singletonSearch);
        if (singletonSourceId) params.set("source_id", singletonSourceId);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(singletonsPage * PAGE_SIZE));
        params.set("type", selectedType);
        return api.get(`/api/unified/singletons?${params}`);
      },
      placeholderData: keepPreviousData,
    });

  const { data: sources } = useQuery<DataSource[]>({
    queryKey: ["sources"],
    queryFn: () => api.get("/api/sources"),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<{ unified_record_id: number }>(
        `/api/unified/singletons/${id}/promote`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["singletons"] });
      queryClient.invalidateQueries({ queryKey: ["unified-records"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const bulkPromoteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post<{ promoted_count: number }>(
        "/api/unified/singletons/bulk-promote",
        { record_ids: ids },
      ),
    onSuccess: () => {
      setSelectedSingletons(new Set());
      queryClient.invalidateQueries({ queryKey: ["singletons"] });
      queryClient.invalidateQueries({ queryKey: ["unified-records"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (sourceType) params.set("source_type", sourceType);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      params.set("type", selectedType);
      const qs = params.toString();
      const response = await fetch(`/api/unified/export${qs ? `?${qs}` : ""}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("onebase_token")}`,
        },
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unified_records_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSingleton = (id: number) => {
    const next = new Set(selectedSingletons);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSingletons(next);
  };

  const toggleAllSingletons = () => {
    if (!singletonData) return;
    if (selectedSingletons.size === singletonData.items.length) {
      setSelectedSingletons(new Set());
    } else {
      setSelectedSingletons(new Set(singletonData.items.map((s) => s.id)));
    }
  };

  const filteredUnified = useMemo(() => {
    if (!unifiedData?.items) return [];
    if (!searchQuery) return unifiedData.items;
    const q = searchQuery.toLowerCase();
    return unifiedData.items.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        Object.values(s.fields || {}).some((v) =>
          String(v).toLowerCase().includes(q),
        ),
    );
  }, [unifiedData, searchQuery]);

  const filteredSingletons = useMemo(() => {
    if (!singletonData?.items) return [];
    if (!searchQuery) return singletonData.items;
    const q = searchQuery.toLowerCase();
    return singletonData.items.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        Object.values(s.fields || {}).some((v) =>
          String(v).toLowerCase().includes(q),
        ),
    );
  }, [singletonData, searchQuery]);

  const unifiedTotal = unifiedData?.total ?? 0;
  const singletonTotal = singletonData?.total ?? 0;

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-5">
        <WorkflowStageRail
          activeStage="unified"
          match={{
            onClick: () => navigate(withRecordType("/match")),
            title: "Go to Match runs",
          }}
          review={{
            onClick: () => navigate(withRecordType("/review")),
            title: "Go to Review queue",
          }}
          merge={{
            onClick: () => navigate(withRecordType("/merge")),
            title: "Go to Merge queue",
          }}
        />

        <HandoffBanner
          icon={BadgeCheckIcon}
          text="golden records are the pipeline output — export as CSV or push to downstream systems."
          note="no further stages · singletons promotable"
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-3.5 mt-3">
          <div>
            <div className="text-xs text-muted-foreground">
              {unifiedTotal.toLocaleString()} unified ·{" "}
              {singletonTotal.toLocaleString()} singletons awaiting promotion
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="From date"
              className="h-6 text-[11px] px-1.5 font-mono w-auto"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setUnifiedPage(0);
              }}
            />
            <Input
              type="date"
              aria-label="To date"
              className="h-6 text-[11px] px-1.5 font-mono w-auto"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setUnifiedPage(0);
              }}
            />
            {exportError && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                {exportError}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="gap-1"
            >
              <DownloadIcon className="size-3" />
              {isExporting
                ? "Exporting…"
                : search || sourceType || fromDate || toDate
                  ? "Export CSV (filtered)"
                  : "Export CSV"}
            </Button>
          </div>
        </div>

        <Card>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <CardHeader className="pb-0 pt-3 px-3">
              <div className="flex items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="unified">
                    Unified
                    {unifiedTotal > 0 && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                        {unifiedTotal.toLocaleString()}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="singletons">
                    Singletons
                    {singletonTotal > 0 && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                        {singletonTotal.toLocaleString()}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {tab === "unified" ? (
                  <div className="flex gap-2 items-center">
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setUnifiedPage(0);
                      }}
                      placeholder="Filter by name or code…"
                      className="w-64 h-6 text-[11px]"
                    />
                    <select
                      value={sourceType}
                      onChange={(e) => {
                        setSourceType(e.target.value);
                        setUnifiedPage(0);
                      }}
                      className="h-6 text-[11px] px-2 font-mono rounded-md border border-border bg-background"
                    >
                      <option value="">All types</option>
                      <option value="merged">Merged</option>
                      <option value="singleton">Singleton</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <Input
                      value={singletonSearch}
                      onChange={(e) => {
                        setSingletonSearch(e.target.value);
                        setSingletonsPage(0);
                      }}
                      placeholder="Search singletons…"
                      className="w-56 h-6 text-[11px]"
                    />
                    <select
                      value={singletonSourceId}
                      onChange={(e) => {
                        setSingletonSourceId(e.target.value);
                        setSingletonsPage(0);
                      }}
                      className="h-6 text-[11px] px-2 font-mono rounded-md border border-border bg-background"
                    >
                      <option value="">All sources</option>
                      {(sources?.filter((s) => s.type === selectedType) ?? []).map(
                        (s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ),
                      )}
                    </select>
                    {selectedSingletons.size > 0 && (
                      <Button
                        size="sm"
                        onClick={() =>
                          bulkPromoteMutation.mutate([...selectedSingletons])
                        }
                        disabled={bulkPromoteMutation.isPending}
                        className="gap-1"
                      >
                        <ShieldCheckIcon className="size-3" />
                        {bulkPromoteMutation.isPending
                          ? "Promoting…"
                          : `Promote ${selectedSingletons.size}`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Unified tab */}
            <TabsContent value="unified">
              <CardContent className="p-0">
                {unifiedTotal > PAGE_SIZE && (
                  <div
                    ref={unifiedTableRef}
                    className="px-3.5 py-2 border-b border-border scroll-mt-14"
                  >
                    <Pagination
                      page={unifiedPage}
                      pageSize={PAGE_SIZE}
                      totalItems={unifiedTotal}
                      onPageChange={handleUnifiedPageChange}
                    />
                  </div>
                )}

                <LoadingErrorEmpty
                  loading={unifiedLoading && !unifiedData}
                  empty={filteredUnified.length === 0}
                  emptyMessage="No unified records yet — merge match candidates or promote singletons."
                >
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>ID</th>
                        <th>Name</th>
                        {displayFields.map((f) => (
                          <th key={f.key}>{f.label}</th>
                        ))}
                        <th className="num" style={{ width: 80 }}>
                          Sources
                        </th>
                        <th>Origin</th>
                        <th style={{ width: 60 }}>DQ</th>
                        <th>Created</th>
                        <th style={{ width: 30 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnified.map((s) => (
                        <tr
                          key={s.id}
                          className="clickable"
                          onClick={() =>
                            navigate(withRecordType(`/unified/${s.id}`))
                          }
                        >
                          <td>
                            <IdChip>{s.id}</IdChip>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span style={{ fontWeight: 500 }}>
                                {s.name || "—"}
                              </span>
                            </div>
                          </td>
                          {displayFields.map((field) => (
                            <td key={field.key}>
                              {fieldValue(
                                s.fields as Record<string, unknown>,
                                field.key,
                              ) ?? (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          ))}
                          <td className="num font-mono">{s.source_count}</td>
                          <td>
                            {s.is_singleton ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                singleton
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                merged
                              </Badge>
                            )}
                          </td>
                          <td>
                            {(() => {
                              const tone = dqTone(s.dq_score);
                              const label =
                                s.dq_score == null
                                  ? "—"
                                  : `${Math.round(s.dq_score * 100)}%`;
                              if (tone === "ok")
                                return (
                                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    {label}
                                  </Badge>
                                );
                              if (tone === "warn")
                                return (
                                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                    {label}
                                  </Badge>
                                );
                              if (tone === "danger")
                                return (
                                  <Badge variant="destructive">{label}</Badge>
                                );
                              return <Badge variant="outline">{label}</Badge>;
                            })()}
                          </td>
                          <td className="font-mono text-[11px] text-muted-foreground">
                            {s.created_at
                              ? new Date(s.created_at).toLocaleDateString()
                              : "—"}
                          </td>
                          <td>
                            <ChevronRightIcon className="size-3 text-muted-foreground" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </LoadingErrorEmpty>

                {unifiedTotal > 0 && (
                  <div className="px-3.5 py-2 border-t border-border">
                    <Pagination
                      page={unifiedPage}
                      pageSize={PAGE_SIZE}
                      totalItems={unifiedTotal}
                      onPageChange={handleUnifiedPageChange}
                    />
                  </div>
                )}
              </CardContent>
            </TabsContent>

            {/* Singletons tab */}
            <TabsContent value="singletons">
              <CardContent className="p-0">
                {singletonTotal > PAGE_SIZE && (
                  <div
                    ref={singletonsTableRef}
                    className="px-3.5 py-2 border-b border-border scroll-mt-14"
                  >
                    <Pagination
                      page={singletonsPage}
                      pageSize={PAGE_SIZE}
                      totalItems={singletonTotal}
                      onPageChange={handleSingletonsPageChange}
                    />
                  </div>
                )}

                <LoadingErrorEmpty
                  loading={singletonsLoading && !singletonData}
                  empty={filteredSingletons.length === 0}
                  emptyMessage="All records matched or unified — no singleton candidates available for promotion."
                >
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 34 }}>
                          <input
                            type="checkbox"
                            checked={
                              !!singletonData &&
                              selectedSingletons.size ===
                                singletonData.items.length &&
                              singletonData.items.length > 0
                            }
                            onChange={toggleAllSingletons}
                            aria-label="Select all singletons"
                          />
                        </th>
                        <th style={{ width: 80 }}>ID</th>
                        <th>Name</th>
                        {displayFields.map((f) => (
                          <th key={f.key}>{f.label}</th>
                        ))}
                        <th style={{ width: 100 }}>Source</th>
                        <th style={{ width: 110 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSingletons.map((s) => (
                        <tr key={s.id}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedSingletons.has(s.id)}
                              onChange={() => toggleSingleton(s.id)}
                              aria-label={`Select singleton ${s.id}`}
                            />
                          </td>
                          <td>
                            <IdChip>{s.id}</IdChip>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span style={{ fontWeight: 500 }}>
                                {s.name || "—"}
                              </span>
                            </div>
                          </td>
                          {displayFields.map((field) => (
                            <td key={field.key}>
                              {fieldValue(
                                s.fields as Record<string, unknown>,
                                field.key,
                              ) ?? (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          ))}
                          <td>
                            {s.data_source_name ? (
                              <SourcePill short={s.data_source_name} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => promoteMutation.mutate(s.id)}
                              disabled={promoteMutation.isPending}
                              className="gap-1"
                            >
                              <ShieldCheckIcon className="size-3" />
                              Promote
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </LoadingErrorEmpty>

                {singletonTotal > 0 && (
                  <div className="px-3.5 py-2 border-t border-border">
                    <Pagination
                      page={singletonsPage}
                      pageSize={PAGE_SIZE}
                      totalItems={singletonTotal}
                      onPageChange={handleSingletonsPageChange}
                    />
                  </div>
                )}
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
