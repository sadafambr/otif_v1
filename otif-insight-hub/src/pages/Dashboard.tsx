import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { KPICard } from "@/components/KPICard";
import { OTIFChart } from "@/components/OTIFChart";
import { OrderTable } from "@/components/OrderTable";
import { OrderDetailModal } from "@/components/OrderDetailModal";
import { useDashboard, useOrderDetail } from "@/hooks/useOTIF";
import { getDashboardData } from "@/lib/dataStore";
import { Package, XCircle, CheckCircle, TrendingDown, RefreshCw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OTIFRecord, PeriodFilter } from "@/types/otif";

const periods: PeriodFilter[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "This Quarter", value: "quarter" },
];

export default function Dashboard() {
  const { summary, orders, loading, loadDashboard, refresh } = useDashboard();
  const { detail, loading: detailLoading, fetchDetail, setDetail } = useOrderDetail();
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<OTIFRecord | null>(null);

  // Load data from in-memory store
  useEffect(() => {
    const { records, rawHeaders } = getDashboardData();
    if (records.length > 0 && orders.length === 0) {
      loadDashboard(records);
    }
  }, []);

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

  const filteredOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const isInPeriod = (reqDelivery: string) => {
      if (selectedPeriod === "all") return true;
      const date = new Date(reqDelivery);
      if (Number.isNaN(date.getTime())) return true;

      switch (selectedPeriod) {
        case "today": {
          return (
            date.getFullYear() === startOfToday.getFullYear() &&
            date.getMonth() === startOfToday.getMonth() &&
            date.getDate() === startOfToday.getDate()
          );
        }
        case "week": {
          const dayOfWeek = startOfToday.getDay();
          const diffToMonday = (dayOfWeek + 6) % 7;
          const monday = new Date(startOfToday);
          monday.setDate(startOfToday.getDate() - diffToMonday);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          return date >= monday && date <= sunday;
        }
        case "month": {
          return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
          );
        }
        case "quarter": {
          const currentQuarter = Math.floor(now.getMonth() / 3);
          const quarterStartMonth = currentQuarter * 3;
          const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
          const quarterEnd = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
          return date >= quarterStart && date <= quarterEnd;
        }
        default:
          return true;
      }
    };

    return orders.filter((o) => isInPeriod(o.reqDelivery));
  }, [orders, selectedPeriod]);

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
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Period filters */}
        <div className="mb-6 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="mr-1 text-sm text-muted-foreground">Period</span>
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setSelectedPeriod(p.value)}
              className={selectedPeriod === p.value ? "filter-chip-active" : "filter-chip-inactive"}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Total Orders" value={filteredSummary?.totalOrders ?? summary.totalOrders} description="Orders evaluated" icon={Package} variant="default" />
          <KPICard label="OTIF Miss" value={filteredSummary?.otifMiss ?? summary.otifMiss} description="Predicted to miss delivery" icon={XCircle} variant="risk" />
          <KPICard label="OTIF Hit" value={filteredSummary?.otifHit ?? summary.otifHit} description="Predicted on-time delivery" icon={CheckCircle} variant="success" />
          <KPICard label="Miss Rate" value={`${filteredSummary?.missRate ?? summary.missRate}%`} description="Orders predicted to miss" icon={TrendingDown} variant="info" />
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
