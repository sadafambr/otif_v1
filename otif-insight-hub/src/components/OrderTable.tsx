import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Search, Download, ArrowUpDown, ChevronDown, Columns2, ChevronUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnFilterCheckbox } from "@/components/ColumnFilterCheckbox";
import { ColumnFilterRange } from "@/components/ColumnFilterRange";
import { ColumnFilterDate } from "@/components/ColumnFilterDate";
import { ColumnFilterSelect } from "@/components/ColumnFilterSelect";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw } from "lucide-react";
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

type SortKey = string;

type ColumnLayoutState = {
  order?: string[];
  widths?: Record<string, number>;
};

type ColumnFilterType = "checkbox" | "range" | "date" | "leadtime";

interface ColumnFilterState {
  checkboxFilters: Record<string, Set<string>>;
  rangeFilters: Record<string, { min?: number; max?: number }>;
  dateFilters: Record<string, { start?: string; end?: string }>;
  leadTimePreset: string | undefined;
}

const COLUMN_LAYOUT_STORAGE_KEY = "otif.orderTable.columnLayout.v1";
const MIN_COL_WIDTH = 80;

const DATE_PATTERNS = [
  /\d{4}-\d{2}-\d{2}/,
  /\d{2}\/\d{2}\/\d{4}/,
  /\d{2}-\d{2}-\d{4}/,
  /\w{3}\s+\d{1,2},?\s+\d{4}/,
];

function looksLikeDate(value: string): boolean {
  if (!value || value.length < 6) return false;
  return DATE_PATTERNS.some((p) => p.test(value));
}

function looksLikeNumber(value: string): boolean {
  if (!value) return false;
  const cleaned = value.replace(/[,%$€£]/g, "").trim();
  return cleaned !== "" && !isNaN(Number(cleaned));
}

function parseNumeric(value: string): number {
  return parseFloat(value.replace(/[,%$€£]/g, "").trim());
}

function detectColumnType(values: string[]): ColumnFilterType {
  const sampled = values.filter(Boolean).slice(0, 50);
  if (sampled.length === 0) return "checkbox";

  const dateCount = sampled.filter(looksLikeDate).length;
  if (dateCount / sampled.length > 0.6) return "date";

  const numCount = sampled.filter(looksLikeNumber).length;
  if (numCount / sampled.length > 0.6) return "range";

  return "checkbox";
}

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
    // ignore
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

const SHAP_FEATURE_LABELS: Record<string, string> = {
  f_so_to_rdd_days: "Order-to-Delivery Window",
  f_so_to_mat_avail_days: "Days Until Material Ready",
  f_mat_avail_to_rdd_days: "Material-to-Delivery Buffer",
  f_mat_ready_after_rdd: "Late Material Flag",
  f_request_lead_days: "Customer Requested Lead Time",
  f_material_lead_days: "Material Supply Lead Time",
  f_lead_gap_days: "Supply Cushion Days",
  f_tight_ratio: "Timeline Tightness Ratio",
  f_is_tight_order: "Tight Order Flag",
  f_is_extremely_tight: "Critical Timeline Flag",
  f_critical_negative_gap: "Severe Delay Risk Flag",
  f_mild_negative_gap: "Minor Delay Risk Flag",
  f_large_positive_gap: "Comfortable Buffer Flag",
  f_gap_bin: "Low Buffer Quartile Flag",
  f_unit_price_log: "Unit Price (Log)",
  f_so_woy_sin: "Order Week Seasonality (Sin)",
  f_so_woy_cos: "Order Week Seasonality (Cos)",
  f_rdd_woy_sin: "Delivery Week Seasonality (Sin)",
  f_rdd_woy_cos: "Delivery Week Seasonality (Cos)",
  f_qty_log: "Order Volume (Log)",
  f_high_qty_flag: "Large Order Flag",
  f_high_value_flag: "High Value Order Flag",
  f_high_value_x_tight: "High Value + Tight Timeline",
  f_tolerance_band: "Delivery Quantity Tolerance",
  f_strict_tolerance: "Strict Tolerance Customer",
  f_strict_x_tight: "Strict Customer + Tight Deadline",
  f_tolerance_x_gap: "Gap Exceeds Tolerance",
  f_plant_orders_7d: "Plant Load (7 Days)",
  f_plant_orders_30d: "Plant Load (30 Days)",
  f_material_orders_7d: "Material Demand (7 Days)",
  f_material_orders_30d: "Material Demand (30 Days)",
  f_shipto_orders_7d: "Customer Site Volume (7 Days)",
  f_shipto_orders_30d: "Customer Site Volume (30 Days)",
  f_mat_total_orders_log: "Material Order Frequency (Log)",
  f_gap_x_load: "Buffer Under Plant Pressure",
  f_tight_x_plant_load: "Tight Order at Busy Plant",
  f_mat_shipto_x_pressure: "Material + Customer Risk Pressure",
  f_customer_miss_rate: "Customer OTIF Miss Rate",
  f_material_miss_rate: "Material OTIF Miss Rate",
  f_plant_miss_rate: "Plant OTIF Miss Rate",
  f_bu_miss_rate: "Business Unit OTIF Miss Rate",
  f_mat_shipto_miss_rate: "Material × Customer Miss Rate",
  f_plant_material_miss_rate: "Material × Plant Miss Rate",
  f_plant_shipto_miss_rate: "Plant × Customer Miss Rate",
  f_state_miss_rate: "Regional OTIF Miss Rate",
  f_strict_x_plant_miss: "Strict Customer at Weak Plant",
  f_high_plant_risk: "High Risk Plant Flag",
  f_risk_stack: "Compounded Risk Flag",
  f_otif_risk_score: "Overall OTIF Risk Score",
};

