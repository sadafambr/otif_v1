import { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { KPICard } from "@/components/KPICard";
import { OTIFChart } from "@/components/OTIFChart";
import { OrderTable } from "@/components/OrderTable";
import { OrderDetailModal } from "@/components/OrderDetailModal";
import { useDashboard, useOrderDetail } from "@/hooks/useOTIF";
import { getDashboardData } from "@/lib/dataStore";
import { fetchFavorites, saveFavorite, deleteFavorite, type FavoriteFilter } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Package, XCircle, CheckCircle, TrendingDown, Calendar, MapPin, Globe, ChevronDown, Download, Star, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OTIFRecord, PeriodFilter } from "@/types/otif";

const periods: PeriodFilter[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7_days" },
  { label: "14 Days", value: "14_days" },
  { label: "> 30 Days", value: "over_30_days" },
];

const regions = [
  { label: "NAM", value: "NAM" },
  { label: "EUR", value: "EUR" },
  { label: "APAC", value: "APAC" },
  { label: "LATAM", value: "LATAM" },
] as const;

export default function Dashboard() {
  const { summary, orders, loading, loadDashboard, refresh } = useDashboard();
  const { detail, loading: detailLoading, fetchDetail, setDetail } = useOrderDetail();
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedCreationPeriod, setSelectedCreationPeriod] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState<(typeof regions)[number]["value"]>("NAM");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedOrder, setSelectedOrder] = useState<OTIFRecord | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const { token } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteFilter[]>([]);
  const [newFavName, setNewFavName] = useState("");
  const [showSaveFav, setShowSaveFav] = useState(false);
  const [favDropdownOpen, setFavDropdownOpen] = useState(false);
  const favDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false);
      }
      if (favDropdownRef.current && !favDropdownRef.current.contains(e.target as Node)) {
        setFavDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // If Region changes away from NAM, clear country filter (and close dropdown)
  useEffect(() => {
    if (selectedRegion !== "NAM") {
      setSelectedCountry("all");
      setCountryDropdownOpen(false);
    }
  }, [selectedRegion]);

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
      const state = JSON.stringify({ selectedPeriod, selectedCreationPeriod, selectedRegion, selectedCountry });
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
      if (state.selectedPeriod) setSelectedPeriod(state.selectedPeriod);
      if (state.selectedCreationPeriod) setSelectedCreationPeriod(state.selectedCreationPeriod);
      if (state.selectedRegion) setSelectedRegion(state.selectedRegion);
      if (state.selectedCountry) setSelectedCountry(state.selectedCountry);
    } catch (err) {
      console.error("Failed to parse favorite state", err);
    }
    setFavDropdownOpen(false);
  };

  const handleOrderClick = async (order: OTIFRecord) => {
    setSelectedOrder(order);
    await fetchDetail(order);
  };

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
      "Region": selectedRegion,
      "Countries": selectedCountry
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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  // Derive unique countries with counts, sorted by frequency (most first)
  const countriesWithCounts = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const countMap = new Map<string, number>();
    for (const o of orders) {
      const val = (o.rawData["country"] || "").trim();
      if (val) countMap.set(val, (countMap.get(val) || 0) + 1);
    }
    return Array.from(countMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const isInPeriod = (dateString: string, periodType: string) => {
      if (periodType === "all") return true;
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return true;

      switch (periodType) {
        case "today": {
          return (
            date.getFullYear() === startOfToday.getFullYear() &&
            date.getMonth() === startOfToday.getMonth() &&
            date.getDate() === startOfToday.getDate()
          );
        }
        case "7_days": {
          const end = new Date(startOfToday);
          end.setDate(end.getDate() + 7);
          return date >= startOfToday && date <= end;
        }
        case "14_days": {
          const end = new Date(startOfToday);
          end.setDate(end.getDate() + 14);
          return date >= startOfToday && date <= end;
        }
        case "over_30_days": {
          const start = new Date(startOfToday);
          start.setDate(start.getDate() + 30);
          return date > start;
        }
        default:
          return true;
      }
    };

    return orders.filter((o) => {
      if (!isInPeriod(o.reqDelivery, selectedPeriod)) return false;
      if (!isInPeriod(o.soCreateDate, selectedCreationPeriod)) return false;

      // Countries filter (only under NAM)
      if (selectedRegion === "NAM" && selectedCountry !== "all") {
        const country = (o.rawData["country"] || "").trim();
        if (country !== selectedCountry) return false;
      }

      return true;
    });
  }, [orders, selectedPeriod, selectedCreationPeriod, selectedRegion, selectedCountry]);

  const filteredSummary = useMemo(() => {
    if (!summary || filteredOrders.length === 0) return summary;
    const miss = filteredOrders.filter((r) => r.status === "Miss").length;
    const hit = filteredOrders.filter((r) => r.status === "Hit").length;
    const total = filteredOrders.length;
    return {
      ...summary,
      totalOrders: total,
      otifMiss: miss,
      otifHit: hit,
      missRate: total > 0 ? Math.round((miss / total) * 1000) / 10 : 0,
    };
  }, [summary, filteredOrders]);

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

        {/* Filters Section */}
        <div className="mb-6 relative z-10 rounded-xl border bg-card/50 backdrop-blur-sm">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className={`flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors ${
              filtersExpanded ? "rounded-t-xl" : "rounded-xl"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">Active Filters</span>
              {!filtersExpanded && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {selectedPeriod === "all" ? "All Time" : periods.find(p => p.value === selectedPeriod)?.label}
                  </span>
                  {selectedCreationPeriod !== "all" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      Created: {periods.find(p => p.value === selectedCreationPeriod)?.label}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {selectedRegion}
                  </span>
                  {selectedRegion === "NAM" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {selectedCountry === "all" ? "All Countries" : selectedCountry}
                    </span>
                  )}
                </div>
              )}
            </div>
            {filtersExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground rotate-180 transition-transform" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
            )}
          </button>
          
          {filtersExpanded && (
            <div className="flex flex-col gap-y-4 border-t p-4 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* Date Filters Row */}
              <div className="flex flex-nowrap items-center gap-x-4 gap-y-4 w-full">
                {/* Requested Delivery Date filters */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="mr-1 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Req. Delivery Date</span>
                  <div className="flex items-center gap-1.5">
                    {periods.map((p) => (
                      <button
                        key={p.value}
                        onClick={(e) => { e.stopPropagation(); setSelectedPeriod(p.value); }}
                        className={selectedPeriod === p.value ? "filter-chip-active whitespace-nowrap" : "filter-chip-inactive whitespace-nowrap"}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-border hidden xl:block shrink-0" />

                {/* SO Create Date filter */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="mr-1 text-[13px] font-medium text-muted-foreground whitespace-nowrap">SO Create Date</span>
                  <div className="flex items-center gap-1.5">
                    {periods.map((p) => (
                      <button
                        key={p.value}
                        onClick={(e) => { e.stopPropagation(); setSelectedCreationPeriod(p.value); }}
                        className={selectedCreationPeriod === p.value ? "filter-chip-active whitespace-nowrap" : "filter-chip-inactive whitespace-nowrap"}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Secondary Filters Row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
                {/* Region filter */}
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="mr-1 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Region</span>
                <div className="flex items-center gap-1.5">
                  {regions.map((r) => (
                    <button
                      key={r.value}
                      onClick={(e) => { e.stopPropagation(); setSelectedRegion(r.value); }}
                      className={selectedRegion === r.value ? "filter-chip-active" : "filter-chip-inactive"}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              {selectedRegion === "NAM" && countriesWithCounts.length > 0 && (
                <div className="h-6 w-px bg-border hidden sm:block shrink-0" />
              )}

              {/* Countries filter */}
              {selectedRegion === "NAM" && countriesWithCounts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="mr-1 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Countries</span>
                  <div className="relative" ref={countryDropdownRef}>
                    <button
                      id="filter-country"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setCountryDropdownOpen((prev) => !prev); }}
                      className={`region-select flex items-center gap-2 min-w-[140px] justify-between ${
                        selectedCountry === "all" ? "" : "filter-chip-active text-primary-foreground border-primary"
                      }`}
                    >
                      <span className="truncate max-w-[110px]">{selectedCountry === "all" ? "All Countries" : selectedCountry}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </button>
                    {countryDropdownOpen && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                        <button
                          type="button"
                          onClick={() => { setSelectedCountry("all"); setCountryDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-[13px] hover:bg-accent transition-colors ${
                            selectedCountry === "all" ? "bg-accent font-medium text-primary" : ""
                          }`}
                        >
                          <span>All Countries</span>
                        </button>
                        {countriesWithCounts.map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => { setSelectedCountry(c.name); setCountryDropdownOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-[13px] hover:bg-accent transition-colors ${
                              selectedCountry === c.name ? "bg-accent font-medium text-primary" : ""
                            }`}
                          >
                            <span>{c.name}</span>
                            <span className="text-xs text-muted-foreground">{c.count.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Favorites - only if token exists */}
              {token && (
                <>
                  <div className="h-6 w-px bg-border hidden sm:block shrink-0" />
                  
                  <div className="flex items-center gap-1.5">
                    <div className="relative" ref={favDropdownRef}>
                      <Button
                        variant="outline"
                        className="h-8 rounded-full px-3 text-[13px] font-medium gap-1.5 border-border text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setFavDropdownOpen((prev) => !prev); }}
                      >
                        <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500/20" />
                        Saved Filters
                        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                      
                      {favDropdownOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg p-1">
                          {favorites.length === 0 ? (
                            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                              No saved filters yet
                            </div>
                          ) : (
                            favorites.map((fav) => (
                              <div
                                key={fav.id}
                                className="group flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent rounded-md cursor-pointer transition-colors"
                                onClick={() => handleApplyFavorite(fav)}
                              >
                                <span className="font-medium truncate pr-2">{fav.name}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                                  onClick={(e) => handleDeleteFavorite(e, fav.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {!showSaveFav ? (
                      <Button
                        variant="ghost"
                        className="h-8 rounded-full px-3 text-[13px] font-medium gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowSaveFav(true)}
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save Current
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 slide-in-from-left-2 animate-in duration-200">
                        <Input
                          autoFocus
                          placeholder="Filter name..."
                          value={newFavName}
                          onChange={(e) => setNewFavName(e.target.value)}
                          className="h-8 rounded-full px-3 text-[13px] w-40 border-border"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveFavorite();
                            if (e.key === 'Escape') setShowSaveFav(false);
                          }}
                        />
                        <Button className="h-8 rounded-full px-3 text-[13px] font-medium" onClick={handleSaveFavorite}>
                          Save
                        </Button>
                        <Button variant="ghost" className="h-8 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowSaveFav(false)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
              </div>
            </div>
          )}
        </div>


        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Total Orders" value={filteredSummary?.totalOrders ?? summary.totalOrders} description="Orders evaluated" icon={Package} variant="default" />
          <KPICard label="OTIF Miss Prediction" value={filteredSummary?.otifMiss ?? summary.otifMiss} description="Predicted to miss delivery" icon={XCircle} variant="risk" />
          <KPICard label="OTIF Hit Prediction" value={filteredSummary?.otifHit ?? summary.otifHit} description="Predicted on-time delivery" icon={CheckCircle} variant="success" />
          <KPICard label="Miss Rate Prediction" value={`${filteredSummary?.missRate ?? summary.missRate}%`} description="Orders predicted to miss" icon={TrendingDown} variant="info" />
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
      </div>
    </AppLayout>
  );
}