import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Download, ArrowUpDown, ChevronDown, Columns2, ChevronUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnFilterCheckbox } from "@/components/ColumnFilterCheckbox";
import { ColumnFilterRange } from "@/components/ColumnFilterRange";
import { ColumnFilterDate } from "@/components/ColumnFilterDate";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Bookmark, RotateCcw, Save } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDisplayName, DEFAULT_COLUMN_KEYS, resolveDefaultColumn } from "@/lib/columnMapping";
import type { OTIFRecord } from "@/types/otif";

const COMPUTED_COLUMN_KEYS = ["leadTime", "riskScore", "status", "riskSignals"] as const;
const COMPUTED_DISPLAY_NAMES: Record<string, string> = {
  leadTime: "Lead Time",
  riskScore: "Risk Score",
  status: "Status",
  riskSignals: "Risk Signals",
};

interface OrderTableProps {
  orders: OTIFRecord[];
  rawHeaders?: string[];
  onOrderClick: (order: OTIFRecord) => void;
}

type SortKey = "salesOrder" | "customer" | "material" | "plant" | "reqDelivery" | "riskScore" | "status";

type ColumnLayoutState = {
  order?: string[];
  widths?: Record<string, number>;
};

const COLUMN_LAYOUT_STORAGE_KEY = "otif.orderTable.columnLayout.v1";
const MIN_COL_WIDTH = 80;

