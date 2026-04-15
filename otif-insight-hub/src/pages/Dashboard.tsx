import { useState, useEffect, useMemo, useTransition, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AppLayout } from "@/components/AppLayout";
import { KPICard } from "@/components/KPICard";
import { OTIFChart } from "@/components/OTIFChart";
import { OrderTable } from "@/components/OrderTable";
import { OrderDetailModal } from "@/components/OrderDetailModal";
import { OTIFAnalyticsPanel } from "@/components/OTIFAnalyticsPanel";
import { useDashboard, useOrderDetail } from "@/hooks/useOTIF";
import { getDashboardData } from "@/lib/dataStore";
import { cn } from "@/lib/utils";
import { fetchFavorites, saveFavorite, deleteFavorite, type FavoriteFilter } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Package, XCircle, CheckCircle, TrendingDown, Calendar, ChevronDown, ChevronUp, Download, Star, Trash2, Save, LayoutDashboard, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OTIFRecord, PeriodFilter } from "@/types/otif";

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

  const { token } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteFilter[]>([]);
  const [newFavName, setNewFavName] = useState("");
  const [showSaveFav, setShowSaveFav] = useState(false);
  const [favDropdownOpen, setFavDropdownOpen] = useState(false);
  const [filtersTrayOpen, setFiltersTrayOpen] = useState(false);

  const hasCustomGlobalFilters = useMemo(
    () => selectedPeriod !== "all" || selectedCreationPeriod !== "all",
    [selectedPeriod, selectedCreationPeriod],
  );

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
    if (!filtersTrayOpen) return;
    const prevBody = document.body.style.overflow;
    const main = document.querySelector("main");
    const prevMain = main ? (main as HTMLElement).style.overflow : "";
    document.body.style.overflow = "hidden";
    if (main) (main as HTMLElement).style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      if (main) (main as HTMLElement).style.overflow = prevMain;
    };
  }, [filtersTrayOpen]);

  // Load data from in-memory store
  useEffect(() => {
    const { records, rawHeaders } = getDashboardData();
    if (records.length > 0 && orders.length === 0) {
      loadDashboard(records);
    }
  }, []);

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
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
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

  /** Predicted misses by customer (filtered dataset) for dashboard spotlight */
  const topCustomersByMiss = useMemo(() => {
    if (!filteredOrders.length) return [];
    const countMap = new Map<string, number>();
    for (const o of filteredOrders) {
      if (o.status !== "Miss") continue;
      const name = (o.customer || "").trim() || "(Unknown)";
      countMap.set(name, (countMap.get(name) || 0) + 1);
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [filteredOrders]);

  const setPeriod = useCallback((value: string) => {
    startFilterTransition(() => setSelectedPeriod(value));
  }, [startFilterTransition]);
  const setCreationPeriod = useCallback((value: string) => {
    startFilterTransition(() => setSelectedCreationPeriod(value));
  }, [startFilterTransition]);

  const handleExportSummary = () => {
    if (!summary) return;
    const data = {
      "Total Orders": filteredSummary?.totalOrders ?? summary.totalOrders,
      "OTIF Miss": filteredSummary?.otifMiss ?? summary.otifMiss,
      "OTIF Hit": filteredSummary?.otifHit ?? summary.otifHit,
      "Miss Rate": `${filteredSummary?.missRate ?? summary.missRate}%`,
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

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-bold text-foreground">OTIF Risk Dashboard</h1>
            <p className="text-sm text-muted-foreground">Supply Chain Delivery Risk Intelligence</p>
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

        {/* Tabs + compact active filters (chips live in popover) */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div
            className="relative inline-flex w-full max-w-2xl flex-1 gap-1 rounded-2xl border border-border/60 bg-card/45 p-1 shadow-sm backdrop-blur-xl dark:border-white/[0.08] dark:bg-black/35 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)]"
            role="tablist"
            aria-label="Dashboard views"
          >
            <div
              className="pointer-events-none absolute left-1 top-1 bottom-1 rounded-xl border border-primary/25 bg-primary/15 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.45)] backdrop-blur-md transition-transform duration-300 ease-smooth dark:border-primary/30 dark:bg-primary/20"
              style={{
                width: "calc((100% - 0.25rem) / 2)",
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

          <button
            type="button"
            onClick={() => setFiltersTrayOpen((o) => !o)}
            className={cn(
              "inline-flex h-[42px] shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3.5 shadow-sm backdrop-blur-md transition-[border-color,box-shadow,background-color,transform] duration-300 ease-out hover:bg-background active:scale-[0.98] dark:border-white/[0.12] dark:bg-black/40 dark:hover:bg-black/55 sm:px-4",
              filtersTrayOpen && "border-primary/35 bg-primary/[0.07] shadow-[0_0_20px_-8px_hsl(var(--primary)/0.35)] dark:bg-primary/[0.12]",
            )}
            aria-expanded={filtersTrayOpen}
            aria-haspopup="dialog"
            aria-controls="manage-filters-popup"
          >
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="max-w-[7.5rem] truncate text-sm font-semibold text-foreground sm:max-w-none">
              Active Filters
            </span>
            {hasCustomGlobalFilters && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.55)]"
                title="Non-default filters"
              />
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
                filtersTrayOpen && "rotate-180",
              )}
            />
          </button>
        </div>

        {typeof document !== "undefined" &&
          filtersTrayOpen &&
          createPortal(
            <>
              <div
                className="active-filters-overlay fixed inset-0 z-[200] bg-black/40 dark:bg-black/55"
                aria-hidden
                onClick={() => setFiltersTrayOpen(false)}
              />
              <div
                id="manage-filters-popup"
                role="dialog"
                aria-modal="true"
                aria-labelledby="manage-filters-popup-title"
                className="active-filters-popup-panel glass-popover fixed z-[201] flex max-h-[min(calc(100vh-1.25rem),90vh)] w-[min(42rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl dark:border-white/[0.12]"
                style={{
                  top: "max(0.75rem, env(safe-area-inset-top, 0px))",
                  right: "max(0.75rem, env(safe-area-inset-right, 0px))",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3 dark:border-white/[0.08]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <h2 id="manage-filters-popup-title" className="truncate text-sm font-semibold text-foreground">
                      Manage filters
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersTrayOpen(false)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                    aria-label="Close manage filters"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-center">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="mr-1 whitespace-nowrap text-[13px] font-medium text-muted-foreground">Req. Delivery Date</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {periods.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPeriod(p.value)}
                            className={selectedPeriod === p.value ? "filter-chip-active whitespace-nowrap" : "filter-chip-inactive whitespace-nowrap"}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="hidden h-6 w-px shrink-0 bg-border/60 dark:bg-white/[0.1] xl:block" />

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="mr-1 whitespace-nowrap text-[13px] font-medium text-muted-foreground">SO Create Date</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {periods.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setCreationPeriod(p.value)}
                            className={selectedCreationPeriod === p.value ? "filter-chip-active whitespace-nowrap" : "filter-chip-inactive whitespace-nowrap"}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {token ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-4 border-t border-border/40 pt-4 dark:border-white/[0.08]">
                      <div className="flex flex-wrap items-center gap-1.5">
                          <Popover open={favDropdownOpen} onOpenChange={setFavDropdownOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                type="button"
                                className="h-8 gap-1.5 rounded-full border-border/60 bg-background/30 px-3 text-[13px] font-medium text-muted-foreground backdrop-blur-sm dark:border-white/[0.12] dark:bg-white/[0.06]"
                              >
                                <Star className="h-3.5 w-3.5 fill-yellow-500/20 text-yellow-500" />
                                Saved Filters
                                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="bottom"
                              sideOffset={6}
                              className="z-[230] w-64 border-border/60 p-1.5 dark:border-white/[0.1]"
                            >
                              {favorites.length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-muted-foreground">No saved filters yet</div>
                              ) : (
                                <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
                                  {favorites.map((fav) => (
                                    <div
                                      key={fav.id}
                                      className="group flex items-center justify-between gap-2 rounded-md px-1 py-0.5"
                                    >
                                      <button
                                        type="button"
                                        className="min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
                                        onClick={() => handleApplyFavorite(fav)}
                                      >
                                        {fav.name}
                                      </button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-destructive"
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
                              className="h-8 gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                              onClick={() => setShowSaveFav(true)}
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save Current
                            </Button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5 animate-in duration-200 slide-in-from-left-2">
                              <Input
                                autoFocus
                                placeholder="Filter name..."
                                value={newFavName}
                                onChange={(e) => setNewFavName(e.target.value)}
                                className="h-8 w-40 rounded-full border-border px-3 text-[13px]"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveFavorite();
                                  if (e.key === "Escape") setShowSaveFav(false);
                                }}
                              />
                              <Button type="button" className="h-8 rounded-full px-3 text-[13px] font-medium" onClick={handleSaveFavorite}>
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
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
            </>,
            document.body,
          )}

        <div key={activeTab} className="animate-fade-in">
        {activeTab === "analytics" ? (
          <OTIFAnalyticsPanel orders={filteredOrders} />
        ) : (
        <>
        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Total Orders" value={filteredSummary?.totalOrders ?? summary.totalOrders} description="Orders evaluated" icon={Package} variant="default" />
          <KPICard label="OTIF Miss Prediction" value={filteredSummary?.otifMiss ?? summary.otifMiss} description="Predicted to miss delivery" icon={XCircle} variant="risk" />
          <KPICard label="OTIF Hit Prediction" value={filteredSummary?.otifHit ?? summary.otifHit} description="Predicted on-time delivery" icon={CheckCircle} variant="success" />
          <KPICard label="Miss Rate Prediction" value={`${filteredSummary?.missRate ?? summary.missRate}%`} description="Orders predicted to miss" icon={TrendingDown} variant="info" />
        </div>

        <div className="mb-6 rounded-xl border border-border/60 bg-card/40 p-5 shadow-sm backdrop-blur-sm dark:border-white/[0.08]">
          <div className="mb-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Customer focus</h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Customers with the most predicted OTIF misses in the current date filters (sorted by total misses)
          </p>
          {topCustomersByMiss.length === 0 ? (
            <p className="text-sm text-muted-foreground">No predicted misses in this selection.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {topCustomersByMiss.map(([custName, missCount], i) => (
                <div
                  key={`${custName}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-foreground" title={custName}>
                    {custName}
                  </span>
                  <span className="shrink-0 tabular-nums text-sm font-semibold text-destructive">
                    {missCount.toLocaleString()} <span className="font-normal text-muted-foreground">miss</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="mb-6">
          <OTIFChart summary={filteredSummary ?? summary} />
        </div>

        {/* Order Table */}
        <OrderTable
          orders={filteredOrders}
          rawHeaders={getDashboardData().rawHeaders}
          onOrderClick={handleOrderClick}
        />

        {/* Order Detail Modal */}
        {selectedOrder && (
          <OrderDetailModal
            detail={detail}
            loading={detailLoading}
            onClose={() => { setDetail(null); setSelectedOrder(null); }}
          />
        )}
        </>
        )}
        </div>
      </div>
    </AppLayout>
  );
}