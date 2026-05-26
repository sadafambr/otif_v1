import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue, startTransition } from "react";
import { Search, Download, ArrowUpDown, ChevronDown, Columns2, ChevronUp, ArrowDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnFilterCheckbox } from "@/components/ColumnFilterCheckbox";
import { ColumnFilterRange } from "@/components/ColumnFilterRange";
import { ColumnFilterDate } from "@/components/ColumnFilterDate";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDisplayName, DEFAULT_COLUMN_KEYS, resolveDefaultColumn } from "@/lib/columnMapping";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Raw column keys that represent sales order / SO id (numeric IDs → checkbox, not range). */
function isSalesOrderColumnKey(key: string, availableColumnKeys: string[]): boolean {
  const k = key.trim().toLowerCase();
  if (k === "sales order" || k === "sales_order" || k === "salesorder") return true;
  return resolveDefaultColumn("sales order", availableColumnKeys) === key;
}

/** Material / SKU identifiers → searchable checklist, never a numeric range. */
function isMaterialCodeColumnKey(key: string, availableColumnKeys: string[]): boolean {
  const k = key.trim().toLowerCase();
  if (k === "material" || k === "material_code" || k === "material code") return true;
  return resolveDefaultColumn("material", availableColumnKeys) === key;
}

/** Status / OTIF outcome column — toolbar uses a segmented control instead of a list popover. */
function isStatusColumnKey(key: string, availableColumnKeys: string[]): boolean {
  const k = key.trim().toLowerCase();
  if (k === "status") return true;
  return resolveDefaultColumn("status", availableColumnKeys) === key;
}

function pickStatusToken(uniqueValues: string[], kind: "hit" | "miss"): string | undefined {
  const re = kind === "hit" ? /^hit$/i : /^miss$/i;
  return uniqueValues.find((v) => re.test(v.trim()));
}

/** Narrative risk column — no column filter UI */
function isRiskSignalsColumnKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k === "risksignals" || k === "risk signals" || k === "risk_signals";
}

function isDateColumnKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k.includes("date") || k.includes("rdd") || k.includes("delivery");
}

function parseDateRobust(str: string): Date | null {
  if (!str) return null;
  const cleaned = str.trim();

  // Try parsing by splitting first to handle 2-digit years and diverse delimiters
  const parts = cleaned.split(/[\/\-\.\s]/);
  if (parts.length >= 3) {
    let p0 = parseInt(parts[0], 10);
    let p1 = parseInt(parts[1], 10);
    let p2 = parseInt(parts[2], 10);

    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      let year = 0;
      let month = 0;
      let day = 0;

      // Detect format
      if (p0 > 1000) {
        // YYYY-MM-DD
        year = p0;
        month = p1 - 1;
        day = p2;
      } else if (p2 > 1000) {
        // MM/DD/YYYY or DD/MM/YYYY
        year = p2;
        if (p0 > 12) {
          month = p1 - 1;
          day = p0;
        } else if (p1 > 12) {
          month = p0 - 1;
          day = p1;
        } else {
          // Ambiguous: default to MM/DD/YYYY
          month = p0 - 1;
          day = p1;
        }
      } else {
        // Two-digit year! E.g. MM/DD/YY or DD/MM/YY
        year = p2 < 100 ? p2 + 2000 : p2;
        if (p0 > 12) {
          month = p1 - 1;
          day = p0;
        } else if (p1 > 12) {
          month = p0 - 1;
          day = p1;
        } else {
          // Ambiguous: default to MM/DD/YY
          month = p0 - 1;
          day = p1;
        }
      }

      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Fallback to standard parser
  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    let year = d.getFullYear();
    if (year < 100) {
      d.setFullYear(year + 2000);
    } else if (year >= 1900 && year < 2000) {
      d.setFullYear(year + 100);
    }
    return d;
  }
  return null;
}

function getRddWindowDays(o: OTIFRecord): number | null {
  if (!o.reqDelivery || !o.soCreateDate) return null;
  const req = parseDateRobust(o.reqDelivery);
  const so = parseDateRobust(o.soCreateDate);
  if (!req || !so) return null;
  return Math.round((req.getTime() - so.getTime()) / (1000 * 60 * 60 * 24));
}

function isCustomerPickupColumnKey(key: string, availableColumnKeys: string[]): boolean {
  const k = key.trim().toLowerCase();
  if (k === "customer_pickup" || k === "customer pickup" || k === "customerpickup") return true;
  return resolveDefaultColumn("customer_pickup", availableColumnKeys) === key;
}

function isLegacyFirmColumnKey(key: string, availableColumnKeys: string[]): boolean {
  const k = key.trim().toLowerCase();
  if (k === "legacy firm" || k === "legacy_firm" || k === "legacyfirm") return true;
  return resolveDefaultColumn("legacy firm", availableColumnKeys) === key;
}

function pickYesNoToken(uniqueValues: string[], kind: "yes" | "no"): string | undefined {
  const re = kind === "yes" ? /^yes$/i : /^no$/i;
  const exact = uniqueValues.find((v) => re.test(v.trim()));
  if (exact) return exact;
  const reShort = kind === "yes" ? /^y$/i : /^n$/i;
  return uniqueValues.find((v) => reShort.test(v.trim()));
}

function pickLegacyFirmTokens(uniqueValues: string[]): { solenis?: string; diversy?: string; sigura?: string } {
  const result: { solenis?: string; diversy?: string; sigura?: string } = {};
  for (const val of uniqueValues) {
    const v = val.trim().toLowerCase();
    if (v.includes("solenis")) {
      result.solenis = val;
    } else if (v.includes("diversy") || v.includes("diversey")) {
      result.diversy = val;
    } else if (v.includes("sigura")) {
      result.sigura = val;
    }
  }
  return result;
}
import { cn } from "@/lib/utils";
import type { OTIFRecord } from "@/types/otif";

const PAGE_SIZE_MIN = 1;
const PAGE_SIZE_MAX = 10_000;

function clampPageSize(raw: number): number {
  if (!Number.isFinite(raw)) return PAGE_SIZE_MIN;
  const n = Math.floor(raw);
  return Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, n));
}

