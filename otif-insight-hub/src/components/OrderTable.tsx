import { useState, useMemo } from "react";
import { Search, Download, ArrowUpDown, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OTIFRecord } from "@/types/otif";

interface OrderTableProps {
  orders: OTIFRecord[];
  onOrderClick: (order: OTIFRecord) => void;
}

type SortKey = "salesOrder" | "customer" | "material" | "plant" | "reqDelivery" | "riskScore" | "status";

export function OrderTable({ orders, onOrderClick }: OrderTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      // Cycle: desc → asc → clear
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortBy(null); // clear sort, return to original order
      }
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = [...orders];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) => {
        const haystack = [
          o.salesOrder,
          o.customer,
          o.material,
          o.plant,
          o.reqDelivery,
          o.leadTime,
          o.status,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    if (sortBy) {
      result.sort((a, b) => {
        let aVal: string | number = a[sortBy] ?? "";
        let bVal: string | number = b[sortBy] ?? "";
        if (sortBy === "riskScore") {
          aVal = a.riskScore;
          bVal = b.riskScore;
        }
        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [orders, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleExport = () => {
    const headers = "Sales Order,Customer,Material,Plant,Req Delivery,Lead Time,Risk Score,Status\n";
    const rows = filtered.map(o => `${o.salesOrder},${o.customer},${o.material},${o.plant},${o.reqDelivery},${o.leadTime},${o.riskScore},${o.status}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "otif_orders_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th className="pb-3 pr-4 text-left">
      <button onClick={() => toggleSort(sortKey)} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {sortBy === sortKey && <ChevronDown className={`h-3 w-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />}
      </button>
    </th>
  );

  // Human-readable labels for SHAP feature names
  const SHAP_FEATURE_LABELS: Record<string, string> = {
    f_lead_gap_days: "Lead Time Gap",
    f_request_lead_days: "Request Lead Days",
    f_material_lead_days: "Material Lead Days",
    f_so_to_rdd_days: "SO to Delivery Days",
    f_so_to_mat_avail_days_from_dates: "SO to Material Avail Days",
    f_mat_avail_to_rdd_days: "Material Avail to Delivery Days",
    f_mat_ready_after_rdd: "Material Ready After Delivery",
    f_tight_ratio: "Lead Time Tightness Ratio",
    f_is_tight_order: "Tight Order Flag",
    f_is_extremely_tight: "Extremely Tight Order",
    f_critical_negative_gap: "Critical Negative Gap",
    f_mild_negative_gap: "Mild Negative Gap",
    f_large_positive_gap: "Large Positive Gap",
    f_unit_price_log: "Unit Price (Log)",
    f_qty_log: "Order Quantity (Log)",
    f_high_qty_flag: "High Quantity Flag",
    f_high_value_flag: "High Value Flag",
    f_high_value_x_tight: "High Value x Tight Order",
    f_customer_miss_rate: "Customer Miss Rate",
    f_material_miss_rate: "Material Miss Rate",
    f_plant_miss_rate: "Plant Miss Rate",
    f_bu_miss_rate: "Business Unit Miss Rate",
    f_mat_shipto_miss_rate: "Material-Customer Miss Rate",
    f_plant_material_miss_rate: "Plant-Material Miss Rate",
    f_plant_shipto_miss_rate: "Plant-Customer Miss Rate",
    f_state_miss_rate: "State Miss Rate",
    f_plant_orders_7d: "Plant Orders (7 day)",
    f_plant_orders_30d: "Plant Orders (30 day)",
    f_material_orders_7d: "Material Orders (7 day)",
    f_material_orders_30d: "Material Orders (30 day)",
    f_shipto_orders_7d: "Ship-To Orders (7 day)",
    f_shipto_orders_30d: "Ship-To Orders (30 day)",
    f_mat_total_orders_log: "Material Total Orders (Log)",
    f_tolerance_band: "Tolerance Band",
    f_strict_tolerance: "Strict Tolerance",
    f_strict_x_tight: "Strict Tolerance x Tight",
    f_tolerance_x_gap: "Tolerance x Gap",
    f_gap_x_load: "Gap x Load",
    f_tight_x_plant_load: "Tight x Plant Load",
    f_strict_x_plant_miss_rate: "Strict x Plant Miss Rate",
    f_mat_shipto_x_pressure: "Material-Customer x Pressure",
    f_high_plant_risk: "High Plant Risk",
    f_risk_stack: "Risk Stack",
    f_otif_risk_score: "OTIF Risk Score",
    f_gap_bin: "Gap Bin",
    f_congestion: "Node Congestion",
    f_line_count: "Line Count",
    f_miss_rate: "Historical Miss Rate",
    f_tolerance: "Tolerance",
    f_so_woy_sin: "SO Week-of-Year (sin)",
    f_so_woy_cos: "SO Week-of-Year (cos)",
    f_rdd_woy_sin: "Delivery Week-of-Year (sin)",
    f_rdd_woy_cos: "Delivery Week-of-Year (cos)",
  };

  const translateFeatureName = (name: string): string => {
    const key = name.trim().toLowerCase();
    // Exact match first
    if (SHAP_FEATURE_LABELS[key]) return SHAP_FEATURE_LABELS[key];
    // Try with f_ prefix
    if (SHAP_FEATURE_LABELS[`f_${key}`]) return SHAP_FEATURE_LABELS[`f_${key}`];
    // Fallback: replace underscores and title-case
    return name.replace(/^f_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getRiskSignals = (order: OTIFRecord): string => {
    // Use SHAP-based signals from CSV if available, translated to human-readable names
    if (order.riskSignals) {
      return order.riskSignals
        .split(";")
        .map((s) => translateFeatureName(s.trim()))
        .join("; ");
    }
    // Fallback to simple heuristics
    const signals: string[] = [];
    if (order.riskScore >= 80) signals.push("High probability of delay");
    if (order.status === "Miss") signals.push("Historical Miss pattern");
    if (signals.length === 0) signals.push("No significant risk factors");
    return signals.join("; ");
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm animate-fade-in">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Order-Level OTIF Assessment</h3>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export
        </Button>
      </div>

      <div className="px-6 py-3">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {pageOrders.length} of {filtered.length} orders
        </p>
      </div>

      <div className="overflow-auto px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <SortHeader label="Sales Order" sortKey="salesOrder" />
              <SortHeader label="Customer" sortKey="customer" />
              <SortHeader label="Material" sortKey="material" />
              <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Plant</th>
              <SortHeader label="Req. Delivery" sortKey="reqDelivery" />
              <SortHeader label="Risk Score" sortKey="riskScore" />
              <SortHeader label="Status" sortKey="status" />
              <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Risk Signals</th>
            </tr>
          </thead>
          <tbody>
            {pageOrders.map((o) => (
              <tr
                key={o.salesOrder + o.rowNum}
                className="cursor-pointer border-b border-border/50 hover:bg-muted/30 transition-colors"
                onClick={() => onOrderClick(o)}
              >
                <td className="py-3.5 pr-4 font-medium text-primary">{o.salesOrder}</td>
                <td className="py-3.5 pr-4">{o.customer}</td>
                <td className="py-3.5 pr-4">{o.material}</td>
                <td className="py-3.5 pr-4">{o.plant}</td>
                <td className="py-3.5 pr-4">{o.reqDelivery}</td>
                <td className="py-3.5 pr-4 font-semibold">{o.riskScore}%</td>
                <td className="py-3.5 pr-4">
                  <span
                    className={`${o.status === "Hit" ? "status-hit" : "status-miss"} inline-flex items-center justify-center whitespace-nowrap`}
                  >
                    OTIF {o.status}
                  </span>
                </td>
                <td className="max-w-[200px] py-3.5 text-xs text-muted-foreground">{getRiskSignals(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-6 py-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