const LEAD_TIME_THRESHOLD = 60;

export function OrderTable({ orders, rawHeaders, onOrderClick }: OrderTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const draggingKeyRef = useRef<string | null>(null);
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

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

  const defaultVisibleKeys = useMemo(() => {
    if (availableColumnKeys.length === 0) return [];
    const resolved = DEFAULT_COLUMN_KEYS
      .map((k) => resolveDefaultColumn(k, availableColumnKeys))
      .filter((k) => availableColumnKeys.includes(k));
    return resolved.length > 0 ? Array.from(new Set(resolved)) : [...availableColumnKeys];
  }, [availableColumnKeys]);

  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => []);
  useEffect(() => {
    if (availableColumnKeys.length === 0) return;
    const saved = safeReadLayout();
    const savedOrder = saved?.order?.filter((k) => availableColumnKeys.includes(k)) ?? [];
    const savedWidths = saved?.widths ?? {};

    setVisibleColumnKeys((prev) => {
      if (prev.length > 0) {
        const stillVisible = prev.filter((k) => availableColumnKeys.includes(k));
        if (savedOrder.length === 0) return stillVisible;
        const inSavedOrder = savedOrder.filter((k) => stillVisible.includes(k));
        const rest = stillVisible.filter((k) => !inSavedOrder.includes(k));
        return [...inSavedOrder, ...rest];
      }
      const initial = defaultVisibleKeys.length > 0 ? [...defaultVisibleKeys] : [...availableColumnKeys];
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
      const next = [...prev, key];
      return availableColumnKeys.filter((k) => next.includes(k));
    });
  };

  const selectAllColumns = () => setVisibleColumnKeys([...availableColumnKeys]);
  const deselectAllColumns = () => setVisibleColumnKeys([]);
  const resetToDefaultColumns = () => setVisibleColumnKeys([...defaultVisibleKeys]);

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

  // --- Dynamic filter state ---
  const [checkboxFilters, setCheckboxFilters] = useState<Record<string, Set<string>>>({});
  const [rangeFilters, setRangeFilters] = useState<Record<string, { min?: number; max?: number }>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, { start?: string; end?: string }>>({});
  const [leadTimePreset, setLeadTimePreset] = useState<string | undefined>(`lt_${LEAD_TIME_THRESHOLD}`);

  const columnTypeCache = useRef<Record<string, ColumnFilterType>>({});

  const getColumnFilterType = useCallback(
    (key: string): ColumnFilterType => {
      if (key === "leadTime") return "leadtime";
      if (key === "riskScore") return "range";
      if (key === "status") return "checkbox";
      if (key === "riskSignals") return "checkbox";

      if (columnTypeCache.current[key]) return columnTypeCache.current[key];

      const values = orders.slice(0, 100).map((o) => String(getCellValue(o, key)));
      const detected = detectColumnType(values);
      columnTypeCache.current[key] = detected;
      return detected;
    },
    [orders]
  );

  const getUniqueValues = useCallback(
    (key: string): string[] => {
      const vals = new Set<string>();
      for (const o of orders) {
        const v = String(getCellValue(o, key)).trim();
        if (v) vals.add(v);
      }
      return [...vals].sort();
    },
    [orders]
  );

  const getRangeBounds = useCallback(
    (key: string): { min: number; max: number } => {
      let min = Infinity;
      let max = -Infinity;
      for (const o of orders) {
        const raw = String(getCellValue(o, key));
        const n = parseNumeric(raw);
        if (!isNaN(n)) {
          if (n < min) min = n;
          if (n > max) max = n;
        }
      }
      if (!isFinite(min)) return { min: 0, max: 100 };
      return { min: Math.floor(min), max: Math.ceil(max) };
    },
    [orders]
  );

  const setCheckboxFilter = useCallback((key: string, value: Set<string>) => {
    setCheckboxFilters((prev) => {
      if (value.size === 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const setRangeFilter = useCallback((key: string, min: number | undefined, max: number | undefined) => {
    setRangeFilters((prev) => {
      if (min === undefined && max === undefined) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { min, max } };
    });
  }, []);

  const setDateFilter = useCallback((key: string, start: string | undefined, end: string | undefined) => {
    setDateFilters((prev) => {
      if (!start && !end) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { start, end } };
    });
  }, []);

  const clearAllFilters = () => {
    setCheckboxFilters({});
    setRangeFilters({});
    setDateFilters({});
    setLeadTimePreset(`lt_${LEAD_TIME_THRESHOLD}`);
    setSearch("");
  };

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

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) => {
        const haystack = [o.salesOrder, o.customer, o.material, o.plant, o.reqDelivery, o.leadTime, o.status]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Lead time preset filter
    if (leadTimePreset) {
      result = result.filter((o) => {
        const lt = parseInt(o.leadTime, 10);
        if (isNaN(lt)) return true;
        if (leadTimePreset === `lt_${LEAD_TIME_THRESHOLD}`) return lt < LEAD_TIME_THRESHOLD;
        if (leadTimePreset === `gte_${LEAD_TIME_THRESHOLD}`) return lt >= LEAD_TIME_THRESHOLD;
        return true;
      });
    }

    // Dynamic checkbox filters
    for (const [key, selected] of Object.entries(checkboxFilters)) {
      if (selected.size === 0) continue;
      result = result.filter((o) => {
        const val = String(getCellValue(o, key)).trim();
        return selected.has(val);
      });
    }

    // Dynamic range filters
    for (const [key, range] of Object.entries(rangeFilters)) {
      result = result.filter((o) => {
        const raw = String(getCellValue(o, key));
        const n = parseNumeric(raw);
        if (isNaN(n)) return true;
        if (range.min !== undefined && n < range.min) return false;
        if (range.max !== undefined && n > range.max) return false;
        return true;
      });
    }

    // Dynamic date filters
    for (const [key, range] of Object.entries(dateFilters)) {
      if (range.start) {
        const start = new Date(range.start);
        result = result.filter((o) => {
          const raw = String(getCellValue(o, key));
          const d = new Date(raw);
          return isNaN(d.getTime()) || d >= start;
        });
      }
      if (range.end) {
        const end = new Date(range.end);
        end.setHours(23, 59, 59, 999);
        result = result.filter((o) => {
          const raw = String(getCellValue(o, key));
          const d = new Date(raw);
          return isNaN(d.getTime()) || d <= end;
        });
      }
    }

    if (sortBy) {
      result.sort((a, b) => {
        let aVal: string | number = getCellValue(a, sortBy);
        let bVal: string | number = getCellValue(b, sortBy);
        const aNum = typeof aVal === "number" ? aVal : parseNumeric(String(aVal));
        const bNum = typeof bVal === "number" ? bVal : parseNumeric(String(bVal));
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDir === "asc" ? aNum - bNum : bNum - aNum;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
        if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [orders, search, sortBy, sortDir, checkboxFilters, rangeFilters, dateFilters, leadTimePreset]);

  useMemo(() => setPage(1), [filtered.length]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

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

  const handleExport = () => {
    const headerRow = visibleColumnKeys.map((k) => getColumnDisplayName(k)).join(",");
    const escape = (v: string) => (/[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = filtered
      .map((o) =>
        visibleColumnKeys
          .map((key) => {
            const val = key === "riskSignals" ? getRiskSignals(o) : getCellValue(o, key);
            return escape(String(val ?? ""));
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([headerRow + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "otif_orders_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderColumnFilter = (key: string) => {
    const filterType = getColumnFilterType(key);
    const label = getColumnDisplayName(key);

    if (filterType === "leadtime") {
      return (
        <ColumnFilterSelect
          label={label}
          options={[
            { value: `lt_${LEAD_TIME_THRESHOLD}`, label: `Less than ${LEAD_TIME_THRESHOLD} days` },
            { value: `gte_${LEAD_TIME_THRESHOLD}`, label: `${LEAD_TIME_THRESHOLD} days or more` },
          ]}
          selected={leadTimePreset}
          onChange={setLeadTimePreset}
        />
      );
    }

    if (filterType === "checkbox") {
      const uniqueVals = getUniqueValues(key);
      if (uniqueVals.length === 0) return null;
      return (
        <ColumnFilterCheckbox
          label={label}
          options={uniqueVals}
          selected={checkboxFilters[key] ?? new Set()}
          onChange={(val) => setCheckboxFilter(key, val)}
        />
      );
    }

    if (filterType === "range") {
      const bounds = getRangeBounds(key);
      const current = rangeFilters[key];
      return (
        <ColumnFilterRange
          label={label}
          min={bounds.min}
          max={bounds.max}
          currentMin={current?.min}
          currentMax={current?.max}
          onChange={(min, max) => setRangeFilter(key, min, max)}
          unit={key === "riskScore" ? "%" : ""}
        />
      );
    }

    if (filterType === "date") {
      const current = dateFilters[key];
      return (
        <ColumnFilterDate
          label={label}
          currentStart={current?.start}
          currentEnd={current?.end}
          onChange={(start, end) => setDateFilter(key, start, end)}
        />
      );
    }

    return null;
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += Object.keys(checkboxFilters).length;
    count += Object.keys(rangeFilters).length;
    count += Object.keys(dateFilters).length;
    if (leadTimePreset) count++;
    if (search) count++;
    return count;
  }, [checkboxFilters, rangeFilters, dateFilters, leadTimePreset, search]);

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
                <div className="flex items-center gap-1 mt-2 px-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={selectAllColumns}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={deselectAllColumns}
                  >
                    Deselect All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={resetToDefaultColumns}
                  >
                    Default
                  </Button>
                </div>
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
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
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
          {leadTimePreset === `lt_${LEAD_TIME_THRESHOLD}` && (
            <span className="ml-2 text-primary font-medium">(Lead Time &lt; {LEAD_TIME_THRESHOLD} days)</span>
          )}
          {leadTimePreset === `gte_${LEAD_TIME_THRESHOLD}` && (
            <span className="ml-2 text-primary font-medium">(Lead Time &ge; {LEAD_TIME_THRESHOLD} days)</span>
          )}
        </p>
      </div>

      <div className="px-6 h-[500px] relative overflow-x-auto overflow-y-auto">
        <table className="min-w-max w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              {visibleColumnKeys.map((key) => {
                const label = getColumnDisplayName(key);
                const width = columnWidths[key];
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={(e) => {
                      draggingKeyRef.current = key;
                      e.dataTransfer.effectAllowed = "move";
                      try { e.dataTransfer.setData("text/plain", key); } catch { /* ignore */ }
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
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
                      <button
                        onClick={() => toggleSort(key)}
                        className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground flex-1 text-left"
                      >
                        <span className="break-words whitespace-normal">{label}</span>
                        <ArrowUpDown className="h-3 w-3 shrink-0" />
                        {sortBy === key && (
                          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
                        )}
                      </button>
                      {renderColumnFilter(key)}
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