const COMPUTED_COLUMN_KEYS = ["leadTime", "riskScore", "status", "riskSignals"] as const;

const ALLOWED_COLUMN_FILTERS = new Set([
  "sales order_x", "so line_x", "delivery_date", "so create date", "requested delivery date",
  "ship_to", "legacy firm", "plant region", "routedays", "ordered_quantity_base_uom",
  "confirmed_quantity_in_base_uom", "ordered_in_base_uom", "incoterms_x", "plant", "material",
  "abc indicator", "sales organization", "customer name", "division of business name",
  "act_goods_mvnt_date", "pland gds mvmnt date_otif_x", "total_del", "mat_avl_date_otif",
  "mad_gap_days", "top1_feature", "top2_feature", "top3_feature", "combined_otif", "rule_applied",
  "risksignals"
].map(k => k.trim().toLowerCase()));

const RULE_DESCRIPTIONS: Record<string, string> = {
  "R6:ModelOnly": "Predicted by model based on historical patterns - refer risk signals for more info",
  "R1:QtyShort": "Confirmed quantity is less than ordered quantity",
  "R5:ConfHit": "Ship-to location has a strong on-time delivery history",
  "R4:LeanMiss": "Ship-to location has missed delivery more than 50% of the time",
  "R3:ConfMiss": "Ship-to location consistently misses delivery (>70% miss rate)",
  "R2:PGILate": "Planned GI date is after RDD",
  "R1:QtyShort|R5:ConfHit": "Confirmed quantity is less than ordered quantity, but ship-to has strong delivery record",
  "R1:QtyShort|R3:ConfMiss": "Confirmed quantity is less than ordered quantity and ship-to has poor delivery history",
  "R1:QtyShort|R4:LeanMiss": "Confirmed quantity is less than ordered quantity and ship-to has elevated miss rate",
  "R2b:PGIExc1d|R5:ConfHit": "Planned GI slightly exceeds deadline, but ship-to is reliable",
  "R2:PGILate|R5:ConfHit": "Planned GI is late, but ship-to has strong delivery record"
};

const COMPUTED_DISPLAY_NAMES: Record<string, string> = {
  leadTime: "Lead Time",
  riskScore: "Risk Score",
  status: "Status",
  riskSignals: "Risk Signals",
};

/** Maps analytics Miss rate dimension ids to order table column keys (first match wins). */
const DRILL_DIMENSION_TO_COLUMNS: Record<string, string[]> = {
  plant: ["plant"],
  material: ["material"],
  customer: ["customer name", "customer"],
  businessUnit: ["division of business name"],
};

interface OrderTableProps {
  orders: OTIFRecord[];
  rawHeaders?: string[];
  onOrderClick: (order: OTIFRecord) => void;
  /** Controlled page size (e.g. from Dashboard). If omitted, OrderTable keeps its own state (default 25). */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  /** When set, apply a checkbox filter for that dimension value then clear via onDrillFilterApplied. */
  drillFilter?: { dimensionId: string; value: string } | null;
  onDrillFilterApplied?: () => void;
  onFilteredOrdersChange?: (orders: OTIFRecord[]) => void;
}

type SortKey = string;

type ColumnLayoutState = {
  order?: string[];
  widths?: Record<string, number>;
};

type ColumnFilterType = "checkbox" | "range" | "date" | "leadtime" | "none";

interface ColumnFilterState {
  checkboxFilters: Record<string, Set<string>>;
  rangeFilters: Record<string, { min?: number; max?: number }>;
  dateFilters: Record<string, { start?: string; end?: string }>;
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
  if (columnKey === "leadTime") {
    // Negative lead times are not meaningful in the UI — clamp to 0 days.
    const leadTimeDays = parseInt(String(order.leadTime ?? "").trim(), 10);
    if (isNaN(leadTimeDays)) return order.leadTime;
    return Math.max(0, leadTimeDays);
  }
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
  "ship to": "Ship-To Party",
  "ship_to": "Ship-To Party",
  "csr": "Customer Service Rep",
  "city": "City",
  "plant": "Plant",
  "hist miss rate material": "Historical Material Miss Rate",
  "mad gap days": "MAD Gap Days",
  "mad_gap_days": "MAD Gap Days",
  "material": "Material Code",
  "customer name": "Customer Name",
  "division of business name": "Business Units",
  "sales order": "Sales Order",
  "so line": "SO Line Item",
  "so create date": "Order Created Date",
  "requested delivery date": "Requested Delivery Date",
  "abc indicator": "ABC Classification",
  "sales organization": "Sales Organization",
  "delivery_date": "Delivery Date",
  "plant region": "Plant Region",
  "routedays": "Route Days",
  "ordered_quantity_base_uom": "Ordered Qty (Base UOM)",
  "confirmed_quantity_in_base_uom": "Confirmed Qty (Base UOM)",
  "ordered_in_base_uom": "Ordered in Base UOM",
  "incoterms_x": "Incoterms",
  "act_goods_mvnt_date": "Actual Goods Movement Date",
  "pland gds mvmnt date_otif_x": "Planned Goods Movement Date",
  "total_del": "Total Delivery",
  "mat_avl_date_otif": "Material Availability Date",
  "rule_applied": "Rule Applied",
  "combined_otif": "Model Output (Combined OTIF)",
};

const LEAD_TIME_THRESHOLD = 60;

/**
 * Days value used for lead-time segmentation — must match what the Lead Time column shows.
 * Returns null when there is no numeric lead time (those rows are excluded from "≥ 60 days").
 */
function parseLeadTimeDaysForFilter(order: OTIFRecord): number | null {
  const v = getCellValue(order, "leadTime");
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseInt(String(v).replace(/,/g, "").trim(), 10);
  if (isNaN(n)) return null;
  return Math.max(0, n);
}

/** Stable empty selection — avoids allocating `new Set()` on every render */
const EMPTY_FILTER_SELECTION = new Set<string>();