function safeReadLayout(): ColumnLayoutState | null {
  try {
    const raw = localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ColumnLayoutState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteLayout(next: ColumnLayoutState) {
  try {
    localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors (private mode, quotas, etc.)
  }
}

function getColumnDisplayName(key: string): string {
  return COMPUTED_DISPLAY_NAMES[key] ?? getDisplayName(key);
}

function getCellValue(order: OTIFRecord, columnKey: string): string | number {
  if (columnKey === "leadTime") return order.leadTime;
  if (columnKey === "riskScore") return order.riskScore;
  if (columnKey === "status") return order.status;
  if (columnKey === "riskSignals") {
    if (order.riskSignals) return order.riskSignals;
    const signals: string[] = [];
    if (order.riskScore >= 80) signals.push("High probability of delay");
    if (order.status === "Miss") signals.push("Historical Miss pattern");
    if (signals.length === 0) signals.push("No significant risk factors");
    return signals.join("; ");
  }
  return order.rawData?.[columnKey] ?? "";
}

export function OrderTable({ orders, rawHeaders, onOrderClick }: OrderTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Column resize + drag reorder
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const draggingKeyRef = useRef<string | null>(null);
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Available columns: from data or rawHeaders + computed
  const availableColumnKeys = useMemo(() => {
    const fromData =
      rawHeaders?.length ? rawHeaders : orders[0] ? Object.keys(orders[0].rawData || {}) : [];
    const computed = [...COMPUTED_COLUMN_KEYS];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const k of fromData) {
      const key = k.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(key);
      }
    }
    for (const k of computed) {
      if (!seen.has(k)) {
        seen.add(k);
        list.push(k);
      }
    }
    return list;
  }, [orders, rawHeaders]);

  // Visible columns in dataset order; init to full list when available columns change
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => []);
  useEffect(() => {
    if (availableColumnKeys.length === 0) return;
    const saved = safeReadLayout();
    const savedOrder = saved?.order?.filter((k) => availableColumnKeys.includes(k)) ?? [];
    const savedWidths = saved?.widths ?? {};

    setVisibleColumnKeys((prev) => {
      if (prev.length > 0) {
        // Keep only keys that are still available; apply saved order when present
        const stillVisible = prev.filter((k) => availableColumnKeys.includes(k));
        if (savedOrder.length === 0) return stillVisible;
        const inSavedOrder = savedOrder.filter((k) => stillVisible.includes(k));
        const rest = stillVisible.filter((k) => !inSavedOrder.includes(k));
        return [...inSavedOrder, ...rest];
      }
      // Initialize with DEFAULT_COLUMN_KEYS
      const defaultVisible = DEFAULT_COLUMN_KEYS.map(k => resolveDefaultColumn(k, availableColumnKeys))
        .filter(k => availableColumnKeys.includes(k));
      const initial = defaultVisible.length > 0 ? Array.from(new Set(defaultVisible)) : [...availableColumnKeys];
      if (savedOrder.length === 0) return initial;
      const inSavedOrder = savedOrder.filter((k) => initial.includes(k));
      const rest = initial.filter((k) => !inSavedOrder.includes(k));
      return [...inSavedOrder, ...rest];
    });

    setColumnWidths((prev) => {
      const next = { ...prev };
      for (const [k, w] of Object.entries(savedWidths)) {
        if (!availableColumnKeys.includes(k)) continue;
        if (typeof w !== "number" || !isFinite(w)) continue;
        next[k] = Math.max(MIN_COL_WIDTH, Math.round(w));
      }
      return next;
    });
  }, [availableColumnKeys.join(",")]);

  // Persist column order + widths
  useEffect(() => {
    if (visibleColumnKeys.length === 0) return;
    const timeoutId = setTimeout(() => {
      safeWriteLayout({ order: visibleColumnKeys, widths: columnWidths });
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [visibleColumnKeys, columnWidths]);

  const toggleColumn = (key: string) => {
    setVisibleColumnKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      const datasetIndex = availableColumnKeys.indexOf(key);
      if (datasetIndex < 0) return [...prev, key];
      const next = [...prev, key];
      return availableColumnKeys.filter((k) => next.includes(k));
    });
  };

  const moveColumn = (key: string, direction: "up" | "down") => {
    setVisibleColumnKeys((prev) => {
      const i = prev.indexOf(key);
      if (i < 0) return prev;
      if (direction === "up" && i === 0) return prev;
      if (direction === "down" && i === prev.length - 1) return prev;
      const next = [...prev];
      const j = direction === "up" ? i - 1 : i + 1;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const reorderColumns = (fromKey: string, toKey: string) => {
    setVisibleColumnKeys((prev) => {
      if (fromKey === toKey) return prev;
      const fromIndex = prev.indexOf(fromKey);
      const toIndex = prev.indexOf(toKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromKey);
      return next;
    });
  };

  useEffect(() => {
    let animationFrameId: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);

      animationFrameId = requestAnimationFrame(() => {
        if (!resizeRef.current) return;
        const { key, startX, startWidth } = resizeRef.current;
        const delta = e.clientX - startX;
        const next = Math.max(MIN_COL_WIDTH, Math.round(startWidth + delta));
        setColumnWidths((prev) => ({ ...prev, [key]: next }));
        animationFrameId = null;
      });
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Column filter states
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [plantFilter, setPlantFilter] = useState<Set<string>>(new Set());
  const [customerFilter, setCustomerFilter] = useState<Set<string>>(new Set());
  const [materialFilter, setMaterialFilter] = useState<Set<string>>(new Set());
  const [salesOrderFilter, setSalesOrderFilter] = useState<Set<string>>(new Set());
  const [businessUnitFilter, setBusinessUnitFilter] = useState<Set<string>>(new Set());
  const [leadTimeMin, setLeadTimeMin] = useState<number | undefined>(undefined);
  const [leadTimeMax, setLeadTimeMax] = useState<number | undefined>(undefined);
  const [riskScoreMin, setRiskScoreMin] = useState<number | undefined>(undefined);
  const [riskScoreMax, setRiskScoreMax] = useState<number | undefined>(undefined);
  const [soDateStart, setSoDateStart] = useState<string | undefined>(undefined);
  const [soDateEnd, setSoDateEnd] = useState<string | undefined>(undefined);


  const clearAllFilters = () => {
    setStatusFilter(new Set());
    setPlantFilter(new Set());
    setCustomerFilter(new Set());
    setMaterialFilter(new Set());
    setSalesOrderFilter(new Set());
    setBusinessUnitFilter(new Set());
    setLeadTimeMin(undefined);
    setLeadTimeMax(undefined);
    setRiskScoreMin(undefined);
    setRiskScoreMax(undefined);
    setSoDateStart(undefined);
    setSoDateEnd(undefined);
    setSearch("");
  };

  // Extract unique values from data for checkbox filters
  const uniquePlants = useMemo(() => [...new Set(orders.map((o) => o.plant).filter(Boolean))].sort(), [orders]);
  const uniqueCustomers = useMemo(() => [...new Set(orders.map((o) => o.customer).filter(Boolean))].sort(), [orders]);
  const uniqueMaterials = useMemo(() => [...new Set(orders.map((o) => o.material).filter(Boolean))].sort(), [orders]);
  const uniqueSalesOrders = useMemo(() => [...new Set(orders.map((o) => o.salesOrder).filter(Boolean))].sort(), [orders]);
  const uniqueStatuses = useMemo(() => [...new Set(orders.map((o) => o.status).filter(Boolean))].sort(), [orders]);
  const uniqueBusinessUnits = useMemo(() => {
    const key = "division of business name";
    return [...new Set(orders.map((o) => (o.rawData?.[key] ?? "").trim()).filter(Boolean))].sort();
  }, [orders]);

  // Compute risk score bounds
  const riskScoreBounds = useMemo(() => {
    const values = orders.map((o) => o.riskScore).filter((v) => !isNaN(v));
    if (values.length === 0) return { min: 0, max: 100 };
    return { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) };
  }, [orders]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortBy(null);
      }
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = [...orders];

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) => {
        const haystack = [o.salesOrder, o.customer, o.material, o.plant, o.reqDelivery, o.leadTime, o.status]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Column filters: checkbox filters
    if (statusFilter.size > 0) {
      result = result.filter((o) => statusFilter.has(o.status));
    }
    if (plantFilter.size > 0) {
      result = result.filter((o) => plantFilter.has(o.plant));
    }
    if (customerFilter.size > 0) {
      result = result.filter((o) => customerFilter.has(o.customer));
    }
    if (materialFilter.size > 0) {
      result = result.filter((o) => materialFilter.has(o.material));
    }
    if (salesOrderFilter.size > 0) {
      result = result.filter((o) => salesOrderFilter.has(o.salesOrder));
    }
    if (businessUnitFilter.size > 0) {
      const key = "division of business name";
      result = result.filter((o) => {
        const bu = (o.rawData?.[key] ?? "").trim();
        return businessUnitFilter.has(bu);
      });
    }

    // Column filters: range filters
    if (leadTimeMin !== undefined) {
      result = result.filter((o) => {
        const lt = parseInt(o.leadTime, 10);
        return !isNaN(lt) && lt >= leadTimeMin;
      });
    }
    if (leadTimeMax !== undefined) {
      result = result.filter((o) => {
        const lt = parseInt(o.leadTime, 10);
        return !isNaN(lt) && lt <= leadTimeMax;
      });
    }

    if (riskScoreMin !== undefined) {
      result = result.filter((o) => o.riskScore >= riskScoreMin);
    }
    if (riskScoreMax !== undefined) {
      result = result.filter((o) => o.riskScore <= riskScoreMax);
    }
    if (soDateStart) {
      const start = new Date(soDateStart);
      result = result.filter((o) => {
        const d = new Date(o.soCreateDate);
        return !isNaN(d.getTime()) && d >= start;
      });
    }
    if (soDateEnd) {
      const end = new Date(soDateEnd);
      end.setHours(23, 59, 59, 999);
      result = result.filter((o) => {
        const d = new Date(o.soCreateDate);
        return !isNaN(d.getTime()) && d <= end;
      });
    }

    // Sorting
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
  }, [orders, search, sortBy, sortDir, statusFilter, plantFilter, customerFilter, materialFilter, salesOrderFilter, businessUnitFilter, leadTimeMin, leadTimeMax, riskScoreMin, riskScoreMax, soDateStart, soDateEnd]);

  // Reset page when filters change
  useMemo(() => setPage(1), [filtered.length]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleExport = () => {
    const headerRow = visibleColumnKeys.map((k) => getColumnDisplayName(k)).join(",");
    const escape = (v: string) => (/[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = filtered.map((o) =>
      visibleColumnKeys.map((key) => {
        const val = key === "riskSignals" ? getRiskSignals(o) : getCellValue(o, key);
        return escape(String(val ?? ""));
      }).join(",")
    ).join("\n");
    const blob = new Blob([headerRow + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "otif_orders_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

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
    if (SHAP_FEATURE_LABELS[key]) return SHAP_FEATURE_LABELS[key];
    if (SHAP_FEATURE_LABELS[`f_${key}`]) return SHAP_FEATURE_LABELS[`f_${key}`];
    return name.replace(/^f_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getRiskSignals = (order: OTIFRecord): string => {
    if (order.riskSignals) {
      return order.riskSignals
        .split(";")
        .map((s) => translateFeatureName(s.trim()))
        .join("; ");
    }
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
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns2 className="mr-1.5 h-3.5 w-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-0">
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-muted-foreground px-2">Show / hide and reorder columns</p>
              </div>
              <ScrollArea className="h-[280px]">
                <div className="p-2 space-y-0.5">
                  {availableColumnKeys.map((key) => {
                    const isVisible = visibleColumnKeys.includes(key);
                    const index = visibleColumnKeys.indexOf(key);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`col-${key}`}
                          checked={isVisible}
                          onCheckedChange={() => toggleColumn(key)}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label
                          htmlFor={`col-${key}`}
                          className="flex-1 text-sm cursor-pointer truncate"
                        >
                          {getColumnDisplayName(key)}
                        </label>
                        {isVisible && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); moveColumn(key, "up"); }}
                              disabled={index === 0}
                              className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                              title="Move up"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); moveColumn(key, "down"); }}
                              disabled={index === visibleColumnKeys.length - 1}
                              className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                              title="Move down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>



          <Button variant="ghost" size="sm" onClick={clearAllFilters} title="Clear all filters">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear Filters
          </Button>
        </div>
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

      <div className="px-6 h-[500px] relative overflow-x-auto overflow-y-auto">
        <table className="min-w-max w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              {visibleColumnKeys.map((key) => {
                const label = getColumnDisplayName(key);
                const isSalesOrder = key === "sales order" || key === "sales_order";
                const isCustomer = key === "customer name" || key === "customer" || key === "customer_name";
                const isBusinessUnits = key === "division of business name";
                const isMaterial = key === "material";
                const isPlant = key === "plant";
                const isReqDelivery = key === "requested delivery date" || key === "req_delivery" || key === "requested_delivery_date";
                const isLeadTime = key === "leadTime";
                const isRiskScore = key === "riskScore";
                const isStatus = key === "status" || key === "otif_hit/miss" || key === "otif_hit";
                const sortKey: SortKey | null =
                  isSalesOrder ? "salesOrder" : isCustomer ? "customer" : isMaterial ? "material" : isPlant ? "plant" : isReqDelivery ? "reqDelivery" : isRiskScore ? "riskScore" : isStatus ? "status" : null;
                const width = columnWidths[key];
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={(e) => {
                      draggingKeyRef.current = key;
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", key);
                      } catch {
                        // ignore
                      }
                    }}
                    onDragOver={(e) => {
                      // allow drop
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromKey = draggingKeyRef.current ?? "";
                      if (fromKey) reorderColumns(fromKey, key);
                      draggingKeyRef.current = null;
                    }}
                    className="sticky top-0 z-10 bg-card pb-3 pt-3 pr-6 text-left border-b border-border/70 relative select-none"
                    style={width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : undefined}
                    title="Drag to reorder. Drag edge to resize."
                  >
                    <div className="flex items-center gap-0.5">
                      {sortKey ? (
                        <button
                          onClick={() => toggleSort(sortKey)}
                          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground flex-1 text-left"
                        >
                          <span className="break-words whitespace-normal">{label}</span>
                          <ArrowUpDown className="h-3 w-3 shrink-0" />
                          {sortBy === sortKey && (
                            <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
                          )}
                        </button>
                      ) : (
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex-1 break-words whitespace-normal text-left">{label}</span>
                      )}
                      {isSalesOrder && (
                        <ColumnFilterCheckbox label="Sales Order" options={uniqueSalesOrders} selected={salesOrderFilter} onChange={setSalesOrderFilter} />
                      )}
                      {isCustomer && (
                        <ColumnFilterCheckbox label="Customer" options={uniqueCustomers} selected={customerFilter} onChange={setCustomerFilter} />
                      )}
                      {isBusinessUnits && (
                        <ColumnFilterCheckbox label="Business Units" options={uniqueBusinessUnits} selected={businessUnitFilter} onChange={setBusinessUnitFilter} />
                      )}
                      {isMaterial && (
                        <ColumnFilterCheckbox label="Material" options={uniqueMaterials} selected={materialFilter} onChange={setMaterialFilter} />
                      )}
                      {isPlant && (
                        <ColumnFilterCheckbox label="Plant" options={uniquePlants} selected={plantFilter} onChange={setPlantFilter} />
                      )}
                      {isLeadTime && (
                        <ColumnFilterRange
                          label="Lead Time"
                          min={0}
                          max={30}
                          currentMin={leadTimeMin}
                          currentMax={leadTimeMax}
                          onChange={(min, max) => { setLeadTimeMin(min); setLeadTimeMax(max); }}
                          unit=" days"
                        />
                      )}
                      {isRiskScore && (
                        <ColumnFilterRange
                          label="Risk Score"
                          min={riskScoreBounds.min}
                          max={riskScoreBounds.max}
                          currentMin={riskScoreMin}
                          currentMax={riskScoreMax}
                          onChange={(min, max) => { setRiskScoreMin(min); setRiskScoreMax(max); }}
                          unit="%"
                        />
                      )}
                      {isStatus && (
                        <ColumnFilterCheckbox label="Status" options={uniqueStatuses} selected={statusFilter} onChange={setStatusFilter} />
                      )}
                      {(key === "so create date" || key === "so_create_date") && (
                        <ColumnFilterDate
                          label="SO Creation Date"
                          currentStart={soDateStart}
                          currentEnd={soDateEnd}
                          onChange={(start, end) => { setSoDateStart(start); setSoDateEnd(end); }}
                        />
                      )}
                    </div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const th = (e.currentTarget as HTMLDivElement).parentElement as HTMLElement | null;
                        const startWidth = th ? th.getBoundingClientRect().width : (columnWidths[key] ?? 160);
                        resizeRef.current = { key, startX: e.clientX, startWidth };
                        document.body.style.cursor = "col-resize";
                        document.body.style.userSelect = "none";
                      }}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize group"
                      title="Drag to resize"
                    >
                      <div className="mx-auto h-full w-px bg-border/70 group-hover:bg-border" />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageOrders.map((o) => (
              <tr
                key={o.salesOrder + o.rowNum}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onOrderClick(o)}
              >
                {visibleColumnKeys.map((key) => {
                  const val = key === "riskSignals" ? getRiskSignals(o) : getCellValue(o, key);
                  const isStatus = key === "status" || key === "otif_hit/miss" || key === "otif_hit";
                  const isSalesOrder = key === "sales order" || key === "sales_order";
                  const isRiskScore = key === "riskScore";
                  const width = columnWidths[key];
                  return (
                    <td
                      key={key}
                      className={`py-3.5 pr-4 text-left border-b border-border/60 align-top ${
                        isSalesOrder ? "font-medium text-primary" : ""
                      } ${
                        key === "riskSignals" ? "max-w-[260px] text-xs text-muted-foreground" : "break-words whitespace-normal"
                      }`}
                      style={width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : undefined}
                    >
                      {isStatus && typeof val === "string" && (val === "Hit" || val === "Miss") ? (
                        <span className={`${val === "Hit" ? "status-hit" : "status-miss"} inline-flex items-center justify-center whitespace-nowrap`}>
                          OTIF {val}
                        </span>
                      ) : isRiskScore && typeof val === "number" ? (
                        `${val}%`
                      ) : (
                        <span className="block text-left break-words whitespace-normal">{String(val ?? "")}</span>
                      )}
                    </td>
                  );
                })}
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
