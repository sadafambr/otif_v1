import { useState, useEffect, useLayoutEffect, useMemo, useTransition, useRef, useCallback, lazy, Suspense } from "react";
import { AppLayout } from "@/components/AppLayout";
import { KPICard } from "@/components/KPICard";
import { OTIFDistributionChartInline } from "@/components/OTIFChart";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { OrderTable } from "@/components/OrderTable";
import { OrderDetailModal } from "@/components/OrderDetailModal";
const OTIFAnalyticsPanel = lazy(() =>
  import("@/components/OTIFAnalyticsPanel").then((m) => ({ default: m.OTIFAnalyticsPanel })),
);
import { useDashboard, useOrderDetail } from "@/hooks/useOTIF";
import { getDashboardData } from "@/lib/dataStore";
import { cn } from "@/lib/utils";
import { fetchFavorites, saveFavorite, deleteFavorite, type FavoriteFilter } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Package, Loader2, XCircle, CheckCircle, TrendingDown, Calendar, ChevronDown, Download, Star, Trash2, Save, LayoutDashboard, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OTIFRecord, PeriodFilter } from "@/types/otif";
import type { OrderTableDrillPayload } from "@/components/OTIFAnalyticsPanel";

const periods: PeriodFilter[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7_days" },
  { label: "14 Days", value: "14_days" },
  { label: "> 30 Days", value: "over_30_days" },
];

type OrderDateCache = { req: number; so: number };

function getOrderDateTimes(o: OTIFRecord, cache: WeakMap<OTIFRecord, OrderDateCache>): OrderDateCache {
  let t = cache.get(o);
  if (!t) {
    t = {
      req: o.reqDelivery ? Date.parse(o.reqDelivery) : NaN,
      so: o.soCreateDate ? Date.parse(o.soCreateDate) : NaN,
    };
    cache.set(o, t);
  }
  return t;
}