/** Single pass over rows: distinct values + numeric bounds per column (shared by all filter UIs). */
function buildColumnFacets(
  orders: OTIFRecord[],
  keys: string[],
): { uniqueValues: Record<string, string[]>; rangeBounds: Record<string, { min: number; max: number }> } {
  const uniqueSets: Record<string, Set<string>> = {};
  const rangeAgg: Record<string, { min: number; max: number }> = {};
  for (const k of keys) {
    uniqueSets[k] = new Set();
    rangeAgg[k] = { min: Infinity, max: -Infinity };
  }
  for (const o of orders) {
    for (const k of keys) {
      const v = getCellValue(o, k);
      const s = String(v).trim();
      if (s) uniqueSets[k].add(s);
      const n = parseNumeric(String(v));
      if (!isNaN(n)) {
        if (n < rangeAgg[k].min) rangeAgg[k].min = n;
        if (n > rangeAgg[k].max) rangeAgg[k].max = n;
      }
    }
  }
  const uniqueValues: Record<string, string[]> = {};
  const rangeBounds: Record<string, { min: number; max: number }> = {};
  for (const k of keys) {
    const arr = [...uniqueSets[k]];
    if (isSalesOrderColumnKey(k, keys)) {
      arr.sort((a, b) => {
        const na = Number(a.replace(/,/g, ""));
        const nb = Number(b.replace(/,/g, ""));
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      });
    } else {
      arr.sort();
    }
    uniqueValues[k] = arr;
    const r = rangeAgg[k];
    rangeBounds[k] = !isFinite(r.min) ? { min: 0, max: 100 } : { min: Math.floor(r.min), max: Math.ceil(r.max) };
  }
  return { uniqueValues, rangeBounds };
}

export function OrderTable({
  orders,
  rawHeaders,
  onOrderClick,
  pageSize: pageSizeProp,
  onPageSizeChange,
  drillFilter,
  onDrillFilterApplied,
  onFilteredOrdersChange,
}: OrderTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [goToPageOpen, setGoToPageOpen] = useState(false);
  const [goToPageDraft, setGoToPageDraft] = useState("");
  const [internalPageSize, setInternalPageSize] = useState(25);
  const pageSize = pageSizeProp ?? internalPageSize;
  const [pageSizeDraft, setPageSizeDraft] = useState(() => String(pageSizeProp ?? 25));

  useEffect(() => {
    setPageSizeDraft(String(pageSize));
  }, [pageSize]);

  const commitPageSize = (n: number) => {
    const clamped = clampPageSize(n);
    if (clamped === pageSize) return;
    setPage(1);
    if (pageSizeProp !== undefined) {
      onPageSizeChange?.(clamped);
    } else {
      setInternalPageSize(clamped);
    }
  };

  const flushPageSizeDraft = () => {
    const trimmed = pageSizeDraft.trim();
    if (trimmed === "") {
      setPageSizeDraft(String(pageSize));
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      setPageSizeDraft(String(pageSize));
      return;
    }
    const clamped = clampPageSize(parsed);
    commitPageSize(clamped);
    setPageSizeDraft(String(clamped));
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const getColWidth = (key: string): number | undefined => {
    if (columnWidths[key] !== undefined) return columnWidths[key];
    if (isRiskSignalsColumnKey(key)) return 150;
    return undefined;
  };
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

  const columnFacets = useMemo(
    () => buildColumnFacets(orders, availableColumnKeys),
    [orders, availableColumnKeys],
  );

  const defaultVisibleKeys = useMemo(() => {
    if (availableColumnKeys.length === 0) return [];
    const resolved = DEFAULT_COLUMN_KEYS
      .map((k) => resolveDefaultColumn(k, availableColumnKeys))
      .filter((k) => availableColumnKeys.includes(k) && ALLOWED_COLUMN_FILTERS.has(k.toLowerCase().trim()));
    return resolved.length > 0
      ? Array.from(new Set(resolved))
      : availableColumnKeys.filter((k) => ALLOWED_COLUMN_FILTERS.has(k.toLowerCase().trim()));
  }, [availableColumnKeys]);

  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => []);
  useEffect(() => {
    if (availableColumnKeys.length === 0) return;
    const saved = safeReadLayout();
    const savedOrder = saved?.order?.filter((k) => availableColumnKeys.includes(k) && ALLOWED_COLUMN_FILTERS.has(k.toLowerCase().trim())) ?? [];
    const savedWidths = saved?.widths ?? {};

    setVisibleColumnKeys((prev) => {
      if (prev.length > 0) {
        const stillVisible = prev.filter((k) => availableColumnKeys.includes(k) && ALLOWED_COLUMN_FILTERS.has(k.toLowerCase().trim()));
        if (savedOrder.length === 0) return stillVisible;
        const inSavedOrder = savedOrder.filter((k) => stillVisible.includes(k));
        const rest = stillVisible.filter((k) => !inSavedOrder.includes(k));
        return [...inSavedOrder, ...rest];
      }
      const initial = defaultVisibleKeys.length > 0 ? [...defaultVisibleKeys] : availableColumnKeys.filter((k) => ALLOWED_COLUMN_FILTERS.has(k.toLowerCase().trim()));
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
  const [leadTimeMode, setLeadTimeMode] = useState<"lt" | "gte">("lt");
  const [rddDaysFilter, setRddDaysFilter] = useState<"all" | "lt3" | "gte3" | "lt7" | "gte7">("all");

  const columnTypeCache = useRef<Record<string, ColumnFilterType>>({});

  const getColumnFilterType = useCallback(
    (key: string): ColumnFilterType => {
      if (isRiskSignalsColumnKey(key)) return "none";
      if (key === "leadTime") return "leadtime";
      if (key === "riskScore") return "range";
      if (isDateColumnKey(key)) return "date";
      if (isMaterialCodeColumnKey(key, availableColumnKeys)) return "checkbox";
      if (isStatusColumnKey(key, availableColumnKeys)) return "checkbox";
      if (isSalesOrderColumnKey(key, availableColumnKeys)) return "checkbox";

      if (columnTypeCache.current[key]) return columnTypeCache.current[key];

      const values = orders.slice(0, 100).map((o) => String(getCellValue(o, key)));
      const detected = detectColumnType(values);
      columnTypeCache.current[key] = detected;
      return detected;
    },
    [orders, availableColumnKeys]
  );

  const getUniqueValues = useCallback(
    (key: string) => columnFacets.uniqueValues[key] ?? [],
    [columnFacets],
  );

  const getRangeBounds = useCallback(
    (key: string) => columnFacets.rangeBounds[key] ?? { min: 0, max: 100 },
    [columnFacets],
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

  const columnHasActiveFilter = useCallback(
    (key: string): boolean => {
      if (key === "leadTime") return leadTimeMode !== "lt";
      const cb = checkboxFilters[key];
      if (cb && cb.size > 0) return true;
      const rng = rangeFilters[key];
      if (rng && (rng.min !== undefined || rng.max !== undefined)) return true;
      const dt = dateFilters[key];
      if (dt && (dt.start || dt.end)) return true;
      return false;
    },
    [leadTimeMode, checkboxFilters, rangeFilters, dateFilters]
  );

  useEffect(() => {
    if (!drillFilter) return;
    if (availableColumnKeys.length === 0) return;

    const candidates = DRILL_DIMENSION_TO_COLUMNS[drillFilter.dimensionId] ?? [];
    const key = candidates.find((k) => availableColumnKeys.includes(k));
    if (!key) {
      onDrillFilterApplied?.();
      return;
    }
    if (getColumnFilterType(key) !== "checkbox") {
      onDrillFilterApplied?.();
      return;
    }
    const opts = getUniqueValues(key);
    let v = drillFilter.value;
    if (v === "(blank)" || v === "") {
      if (opts.includes("")) v = "";
      else if (!opts.includes("(blank)") && opts.length > 0) {
        v = opts.find((o) => !String(o).trim()) ?? v;
      }
    }
    if (!opts.includes(v)) {
      const t = String(v).trim();
      const exact = opts.find((o) => String(o).trim() === t);
      if (exact) v = exact;
      else {
        const ci = opts.find((o) => o.toLowerCase() === t.toLowerCase());
        if (ci) v = ci;
      }
    }

    startTransition(() => {
      setCheckboxFilter(key, new Set([v]));
      setPage(1);
      setVisibleColumnKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    });
    onDrillFilterApplied?.();
  }, [
    drillFilter,
    availableColumnKeys,
    columnFacets,
    getColumnFilterType,
    getUniqueValues,
    onDrillFilterApplied,
    setCheckboxFilter,
  ]);

  const clearAllFilters = () => {
    setCheckboxFilters({});
    setRangeFilters({});
    setDateFilters({});
    setLeadTimeMode("lt");
    setRddDaysFilter("all");
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

  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    let result = [...orders];

    if (deferredSearch) {
      const q = deferredSearch.toLowerCase();
      result = result.filter((o) => {
        const haystack = [o.salesOrder, o.customer, o.material, o.plant, o.reqDelivery, o.leadTime, o.status]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Lead time filter (same numeric basis as the Lead Time column; non-numeric rows only in "< 60")
    result = result.filter((o) => {
      const days = parseLeadTimeDaysForFilter(o);
      if (days === null) return leadTimeMode === "lt";
      return leadTimeMode === "lt" ? days < LEAD_TIME_THRESHOLD : days >= LEAD_TIME_THRESHOLD;
    });

    // RDD days filter
    if (rddDaysFilter !== "all") {
      result = result.filter((o) => {
        const days = getRddWindowDays(o);
        if (days === null) return false;
        switch (rddDaysFilter) {
          case "lt3":
            return days < 3;
          case "gte3":
            return days >= 3;
          case "lt7":
            return days < 7;
          case "gte7":
            return days >= 7;
          default:
            return true;
        }
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
        const start = parseDateRobust(range.start);
        if (start) {
          result = result.filter((o) => {
            const raw = String(getCellValue(o, key));
            const d = parseDateRobust(raw);
            return !d || d >= start;
          });
        }
      }
      if (range.end) {
        const end = parseDateRobust(range.end);
        if (end) {
          end.setHours(23, 59, 59, 999);
          result = result.filter((o) => {
            const raw = String(getCellValue(o, key));
            const d = parseDateRobust(raw);
            return !d || d <= end;
          });
        }
      }
    }

    if (sortBy) {
      result.sort((a, b) => {
        let aVal: string | number = getCellValue(a, sortBy);
        let bVal: string | number = getCellValue(b, sortBy);
        if (isDateColumnKey(sortBy)) {
          const da = parseDateRobust(String(aVal));
          const db = parseDateRobust(String(bVal));
          if (da && db) {
            return sortDir === "asc" ? da.getTime() - db.getTime() : db.getTime() - da.getTime();
          }
          if (da) return sortDir === "asc" ? -1 : 1;
          if (db) return sortDir === "asc" ? 1 : -1;
        }
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
  }, [orders, deferredSearch, sortBy, sortDir, checkboxFilters, rangeFilters, dateFilters, leadTimeMode]);

  useEffect(() => {
    onFilteredOrdersChange?.(filtered);
  }, [filtered, onFilteredOrdersChange]);

  const filteredLengthRef = useRef<number | null>(null);
  useEffect(() => {
    if (filteredLengthRef.current === null) {
      filteredLengthRef.current = filtered.length;
      return;
    }
    if (filteredLengthRef.current !== filtered.length) {
      filteredLengthRef.current = filtered.length;
      setPage(1);
    }
  }, [filtered.length]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageOrders = filtered.slice((page - 1) * pageSize, page * pageSize);

  const statusFilterKey = useMemo(
    () => availableColumnKeys.find((k) => isStatusColumnKey(k, availableColumnKeys)),
    [availableColumnKeys]
  );

  const customerPickupFilterKey = useMemo(
    () => availableColumnKeys.find((k) => isCustomerPickupColumnKey(k, availableColumnKeys)),
    [availableColumnKeys]
  );

  const legacyFirmFilterKey = useMemo(
    () => availableColumnKeys.find((k) => isLegacyFirmColumnKey(k, availableColumnKeys)),
    [availableColumnKeys]
  );

  const soKey = useMemo(() => resolveDefaultColumn("sales order", availableColumnKeys), [availableColumnKeys]);
  const soLineKey = useMemo(() => resolveDefaultColumn("so line", availableColumnKeys), [availableColumnKeys]);
  const rddKey = useMemo(() => resolveDefaultColumn("requested delivery date", availableColumnKeys), [availableColumnKeys]);
  const plantKey = useMemo(() => resolveDefaultColumn("plant", availableColumnKeys), [availableColumnKeys]);

  const topFilterKeys = useMemo(() => {
    return [soKey, soLineKey, rddKey, plantKey].filter((k) => availableColumnKeys.includes(k));
  }, [soKey, soLineKey, rddKey, plantKey, availableColumnKeys]);

  const statusUniqueValues = useMemo(
    () => (statusFilterKey ? getUniqueValues(statusFilterKey) : []),
    [statusFilterKey, getUniqueValues]
  );

  const statusHitToken = useMemo(() => pickStatusToken(statusUniqueValues, "hit"), [statusUniqueValues]);
  const statusMissToken = useMemo(() => pickStatusToken(statusUniqueValues, "miss"), [statusUniqueValues]);

  const statusSegment: "all" | "hit" | "miss" = useMemo(() => {
    if (!statusFilterKey) return "all";
    const sel = checkboxFilters[statusFilterKey];
    if (!sel || sel.size !== 1) return "all";
    if (statusHitToken && sel.has(statusHitToken)) return "hit";
    if (statusMissToken && sel.has(statusMissToken)) return "miss";
    return "all";
  }, [statusFilterKey, checkboxFilters, statusHitToken, statusMissToken]);

  // --- Customer Pickup Segment Filter ---
  const customerPickupUniqueValues = useMemo(
    () => (customerPickupFilterKey ? getUniqueValues(customerPickupFilterKey) : []),
    [customerPickupFilterKey, getUniqueValues]
  );

  const customerPickupYesToken = useMemo(() => pickYesNoToken(customerPickupUniqueValues, "yes"), [customerPickupUniqueValues]);
  const customerPickupNoToken = useMemo(() => pickYesNoToken(customerPickupUniqueValues, "no"), [customerPickupUniqueValues]);

  const customerPickupSegment: "all" | "yes" | "no" = useMemo(() => {
    if (!customerPickupFilterKey) return "all";
    const sel = checkboxFilters[customerPickupFilterKey];
    if (!sel || sel.size !== 1) return "all";
    if (customerPickupYesToken && sel.has(customerPickupYesToken)) return "yes";
    if (customerPickupNoToken && sel.has(customerPickupNoToken)) return "no";
    return "all";
  }, [customerPickupFilterKey, checkboxFilters, customerPickupYesToken, customerPickupNoToken]);

  const setCustomerPickupSegment = (mode: "all" | "yes" | "no") => {
    if (!customerPickupFilterKey) return;
    setPage(1);
    startTransition(() => {
      if (mode === "all") {
        setCheckboxFilter(customerPickupFilterKey, new Set());
        return;
      }
      const token = mode === "yes" ? customerPickupYesToken : customerPickupNoToken;
      if (token) setCheckboxFilter(customerPickupFilterKey, new Set([token]));
    });
  };

  const defaultInitializedRef = useRef(false);

  useEffect(() => {
    if (defaultInitializedRef.current) return;
    if (customerPickupFilterKey && customerPickupNoToken) {
      setCheckboxFilters((prev) => ({
        ...prev,
        [customerPickupFilterKey]: new Set([customerPickupNoToken]),
      }));
      defaultInitializedRef.current = true;
    }
  }, [customerPickupFilterKey, customerPickupNoToken]);

  // --- Legacy Firm Segment Filter ---
  const legacyFirmUniqueValues = useMemo(
    () => (legacyFirmFilterKey ? getUniqueValues(legacyFirmFilterKey) : []),
    [legacyFirmFilterKey, getUniqueValues]
  );

  const {
    solenis: legacySolenisToken,
    diversy: legacyDiversyToken,
    sigura: legacySiguraToken,
  } = useMemo(() => pickLegacyFirmTokens(legacyFirmUniqueValues), [legacyFirmUniqueValues]);

  const legacyFirmSegment: "all" | "solenis" | "diversy" | "sigura" = useMemo(() => {
    if (!legacyFirmFilterKey) return "all";
    const sel = checkboxFilters[legacyFirmFilterKey];
    if (!sel || sel.size !== 1) return "all";
    if (legacySolenisToken && sel.has(legacySolenisToken)) return "solenis";
    if (legacyDiversyToken && sel.has(legacyDiversyToken)) return "diversy";
    if (legacySiguraToken && sel.has(legacySiguraToken)) return "sigura";
    return "all";
  }, [legacyFirmFilterKey, checkboxFilters, legacySolenisToken, legacyDiversyToken, legacySiguraToken]);

  const setLegacyFirmSegment = (mode: "all" | "solenis" | "diversy" | "sigura") => {
    if (!legacyFirmFilterKey) return;
    setPage(1);
    startTransition(() => {
      if (mode === "all") {
        setCheckboxFilter(legacyFirmFilterKey, new Set());
        return;
      }
      let token: string | undefined;
      if (mode === "solenis") token = legacySolenisToken;
      else if (mode === "diversy") token = legacyDiversyToken;
      else if (mode === "sigura") token = legacySiguraToken;
      if (token) setCheckboxFilter(legacyFirmFilterKey, new Set([token]));
    });
  };

  const setStatusSegment = (mode: "all" | "hit" | "miss") => {
    if (!statusFilterKey) return;
    setPage(1);
    startTransition(() => {
      if (mode === "all") {
        setCheckboxFilter(statusFilterKey, new Set());
        return;
      }
      const token = mode === "hit" ? statusHitToken : statusMissToken;
      if (token) setCheckboxFilter(statusFilterKey, new Set([token]));
    });
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += Object.keys(checkboxFilters).length;
    count += Object.keys(rangeFilters).length;
    count += Object.keys(dateFilters).length;
    if (leadTimeMode !== "lt") count++;
    if (rddDaysFilter !== "all") count++;
    if (search) count++;
    return count;
  }, [checkboxFilters, rangeFilters, dateFilters, leadTimeMode, rddDaysFilter, search]);

  return (
    <div className="glass-table-panel animate-fade-in pl-4">
      {/* 1fr | auto | 1fr: true horizontal center for search; title flush left; actions flush right */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2 border-b px-6 py-4">
        <div className="min-w-0 justify-self-start pr-2">
          <h3 className="truncate text-left text-lg font-semibold text-foreground">
            Order-Level OTIF Assessment
          </h3>
        </div>
        <div className="relative w-full min-w-[12rem] max-w-md justify-self-center sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search orders…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-full border-neutral-200 bg-white pl-9 dark:border-border dark:bg-background"
          />
        </div>
        <div className="flex min-w-0 shrink-0 items-center justify-end justify-self-end gap-2 pl-2">
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
                  {availableColumnKeys
                    .filter((key) => ALLOWED_COLUMN_FILTERS.has(key.toLowerCase().trim()))
                    .map((key) => {
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
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="space-y-3 px-6 py-3">
        {/* ── Dynamic column filter dock ── */}
        <div
          className={cn(
            "scrollbar-hide flex min-w-0 flex-nowrap items-center gap-5 overflow-x-auto overflow-y-visible py-3 px-1.5 -my-3 [-webkit-overflow-scrolling:touch]",
            "[&>*]:shrink-0",
          )}
        >
          {statusFilterKey && (
            <div
              className={cn(
                "inline-flex items-center rounded-xl p-0.5 [--seg-r:calc(var(--radius)-0.125rem)] glass-surface glass-surface-ring shadow-sm transition-[border-color,box-shadow] duration-300",
                statusSegment === "miss" && "segment-glow-red",
                statusSegment === "hit" && "segment-glow-green"
              )}
              role="group"
              aria-label="Filter by OTIF status"
            >
              {(["all", "hit", "miss"] as const).map((mode, i, modes) => {
                const label = mode === "all" ? "All" : mode === "hit" ? "Hit" : "Miss";
                const active = statusSegment === mode;
                const disabled =
                  mode === "hit"
                    ? !statusHitToken
                    : mode === "miss"
                      ? !statusMissToken
                      : false;
                const activeGreen = active && (mode === "all" || mode === "hit");
                const activeRed = active && mode === "miss";
                const isFirst = i === 0;
                const isLast = i === modes.length - 1;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setStatusSegment(mode)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition-[color,background-color,box-shadow] duration-200",
                      isFirst ? "rounded-l-[var(--seg-r)]" : "rounded-l-md",
                      isLast ? "rounded-r-[var(--seg-r)]" : "rounded-r-md",
                      activeGreen && "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/20",
                      activeRed && "bg-destructive/20 text-destructive shadow-sm ring-1 ring-destructive/25",
                      !active && "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                      disabled && "pointer-events-none opacity-40"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {customerPickupFilterKey && (
            <div
              className={cn(
                "inline-flex items-center rounded-xl p-0.5 [--seg-r:calc(var(--radius)-0.125rem)] glass-surface glass-surface-ring shadow-sm transition-[border-color,box-shadow] duration-300",
                customerPickupSegment === "yes" && "segment-glow-green",
                customerPickupSegment === "no" && "segment-glow-red"
              )}
              role="group"
              aria-label="Filter by customer pickup"
            >
              {(["all", "yes", "no"] as const).map((mode, i, modes) => {
                const label = mode === "all" ? "All" : mode === "yes" ? "Yes" : "No";
                const active = customerPickupSegment === mode;
                const disabled =
                  mode === "yes"
                    ? !customerPickupYesToken
                    : mode === "no"
                      ? !customerPickupNoToken
                      : false;
                const activeGreen = active && (mode === "all" || mode === "yes");
                const activeRed = active && mode === "no";
                const isFirst = i === 0;
                const isLast = i === modes.length - 1;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setCustomerPickupSegment(mode)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition-[color,background-color,box-shadow] duration-200",
                      isFirst ? "rounded-l-[var(--seg-r)]" : "rounded-l-md",
                      isLast ? "rounded-r-[var(--seg-r)]" : "rounded-r-md",
                      activeGreen && "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/20",
                      activeRed && "bg-destructive/20 text-destructive shadow-sm ring-1 ring-destructive/25",
                      !active && "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                      disabled && "pointer-events-none opacity-40"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {legacyFirmFilterKey && (
            <div
              className={cn(
                "inline-flex items-center rounded-xl p-0.5 [--seg-r:calc(var(--radius)-0.125rem)] glass-surface glass-surface-ring shadow-sm transition-[border-color,box-shadow] duration-300",
                legacyFirmSegment === "solenis" && "segment-glow-green",
                legacyFirmSegment === "diversy" && "segment-glow-diversy",
                legacyFirmSegment === "sigura" && "segment-glow-sigura"
              )}
              role="group"
              aria-label="Filter by legacy firm"
            >
              {(["all", "solenis", "diversy", "sigura"] as const).map((mode, i, modes) => {
                const label =
                  mode === "all"
                    ? "All"
                    : mode === "solenis"
                      ? "Solenis"
                      : mode === "diversy"
                        ? "Diversey"
                        : "Sigura";
                const active = legacyFirmSegment === mode;
                const disabled =
                  mode === "solenis"
                    ? !legacySolenisToken
                    : mode === "diversy"
                      ? !legacyDiversyToken
                      : mode === "sigura"
                        ? !legacySiguraToken
                        : false;
                const activeSolenis = active && mode === "solenis";
                const activeDiversy = active && mode === "diversy";
                const activeSigura = active && mode === "sigura";
                const activeAll = active && mode === "all";
                const isFirst = i === 0;
                const isLast = i === modes.length - 1;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setLegacyFirmSegment(mode)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition-[color,background-color,box-shadow] duration-200",
                      isFirst ? "rounded-l-[var(--seg-r)]" : "rounded-l-md",
                      isLast ? "rounded-r-[var(--seg-r)]" : "rounded-r-md",
                      activeAll && "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/20",
                      activeSolenis && "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/20",
                      activeDiversy && "active-segment-diversy",
                      activeSigura && "active-segment-sigura",
                      !active && "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                      disabled && "pointer-events-none opacity-40"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {topFilterKeys.map((key) => {
            const label = getColumnDisplayName(key);
            const filterType = getColumnFilterType(key);
            const isActive = columnHasActiveFilter(key);

            const pillClass = cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            );

            if (filterType === "none") return null;

            if (filterType === "checkbox") {
              const opts = getUniqueValues(key);
              const selected = checkboxFilters[key] ?? EMPTY_FILTER_SELECTION;
              return (
                <ColumnFilterCheckbox
                  key={key}
                  label={label}
                  options={opts}
                  selected={selected}
                  onChange={(val) => {
                    setPage(1);
                    startTransition(() => setCheckboxFilter(key, val));
                  }}
                  triggerClassName={pillClass}
                  showLabel
                />
              );
            }

            if (filterType === "range") {
              const bounds = getRangeBounds(key);
              const unit = key === "riskScore" ? "%" : "";
              return (
                <ColumnFilterRange
                  key={key}
                  label={label}
                  min={bounds.min}
                  max={bounds.max}
                  currentMin={rangeFilters[key]?.min}
                  currentMax={rangeFilters[key]?.max}
                  unit={unit}
                  onChange={(mn, mx) => {
                    setPage(1);
                    startTransition(() => setRangeFilter(key, mn, mx));
                  }}
                  triggerClassName={pillClass}
                  showLabel
                  variant={key === "riskScore" ? "riskScore" : "default"}
                />
              );
            }

            if (filterType === "date") {
              return (
                <div key={key} className="inline-flex items-center gap-2">
                  <ColumnFilterDate
                    label={label}
                    currentStart={dateFilters[key]?.start}
                    currentEnd={dateFilters[key]?.end}
                    onChange={(s, e) => {
                      setPage(1);
                      startTransition(() => setDateFilter(key, s, e));
                    }}
                    triggerClassName={pillClass}
                    showLabel
                  />
                  {key === rddKey && (
                    <div
                      className={cn(
                        "inline-flex items-center rounded-xl p-0.5 [--seg-r:calc(var(--radius)-0.125rem)] glass-surface glass-surface-ring shadow-sm transition-[border-color,box-shadow] duration-300",
                        rddDaysFilter !== "all" &&
                          "border-primary/35 shadow-[0_8px_28px_-10px_hsl(var(--primary)/0.22)] dark:border-primary/25"
                      )}
                      role="group"
                      aria-label="Filter by RDD lead window"
                    >
                      {([
                        { value: "all", label: "All" },
                        { value: "lt3", label: "< 3 Days" },
                        { value: "gte3", label: "≥ 3 Days" },
                        { value: "lt7", label: "< 7 Days" },
                        { value: "gte7", label: "≥ 7 Days" },
                      ] as const).map((opt, i, opts) => {
                        const active = rddDaysFilter === opt.value;
                        const isFirst = i === 0;
                        const isLast = i === opts.length - 1;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setPage(1);
                              setRddDaysFilter(opt.value);
                            }}
                            className={cn(
                              "px-2.5 py-1.5 text-[11px] font-semibold transition-[color,background-color,box-shadow] duration-200",
                              isFirst ? "rounded-l-[var(--seg-r)]" : "rounded-l-md",
                              isLast ? "rounded-r-[var(--seg-r)]" : "rounded-r-md",
                              active && "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/20",
                              !active && "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Clear Filters
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                {activeFilterCount}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-x-4">
          <p className="min-w-0">
            Showing <span className="tabular-nums text-foreground/90">{pageOrders.length}</span> of{" "}
            <span className="tabular-nums text-foreground/90">{filtered.length}</span> orders
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="order-page-size" className="whitespace-nowrap">
              Rows per page
            </label>
            <Input
              id="order-page-size"
              type="number"
              min={PAGE_SIZE_MIN}
              max={PAGE_SIZE_MAX}
              step={1}
              inputMode="numeric"
              aria-label="Rows per page"
              title={`${PAGE_SIZE_MIN}–${PAGE_SIZE_MAX} rows`}
              className={cn(
                "h-8 w-[4.5rem] tabular-nums px-2 text-xs shadow-sm [appearance:textfield]",
                "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              )}
              value={pageSizeDraft}
              onChange={(e) => setPageSizeDraft(e.target.value)}
              onBlur={flushPageSizeDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  flushPageSizeDraft();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        </div>
      </div>


      <div className="relative h-[500px] overflow-hidden bg-background px-6">
        <div className="absolute inset-0 overflow-x-auto overflow-y-auto bg-background">
        <table className="min-w-max w-full text-sm text-left">
          <thead>
            <tr>
              {visibleColumnKeys.map((key) => {
                const label = getColumnDisplayName(key);
                const width = getColWidth(key);
                const showHeaderChrome = sortBy === key;
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
                    className="group/header relative sticky top-0 z-20 border-b border-border/60 bg-muted py-1.5 pl-2 pr-3 text-left align-middle shadow-sm select-none"
                    style={width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : undefined}
                    title={`${label} — Drag to reorder; drag right edge to resize.`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-1.5">
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                        {label}
                      </span>
                      <div
                        className={cn(
                          "flex shrink-0 items-center justify-end gap-px transition-opacity duration-200 ease-out",
                          (showHeaderChrome || columnHasActiveFilter(key))
                            ? "opacity-100"
                            : "opacity-0 group-hover/header:opacity-100 focus-within:opacity-100",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          title="Sort column"
                          className={cn(
                            "inline-flex h-6 min-w-[1.375rem] items-center justify-center gap-px rounded px-0.5 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                            sortBy === key
                              ? "bg-primary/12 text-primary"
                              : "text-muted-foreground opacity-70 hover:opacity-100 hover:bg-muted/60 hover:text-foreground",
                          )}
                        >
                          <ArrowUpDown className="h-2 w-2 shrink-0" strokeWidth={2.5} />
                          {sortBy === key && (
                            <ChevronDown
                              className={cn("h-2 w-2 shrink-0 transition-transform duration-200", sortDir === "asc" ? "rotate-180" : "")}
                              strokeWidth={2.5}
                            />
                          )}
                        </button>
                        {(() => {
                          const filterType = getColumnFilterType(key);
                          if (filterType === "none") return null;

                          if (filterType === "leadtime") {
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    title="Filter Lead Time"
                                    className={cn(
                                      "inline-flex h-6 w-6 items-center justify-center rounded transition-all duration-200",
                                      leadTimeMode !== "lt"
                                        ? "bg-primary/12 text-primary opacity-100"
                                        : "text-muted-foreground opacity-70 hover:opacity-100 hover:bg-muted/60 hover:text-foreground"
                                    )}
                                  >
                                    <Filter className="h-3 w-3" strokeWidth={2.5} />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-48 p-2 z-[100]">
                                  <p className="mb-2 text-xs font-semibold px-1">Lead Time Filter</p>
                                  <div className="space-y-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPage(1);
                                        setLeadTimeMode("lt");
                                      }}
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded transition-colors",
                                        leadTimeMode === "lt"
                                          ? "bg-primary/15 text-primary font-semibold"
                                          : "hover:bg-muted text-muted-foreground"
                                      )}
                                    >
                                      &lt; 60 days
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPage(1);
                                        setLeadTimeMode("gte");
                                      }}
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded transition-colors",
                                        leadTimeMode === "gte"
                                          ? "bg-primary/15 text-primary font-semibold"
                                          : "hover:bg-muted text-muted-foreground"
                                      )}
                                    >
                                      ≥ 60 days
                                    </button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          }

                          if (filterType === "checkbox") {
                            const opts = getUniqueValues(key);
                            const selected = checkboxFilters[key] ?? EMPTY_FILTER_SELECTION;
                            return (
                              <ColumnFilterCheckbox
                                label={label}
                                options={opts}
                                selected={selected}
                                onChange={(val) => {
                                  setPage(1);
                                  startTransition(() => setCheckboxFilter(key, val));
                                }}
                                showLabel={false}
                              />
                            );
                          }

                          if (filterType === "range") {
                            const bounds = getRangeBounds(key);
                            const unit = key === "riskScore" ? "%" : "";
                            return (
                              <ColumnFilterRange
                                label={label}
                                min={bounds.min}
                                max={bounds.max}
                                currentMin={rangeFilters[key]?.min}
                                currentMax={rangeFilters[key]?.max}
                                unit={unit}
                                onChange={(mn, mx) => {
                                  setPage(1);
                                  startTransition(() => setRangeFilter(key, mn, mx));
                                }}
                                showLabel={false}
                                variant={key === "riskScore" ? "riskScore" : "default"}
                              />
                            );
                          }

                          if (filterType === "date") {
                            return (
                              <ColumnFilterDate
                                label={label}
                                currentStart={dateFilters[key]?.start}
                                currentEnd={dateFilters[key]?.end}
                                onChange={(s, e) => {
                                  setPage(1);
                                  startTransition(() => setDateFilter(key, s, e));
                                }}
                                showLabel={false}
                              />
                            );
                          }

                          return null;
                        })()}
                      </div>
                    </div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const th = (e.currentTarget as HTMLDivElement).parentElement as HTMLElement | null;
                        const startWidth = th ? th.getBoundingClientRect().width : (getColWidth(key) ?? 160);
                        resizeRef.current = { key, startX: e.clientX, startWidth };
                        document.body.style.cursor = "col-resize";
                        document.body.style.userSelect = "none";
                      }}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize group"
                      title="Drag to resize"
                    >
                      <div className="mx-auto h-full w-px bg-border group-hover:bg-muted-foreground/40" />
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
                className="cursor-pointer transition-[background-color] duration-200 ease-out hover:bg-muted/40"
                onClick={() => onOrderClick(o)}
              >
                {visibleColumnKeys.map((key) => {
                  let val = key === "riskSignals" ? getRiskSignals(o) : getCellValue(o, key);
                  if ((key === "top1_feature" || key === "top2_feature" || key === "top3_feature") && typeof val === "string") {
                    val = translateFeatureName(val);
                  }
                  const isStatus = key === "status" || key === "otif_hit/miss" || key === "otif_hit" || key === "combined_otif";
                  const isSalesOrder = key === "sales order" || key === "sales_order" || key === "sales order_x";
                  const isRiskScore = key === "riskScore";
                  const width = getColWidth(key);
                  return (
                    <td
                      key={key}
                      className={`py-3 pr-4 text-left border-b border-border/50 align-top ${
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
                      ) : key === "rule_applied" && typeof val === "string" ? (
                        <span className="text-[11px] text-muted-foreground leading-snug block text-left break-words whitespace-normal">
                          {(() => {
                            const trimmed = val.trim();
                            const desc = RULE_DESCRIPTIONS[trimmed];
                            if (!desc) return val;
                            const prefixes = trimmed
                              .split("|")
                              .map((part) => part.split(":")[0].trim())
                              .filter(Boolean)
                              .join("|");
                            return prefixes ? `${prefixes}: ${desc}` : desc;
                          })()}
                        </span>
                      ) : (
                        <span className="block text-left break-words whitespace-normal">{String(val ?? "")}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>        </div>      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <div className="flex min-h-8 flex-col items-center justify-center gap-1 sm:flex-row sm:gap-3">
            {!goToPageOpen ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setGoToPageDraft(String(page));
                    setGoToPageOpen(true);
                  }}
                >
                  Go to page…
                </button>
              </>
            ) : (
              <form
                className="flex flex-wrap items-center justify-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number.parseInt(goToPageDraft.trim(), 10);
                  if (!Number.isFinite(n)) return;
                  const next = Math.min(totalPages, Math.max(1, n));
                  setPage(next);
                  setGoToPageOpen(false);
                }}
              >
                <span className="text-xs text-muted-foreground">Page</span>
                <Input
                  type="number"
                  min={1}
                  max={totalPages}
                  inputMode="numeric"
                  value={goToPageDraft}
                  onChange={(e) => setGoToPageDraft(e.target.value)}
                  className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setGoToPageOpen(false);
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">of {totalPages}</span>
                <Button type="submit" size="sm" className="h-8 px-3">
                  Go
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setGoToPageOpen(false)}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