export default function Dashboard() {
  const { summary, orders, loading, loadDashboard, refresh } = useDashboard();
  const [, startFilterTransition] = useTransition();
  const orderDateCacheRef = useRef<WeakMap<OTIFRecord, OrderDateCache>>(new WeakMap());
  const { detail, loading: detailLoading, fetchDetail, setDetail } = useOrderDetail();
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedCreationPeriod, setSelectedCreationPeriod] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<OTIFRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "analytics">("dashboard");
  /** Keep analytics subtree mounted after first visit so switching back to the dashboard does not remount OrderTable/chart (avoids ~1s lag). */
  const [analyticsMounted, setAnalyticsMounted] = useState(false);

  const { token } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteFilter[]>([]);
  const [newFavName, setNewFavName] = useState("");
  const [showSaveFav, setShowSaveFav] = useState(false);
  const [favDropdownOpen, setFavDropdownOpen] = useState(false);
  const [filtersTrayOpen, setFiltersTrayOpen] = useState(false);
  const [orderTablePageSize, setOrderTablePageSize] = useState(25);
  const [orderTableDrill, setOrderTableDrill] = useState<OrderTableDrillPayload | null>(null);
  const [tableFilteredOrders, setTableFilteredOrders] = useState<OTIFRecord[] | null>(null);
  /** Only one OTIF distribution HoverCard open at a time (avoids the first popover sticking when moving to another card). */
  const [distributionPopover, setDistributionPopover] = useState<"miss" | "hit" | "rate" | null>(null);
  const handleDistributionPopoverChange = useCallback((key: "miss" | "hit" | "rate", open: boolean) => {
    setDistributionPopover((prev) => {
      if (open) return key;
      return prev === key ? null : prev;
    });
  }, []);
  const handleOrderTableDrillApplied = useCallback(() => {
    setOrderTableDrill(null);
  }, []);

  useEffect(() => {
    if (!filtersTrayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersTrayOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersTrayOpen]);

  useEffect(() => {
    if (!filtersTrayOpen) {
      setFavDropdownOpen(false);
    }
  }, [filtersTrayOpen]);

  useEffect(() => {
    if (activeTab === "analytics") setAnalyticsMounted(true);
  }, [activeTab]);

  // Warm the lazy analytics chunk so the first switch to Analytics is less likely to stall.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void import("@/components/OTIFAnalyticsPanel");
    }, 300);
    return () => clearTimeout(id);
  }, []);

  // Hydrate dashboard from in-memory store (after navigation from Document Repository)
  useLayoutEffect(() => {
    const { records } = getDashboardData();
    if (records.length > 0) {
      void loadDashboard(records);
    }
  }, [loadDashboard]);

  // Load global favorites
  useEffect(() => {
    if (token) {
      fetchFavorites(token).then(setFavorites).catch(console.error);
    } else {
      setFavorites([]);
    }
  }, [token]);

  const handleSaveFavorite = async () => {
    if (!token || !newFavName.trim()) return;
    try {
      const state = JSON.stringify({ selectedPeriod, selectedCreationPeriod });
      const saved = await saveFavorite(token, newFavName.trim(), state);
      setFavorites((prev) => [...prev, saved]);
      setNewFavName("");
      setShowSaveFav(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFavorite = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!token) return;
    try {
      await deleteFavorite(token, id);
      setFavorites((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleApplyFavorite = (fav: FavoriteFilter) => {
    try {
      const state = JSON.parse(fav.filter_state);
      startFilterTransition(() => {
        if (state.selectedPeriod) setSelectedPeriod(state.selectedPeriod);
        if (state.selectedCreationPeriod) setSelectedCreationPeriod(state.selectedCreationPeriod);
      });
    } catch (err) {
      console.error("Failed to parse favorite state", err);
    }
    setFavDropdownOpen(false);
  };

  const handleOrderClick = async (order: OTIFRecord) => {
    setSelectedOrder(order);
    await fetchDetail(order);
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning!";
    if (h < 17) return "Good afternoon!";
    return "Good evening!";
  }, []);

  /** Single pass: filter rows, cache parsed dates per order, derive summary without extra scans. */
  const { filteredOrders, filteredSummary } = useMemo(() => {
    if (!orders?.length) {
      return { filteredOrders: [] as OTIFRecord[], filteredSummary: summary };
    }
    if (!summary) {
      return { filteredOrders: [] as OTIFRecord[], filteredSummary: summary };
    }

    const cache = orderDateCacheRef.current;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTodayMs = startOfToday.getTime();
    const end7Ms = startTodayMs + 7 * 86_400_000;
    const end14Ms = startTodayMs + 14 * 86_400_000;
    const startOver30Ms = startTodayMs + 30 * 86_400_000;

    const inPeriodMs = (ms: number, periodType: string): boolean => {
      if (periodType === "all") return true;
      if (!Number.isFinite(ms)) return true;
      switch (periodType) {
        case "today": {
          const d = new Date(ms);
          return (
            d.getFullYear() === startOfToday.getFullYear() &&
            d.getMonth() === startOfToday.getMonth() &&
            d.getDate() === startOfToday.getDate()
          );
        }
        case "7_days":
          return ms >= startTodayMs && ms <= end7Ms;
        case "14_days":
          return ms >= startTodayMs && ms <= end14Ms;
        case "over_30_days":
          return ms > startOver30Ms;
        default:
          return true;
      }
    };

    const next: OTIFRecord[] = [];
    let miss = 0;
    let hit = 0;

    for (const o of orders) {
      const { req, so } = getOrderDateTimes(o, cache);
      if (!inPeriodMs(req, selectedPeriod)) continue;
      if (!inPeriodMs(so, selectedCreationPeriod)) continue;
      next.push(o);
      if (o.status === "Miss") miss++;
      else hit++;
    }

    const total = next.length;
    if (total === 0) {
      return { filteredOrders: next, filteredSummary: summary };
    }

    return {
      filteredOrders: next,
      filteredSummary: {
        ...summary,
        totalOrders: total,
        otifMiss: miss,
        otifHit: hit,
        missRate: total > 0 ? Math.round((miss / total) * 1000) / 10 : 0,
      },
    };
  }, [orders, summary, selectedPeriod, selectedCreationPeriod]);



  const setPeriod = useCallback((value: string) => {
    startFilterTransition(() => setSelectedPeriod(value));
  }, [startFilterTransition]);
  const setCreationPeriod = useCallback((value: string) => {
    startFilterTransition(() => setSelectedCreationPeriod(value));
  }, [startFilterTransition]);

  const handleExportSummary = () => {
    if (!summary) return;
    const data = {
      "Total Orders": displaySummary.totalOrders,
      "OTIF Miss": displaySummary.otifMiss,
      "OTIF Hit": displaySummary.otifHit,
      "Miss Rate": `${displaySummary.missRate}%`,
      "Timestamp": new Date(summary.lastUpdated).toISOString(),
      "Req. Delivery Date": selectedPeriod,
      "SO Create Date": selectedCreationPeriod,
    };
    const csvContent = Object.entries(data).map(([k, v]) => `${k},"${v}"`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "otif_dashboard_summary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const { records: storeRecords, filename: pendingFilename } = getDashboardData();
  const awaitingStoreHydration = storeRecords.length > 0 && orders.length === 0;
  const showDashboardLoading = loading || awaitingStoreHydration;

  if (showDashboardLoading) {
    return (
      <AppLayout>
        <div
          className="flex min-h-[60vh] flex-col items-center justify-center px-8"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" aria-hidden />
          <h2 className="text-xl font-semibold text-foreground">Loading dashboard…</h2>
          <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
            {pendingFilename ? (
              <>
                Importing <span className="font-medium text-foreground/90">{pendingFilename}</span> and
                building your metrics.
              </>
            ) : (
              "Preparing your OTIF metrics and order list."
            )}
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!summary || orders.length === 0) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-8">
          <Package className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">No data loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload and load a CSV file from the Document Repository to view the dashboard.
          </p>
        </div>
      </AppLayout>
    );
  }

  const displaySummary = (() => {
    const ordersToSum = tableFilteredOrders ?? filteredOrders;
    const total = ordersToSum.length;
    let miss = 0;
    for (const o of ordersToSum) {
      if (o.status === "Miss") miss++;
    }
    const hit = total - miss;
    return {
      ...summary,
      totalOrders: total,
      otifMiss: miss,
      otifHit: hit,
      missRate: total > 0 ? Math.round((miss / total) * 1000) / 10 : 0,
    };
  })();
  const totalN = displaySummary.totalOrders;
  const missN = displaySummary.otifMiss;
  const hitN = displaySummary.otifHit;
  const missPct = displaySummary.missRate;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-bold text-foreground">OTIF Risk Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Updated: {new Date(summary.lastUpdated).toLocaleString()}
            </span>
            <Button variant="outline" size="sm" onClick={handleExportSummary}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export Summary
            </Button>
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-3">
          <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
          <div
            className="relative inline-flex w-full max-w-2xl shrink-0 gap-1 rounded-2xl border border-border/60 bg-card/45 p-1 shadow-sm backdrop-blur-xl dark:border-white/[0.08] dark:bg-black/35 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)]"
            role="tablist"
            aria-label="Dashboard views"
          >
            <div
              className="pointer-events-none absolute left-1 top-1 bottom-1 rounded-xl border border-primary/25 bg-primary/15 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.45)] backdrop-blur-md transition-transform duration-300 ease-smooth dark:border-primary/30 dark:bg-primary/20"
              style={{
                /* Match each tab: (track − horizontal padding − gap) / 2 = (100% − 3×p-1) / 2 */
                width: "calc((100% - 0.75rem) / 2)",
                transform:
                  activeTab === "dashboard"
                    ? "translateX(0)"
                    : "translateX(calc(100% + 0.25rem))",
              }}
            />
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                activeTab === "dashboard"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="whitespace-nowrap">OTIF Risk Dashboard</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "analytics"}
              onClick={() => setActiveTab("analytics")}
              className={cn(
                "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                activeTab === "analytics"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="whitespace-nowrap">OTIF Prediction Analytics</span>
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFiltersTrayOpen((o) => !o)}
            aria-expanded={filtersTrayOpen}
            aria-controls="manage-filters-panel"
            id="active-filters-summary-trigger"
            className={cn(
              "shrink-0 self-end gap-1.5 rounded-xl border-border/70 font-medium shadow-sm md:self-center",
              filtersTrayOpen &&
                "border-primary/40 bg-primary/[0.08] text-primary shadow-sm dark:border-primary/35 dark:bg-primary/[0.12] dark:text-primary",
            )}
          >
            Active filters
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 opacity-70 transition-transform duration-200",
                filtersTrayOpen && "rotate-180",
              )}
              aria-hidden
            />
          </Button>
          </div>

          <div
            className={cn(
              "grid w-full transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none",
              filtersTrayOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                id="manage-filters-panel"
                role="region"
                aria-labelledby="active-filters-summary-trigger"
                className={cn(
                  "rounded-lg border border-neutral-200/90 bg-background px-3 pb-3 pt-2 dark:border-border/80 dark:bg-card",
                  filtersTrayOpen && "border-neutral-300/90 dark:border-border",
                )}
              >
                  <p className="mb-3 text-xs font-medium text-[#6B7280] dark:text-neutral-500">Adjust date filters</p>
                  <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#6B7280] dark:text-neutral-400">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>Req. Delivery Date</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {periods.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPeriod(p.value)}
                            className={cn(
                              "h-8 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors duration-200 ease-in-out",
                              selectedPeriod === p.value
                                ? "border-primary/35 bg-primary/[0.08] text-[hsl(155_24%_28%)] dark:border-primary/40 dark:bg-primary/[0.12] dark:text-primary/90"
                                : "border-neutral-200 bg-background text-[#6B7280] hover:bg-neutral-100 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/80",
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="hidden h-full min-h-[2.5rem] w-px shrink-0 bg-neutral-200 sm:block dark:bg-border" />

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#6B7280] dark:text-neutral-400">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>SO Create Date</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {periods.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setCreationPeriod(p.value)}
                            className={cn(
                              "h-8 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors duration-200 ease-in-out",
                              selectedCreationPeriod === p.value
                                ? "border-primary/35 bg-primary/[0.08] text-[hsl(155_24%_28%)] dark:border-primary/40 dark:bg-primary/[0.12] dark:text-primary/90"
                                : "border-neutral-200 bg-background text-[#6B7280] hover:bg-neutral-100 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/80",
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {token ? (
                    <div className="mt-4 flex flex-col gap-3 border-t border-neutral-200/90 pt-3 dark:border-border/80">
                      <div className="flex flex-wrap items-center gap-2">
                        <Popover open={favDropdownOpen} onOpenChange={setFavDropdownOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              type="button"
                              className="h-8 gap-1.5 rounded-md border-neutral-200 bg-background px-2.5 text-xs font-medium text-[#6B7280] shadow-none hover:bg-neutral-50 dark:border-border dark:text-neutral-400 dark:hover:bg-muted/60"
                            >
                              <Star className="h-3.5 w-3.5 fill-yellow-500/15 text-yellow-600/90" />
                              Saved Filters
                              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            side="bottom"
                            sideOffset={6}
                            className="z-50 w-64 rounded-md border border-neutral-200 p-1.5 shadow-sm dark:border-border"
                          >
                            {favorites.length === 0 ? (
                              <div className="px-3 py-4 text-center text-sm text-[#6B7280]">No saved filters yet</div>
                            ) : (
                              <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
                                {favorites.map((fav) => (
                                  <div
                                    key={fav.id}
                                    className="group flex items-center justify-between gap-2 rounded-md px-1 py-0.5"
                                  >
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-left text-sm font-medium transition-colors hover:bg-neutral-100 dark:hover:bg-muted/80"
                                      onClick={() => handleApplyFavorite(fav)}
                                    >
                                      {fav.name}
                                    </button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0 text-[#6B7280] opacity-0 transition-all group-hover:opacity-100 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-muted"
                                      onClick={(e) => handleDeleteFavorite(e, fav.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>

                        {!showSaveFav ? (
                          <Button
                            variant="ghost"
                            type="button"
                            className="h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium text-[#6B7280] shadow-none hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-muted/80 dark:hover:text-foreground"
                            onClick={() => setShowSaveFav(true)}
                          >
                            <Save className="h-3.5 w-3.5" />
                            Save Current
                          </Button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              autoFocus
                              placeholder="Filter name…"
                              value={newFavName}
                              onChange={(e) => setNewFavName(e.target.value)}
                              className="h-8 w-40 rounded-md border-neutral-200 px-2.5 text-xs dark:border-border"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveFavorite();
                                if (e.key === "Escape") setShowSaveFav(false);
                              }}
                            />
                            <Button type="button" className="h-8 rounded-md px-3 text-xs font-medium shadow-sm" onClick={handleSaveFavorite}>
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 rounded-md px-2.5 text-xs font-medium text-[#6B7280] hover:bg-neutral-100 dark:hover:bg-muted/80"
                              onClick={() => setShowSaveFav(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

        <div className="animate-fade-in">
          <div
            className={cn(activeTab !== "dashboard" && "hidden")}
            aria-hidden={activeTab !== "dashboard"}
          >
            {/* KPI Cards */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div onPointerEnter={() => setDistributionPopover(null)}>
                <KPICard
                  label="Total Orders"
                  value={totalN}
                  description="Orders evaluated"
                  calculation={`Count of orders after Req. Delivery and SO Create date filters.\n= ${totalN.toLocaleString()} rows in the table below.`}
                  icon={Package}
                  variant="default"
                />
              </div>
              <HoverCard
                open={distributionPopover === "miss"}
                onOpenChange={(open) => handleDistributionPopoverChange("miss", open)}
                openDelay={120}
                closeDelay={0}
              >
                <HoverCardTrigger asChild>
                  <div className="min-h-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <KPICard
                      label="OTIF Miss Prediction"
                      value={missN}
                      description="Predicted to miss delivery"
                      calculation={`Orders with model prediction status "Miss" in the filtered set.\n= ${missN.toLocaleString()} of ${totalN.toLocaleString()} orders.`}
                      icon={XCircle}
                      variant="risk"
                    />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="start" className="w-[min(22rem,calc(100vw-2rem))] p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">OTIF distribution (filtered)</p>
                  <OTIFDistributionChartInline summary={displaySummary} height={150} />
                </HoverCardContent>
              </HoverCard>
              <HoverCard
                open={distributionPopover === "hit"}
                onOpenChange={(open) => handleDistributionPopoverChange("hit", open)}
                openDelay={120}
                closeDelay={0}
              >
                <HoverCardTrigger asChild>
                  <div className="min-h-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <KPICard
                      label="OTIF Hit Prediction"
                      value={hitN}
                      description="Predicted on-time delivery"
                      calculation={`Orders with prediction status "Hit", or all non-Miss rows.\n= ${totalN.toLocaleString()} − ${missN.toLocaleString()} = ${hitN.toLocaleString()}.`}
                      icon={CheckCircle}
                      variant="success"
                    />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="start" className="w-[min(22rem,calc(100vw-2rem))] p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">OTIF distribution (filtered)</p>
                  <OTIFDistributionChartInline summary={displaySummary} height={150} />
                </HoverCardContent>
              </HoverCard>
              <HoverCard
                open={distributionPopover === "rate"}
                onOpenChange={(open) => handleDistributionPopoverChange("rate", open)}
                openDelay={120}
                closeDelay={0}
              >
                <HoverCardTrigger asChild>
                  <div className="min-h-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <KPICard
                      label="Miss Rate Prediction"
                      value={`${missPct}%`}
                      description="Share of orders predicted to miss"
                      calculation={`(Miss count ÷ Total orders) × 100, one decimal.\n= (${missN} ÷ ${totalN}) × 100 = ${missPct}%.`}
                      icon={TrendingDown}
                      variant="info"
                    />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="start" className="w-[min(22rem,calc(100vw-2rem))] p-3">
                  <p className="mb-2 text-xs font-semibold text-foreground">OTIF distribution (filtered)</p>
                  <OTIFDistributionChartInline summary={displaySummary} height={150} />
                </HoverCardContent>
              </HoverCard>
            </div>

            {/* Order Table */}
            <OrderTable
              orders={filteredOrders}
              rawHeaders={getDashboardData().rawHeaders}
              onOrderClick={handleOrderClick}
              pageSize={orderTablePageSize}
              onPageSizeChange={setOrderTablePageSize}
              drillFilter={orderTableDrill}
              onDrillFilterApplied={handleOrderTableDrillApplied}
              onFilteredOrdersChange={setTableFilteredOrders}
            />

            {/* Order Detail Modal */}
            {selectedOrder && (
              <OrderDetailModal
                detail={detail}
                loading={detailLoading}
                onClose={() => { setDetail(null); setSelectedOrder(null); }}
              />
            )}
          </div>

          {analyticsMounted ? (
            <div
              className={cn(activeTab !== "analytics" && "hidden")}
              aria-hidden={activeTab !== "analytics"}
            >
              <Suspense
                fallback={
                  <div className="py-20 text-center text-sm text-muted-foreground">Loading analytics…</div>
                }
              >
                <OTIFAnalyticsPanel
                  orders={tableFilteredOrders ?? filteredOrders}
                  onDrillToOrderTable={(payload) => {
                    setActiveTab("dashboard");
                    setOrderTableDrill(payload);
                  }}
                />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}