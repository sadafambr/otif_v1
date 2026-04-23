import { useMemo, useState, useEffect, useCallback, memo } from "react";
import {
  Package, TrendingUp, TrendingDown, BarChart3,
  PieChart as PieChartIcon, Activity, Globe, Building2,
  Factory, Boxes, ChevronDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LabelList,
} from "recharts";
import type { OTIFRecord } from "@/types/otif";
import { ColumnFilterCheckbox } from "@/components/ColumnFilterCheckbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PIE_COLORS = [
  "hsl(220, 70%, 55%)", "hsl(0, 72%, 51%)", "hsl(32, 95%, 55%)",
  "hsl(160, 84%, 39%)", "hsl(280, 60%, 55%)", "hsl(180, 60%, 45%)",
  "hsl(340, 65%, 50%)", "hsl(100, 55%, 45%)", "hsl(50, 80%, 50%)",
  "hsl(200, 65%, 50%)",
];

const HISTOGRAM_COLORS = [
  "hsl(220, 70%, 55%)", "hsl(32, 95%, 55%)", "hsl(160, 84%, 39%)",
  "hsl(280, 60%, 55%)", "hsl(0, 72%, 51%)",
];

function getColor(palette: string[], i: number): string {
  return palette[i % palette.length];
}

interface DimensionDef {
  id: string;
  label: string;
  icon: typeof Globe;
  accessor: (o: OTIFRecord) => string;
}

const MISS_DIMENSIONS: DimensionDef[] = [
  { id: "businessUnit", label: "Business Unit", icon: Building2, accessor: (o) => (o.rawData?.["division of business name"] ?? "").trim() || "(blank)" },
  { id: "plant", label: "Plant", icon: Factory, accessor: (o) => o.plant || "(blank)" },
  { id: "material", label: "Material", icon: Boxes, accessor: (o) => o.material || "(blank)" },
  { id: "customer", label: "Customer", icon: Package, accessor: (o) => o.customer || "(blank)" },
];

const TOP_MISS_CARD_ROWS = 3;
const TOP_MISS_EXPANDED_ROWS = 20;
/** Inline chevron / subtle chrome for Miss overview cards */
const MISS_OVERVIEW_CHEVRON_COLOR = "#6b7280";

/** Show empty dimension buckets as "Not Defined" in Miss overview stat cards */
function formatMissOverviewDisplayLabel(raw: string): string {
  return raw.replace(/\(blank\)/gi, "Not Defined");
}

function buildMissRanking(
  orders: OTIFRecord[],
  accessor: (o: OTIFRecord) => string,
  displayNameAccessor?: (o: OTIFRecord) => string,
  topN = 3
) {
  const countMap = new Map<string, { count: number; displayName: string }>();
  for (const o of orders) {
    if (o.status !== "Miss") continue;
    const val = accessor(o);
    const displayName = displayNameAccessor ? displayNameAccessor(o) : val;
    const entry = countMap.get(val);
    if (entry) {
      entry.count++;
    } else {
      countMap.set(val, { count: 1, displayName });
    }
  }
  return Array.from(countMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([name, data]) => ({ name, displayName: data.displayName, count: data.count }));
}

function buildDimensionStats(orders: OTIFRecord[], accessor: (o: OTIFRecord) => string) {
  const map = new Map<string, { total: number; miss: number }>();
  for (const o of orders) {
    const val = accessor(o);
    const entry = map.get(val) || { total: 0, miss: 0 };
    entry.total++;
    if (o.status === "Miss") entry.miss++;
    map.set(val, entry);
  }
  return Array.from(map.entries())
    .map(([name, stats]) => ({
      name: name.length > 30 ? name.slice(0, 27) + "..." : name,
      fullName: name,
      total: stats.total,
      miss: stats.miss,
      hit: stats.total - stats.miss,
      missRate: stats.total > 0 ? Math.round((stats.miss / stats.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.miss - a.miss);
}

/** `topN === null` returns all groups sorted by miss rate (for client-side table filters). */
function buildDistribution(
  orders: OTIFRecord[],
  accessor: (o: OTIFRecord) => string,
  topN: number | null = 10,
) {
  const countMap = new Map<string, { total: number; miss: number; hit: number }>();
  for (const o of orders) {
    const val = accessor(o).trim() || "(blank)";
    const entry = countMap.get(val) || { total: 0, miss: 0, hit: 0 };
    entry.total++;
    if (o.status === "Miss") entry.miss++;
    else entry.hit++;
    countMap.set(val, entry);
  }
  const sorted = Array.from(countMap.entries())
    .map(([name, stats]) => ({
      name: name.length > 25 ? name.slice(0, 22) + "..." : name,
      fullName: name,
      ...stats,
      missRate: stats.total > 0 ? Math.round((stats.miss / stats.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.missRate - a.missRate);
  if (topN != null && topN > 0) return sorted.slice(0, topN);
  return sorted;
}

const EMPTY_DIM_INCLUDE = new Set<string>();

const MISS_TABLE_ROWS_MAX = 500;
const MISS_TABLE_ROWS_DEFAULT = 10;

/** Which orders feed the Miss Rate table aggregation */
type MissRateTableOrderFilter = "all" | "hit" | "miss";

/** Hit/Miss by dimension chart — teal hit, softer red miss */
const ANALYTICS_HIT_FILL = "hsl(160, 72%, 36%)";
const ANALYTICS_MISS_FILL = "#EF5350";

const CHART_CARD_SHELL =
  "overflow-hidden rounded-2xl border border-border/55 bg-gradient-to-b from-muted/30 via-card/90 to-muted/20 p-5 shadow-lg shadow-black/[0.07] ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:from-muted/20 dark:via-card/60 dark:to-muted/15 dark:shadow-black/40 dark:ring-white/[0.06]";
const CHART_TITLE_CLASS = "text-[13px] font-semibold tracking-tight text-foreground";
const CHART_INNER_SURFACE =
  "rounded-xl bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,hsl(var(--muted)/0.35),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.12),transparent)] px-1 pb-1 pt-2 dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,hsl(var(--muted)/0.2),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.08),transparent)]";

type DimSeriesKey = "hit" | "miss";

function renderHitMissPieLabel(props: {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  name: string;
  percent: number;
}) {
  const RADIAN = Math.PI / 180;
  const r = props.outerRadius + 24;
  const x = props.cx + r * Math.cos(-props.midAngle * RADIAN);
  const y = props.cy + r * Math.sin(-props.midAngle * RADIAN);
  const textAnchor = x > props.cx ? "start" : "end";
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      className="fill-foreground text-[11px] font-semibold tabular-nums"
    >
      {`${props.name} ${(props.percent * 100).toFixed(1)}%`}
    </text>
  );
}

function HitMissPieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number; payload?: { name?: string }; color?: string }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const name = row.name ?? row.payload?.name ?? "";
  const value = typeof row.value === "number" ? row.value : 0;
  const total = payload.reduce((s, p) => s + (typeof p.value === "number" ? p.value : 0), 0);
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="glass-popover rounded-lg border border-border/50 px-3 py-2 text-sm shadow-md">
      <p className="text-xs font-semibold" style={{ color: row.color }}>
        {name}
      </p>
      <p className="mt-1 text-xs tabular-nums text-foreground">
        Count: {value.toLocaleString()} <span className="text-muted-foreground">({pct}%)</span>
      </p>
    </div>
  );
}

function LeadTimeBucketTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: Record<string, unknown> }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { name?: string; hit: number; miss: number; total: number; missRate: number };
  if (!row) return null;
  const hit = Number(row.hit) || 0;
  const miss = Number(row.miss) || 0;
  const total = Number(row.total) || hit + miss;
  const hitPct = total > 0 ? ((hit / total) * 100).toFixed(1) : "0.0";
  const missPct = total > 0 ? ((miss / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="glass-popover rounded-lg border border-border/50 px-3 py-2.5 text-sm shadow-md">
      <p className="mb-2 text-[13px] font-semibold text-foreground">Lead time: {row.name ?? label} days</p>
      <p className="text-xs tabular-nums" style={{ color: ANALYTICS_HIT_FILL }}>
        Hit: {hit.toLocaleString()} <span className="text-muted-foreground">({hitPct}%)</span>
      </p>
      <p className="text-xs tabular-nums" style={{ color: ANALYTICS_MISS_FILL }}>
        Miss: {miss.toLocaleString()} <span className="text-muted-foreground">({missPct}%)</span>
      </p>
      <p className="mt-1.5 border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground tabular-nums">
        Total orders in bucket: {total.toLocaleString()} · Miss rate {row.missRate ?? 0}%
      </p>
    </div>
  );
}

function LeadTimeSegmentLabel(props: Record<string, unknown>) {
  const v = Number(props.value) || 0;
  if (v <= 0) return null;
  const x = Number(props.x);
  const y = Number(props.y);
  const w = Number(props.width);
  const h = Number(props.height);
  if (!Number.isFinite(h) || h < 14) return null;
  return (
    <text
      x={x + w / 2}
      y={y + h / 2}
      fill="white"
      fontSize={11}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="middle"
      className="tabular-nums"
      style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.35)" }}
    >
      {v.toLocaleString()}
    </text>
  );
}

function buildLeadTimeBuckets(orders: OTIFRecord[]) {
  const buckets = [
    { name: "0-15", min: 0, max: 15, total: 0, miss: 0, hit: 0 },
    { name: "16-30", min: 16, max: 30, total: 0, miss: 0, hit: 0 },
    { name: "31-60", min: 31, max: 60, total: 0, miss: 0, hit: 0 },
    { name: "61-90", min: 61, max: 90, total: 0, miss: 0, hit: 0 },
    { name: "91-120", min: 91, max: 120, total: 0, miss: 0, hit: 0 },
    { name: "120+", min: 121, max: Infinity, total: 0, miss: 0, hit: 0 },
  ];
  for (const o of orders) {
    const lt = parseInt(o.leadTime, 10);
    if (isNaN(lt)) continue;
    const bucket = buckets.find((b) => lt >= b.min && lt <= b.max);
    if (bucket) {
      bucket.total++;
      if (o.status === "Miss") bucket.miss++;
      else bucket.hit++;
    }
  }
  return buckets.map((b) => ({
    name: b.name,
    total: b.total,
    miss: b.miss,
    hit: b.hit,
    missRate: b.total > 0 ? Math.round((b.miss / b.total) * 1000) / 10 : 0,
  }));
}

const HIGH_RISK_THRESHOLD = 75;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-popover rounded-lg px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground mb-1">{payload[0]?.payload?.fullName ?? label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
};

/** Stacked horizontal bar — label at end of bar with H / M counts */
function HitMissBarEndLabels(props: Record<string, unknown>) {
  const x = props.x as number;
  const y = props.y as number;
  const w = props.width as number;
  const h = props.height as number;
  const payload = props.payload as { hit?: number; miss?: number } | undefined;
  if (!payload || (typeof h === "number" && h < 4)) return null;
  const hit = Number(payload.hit) || 0;
  const miss = Number(payload.miss) || 0;
  const barEndX = x + w + 6;
  const barY = y + h / 2;
  return (
    <text x={barEndX} y={barY} fontSize={11} fontWeight={500} dominantBaseline="middle" className="tabular-nums">
      <tspan fill={ANALYTICS_HIT_FILL}>H {hit.toLocaleString()}</tspan>
      <tspan fill="hsl(var(--muted-foreground))"> · </tspan>
      <tspan fill={ANALYTICS_MISS_FILL}>M {miss.toLocaleString()}</tspan>
    </text>
  );
}

function DimensionHitMissTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Record<string, number | string> }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { fullName?: string; name?: string; hit: number; miss: number } | undefined;
  if (!row) return null;
  const hit = Number(row.hit) || 0;
  const miss = Number(row.miss) || 0;
  const total = hit + miss;
  const hitPct = total > 0 ? ((hit / total) * 100).toFixed(1) : "0.0";
  const missPct = total > 0 ? ((miss / total) * 100).toFixed(1) : "0.0";
  const title = String(row.fullName ?? row.name ?? "");
  return (
    <div className="glass-popover rounded-lg border border-border/50 px-3 py-2.5 text-sm shadow-md">
      <p className="mb-2 font-medium text-foreground">{title}</p>
      <p className="text-xs tabular-nums" style={{ color: ANALYTICS_HIT_FILL }}>
        Hit: {hit.toLocaleString()} <span className="text-muted-foreground">({hitPct}%)</span>
      </p>
      <p className="text-xs tabular-nums" style={{ color: ANALYTICS_MISS_FILL }}>
        Miss: {miss.toLocaleString()} <span className="text-muted-foreground">({missPct}%)</span>
      </p>
      <p className="mt-1.5 border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground tabular-nums">
        Total: {total.toLocaleString()}
      </p>
    </div>
  );
}

interface OTIFAnalyticsPanelProps {
  orders: OTIFRecord[];
}

function OTIFAnalyticsPanelInner({ orders }: OTIFAnalyticsPanelProps) {
  const [missCardExpanded, setMissCardExpanded] = useState<Record<string, boolean>>({});
  const [selectedDimension, setSelectedDimension] = useState("plant");
  const [tableRowsInput, setTableRowsInput] = useState(String(MISS_TABLE_ROWS_DEFAULT));
  const tableTopNNum = useMemo(() => {
    const n = parseInt(String(tableRowsInput).replace(/\D/g, ""), 10);
    if (!Number.isFinite(n)) return MISS_TABLE_ROWS_DEFAULT;
    return Math.min(MISS_TABLE_ROWS_MAX, Math.max(1, n));
  }, [tableRowsInput]);
  const [tableMinTotal, setTableMinTotal] = useState<string>("");
  const [tableMinMissRate, setTableMinMissRate] = useState<string>("");
  const [tableIncludeKeys, setTableIncludeKeys] = useState<Set<string>>(EMPTY_DIM_INCLUDE);
  const [missRateTableOrderFilter, setMissRateTableOrderFilter] =
    useState<MissRateTableOrderFilter>("all");
  const [dimSeriesVisible, setDimSeriesVisible] = useState<Record<DimSeriesKey, boolean>>({
    hit: true,
    miss: true,
  });

  const overallStats = useMemo(() => {
    const total = orders.length;
    const miss = orders.filter((r) => r.status === "Miss").length;
    const hit = total - miss;
    const avgLeadTime =
      orders.reduce((s, r) => s + (parseInt(r.leadTime, 10) || 0), 0) / (total || 1);
    const avgRiskScore =
      orders.reduce((s, r) => s + (r.riskScore || 0), 0) / (total || 1);
    return {
      total, miss, hit,
      missRate: total > 0 ? Math.round((miss / total) * 1000) / 10 : 0,
      hitRate: total > 0 ? Math.round((hit / total) * 1000) / 10 : 0,
      avgLeadTime: Math.round(avgLeadTime * 10) / 10,
      avgRiskScore: Math.round(avgRiskScore * 10) / 10,
    };
  }, [orders]);

  const hitMissPie = useMemo(
    () => [
      { name: "Hit", value: overallStats.hit, color: ANALYTICS_HIT_FILL },
      { name: "Miss", value: overallStats.miss, color: ANALYTICS_MISS_FILL },
    ],
    [overallStats]
  );

  const topMissRankings = useMemo(() => {
    const result: Record<string, { name: string; displayName: string; count: number }[]> = {};
    for (const dim of MISS_DIMENSIONS) {
      let displayNameAccessor: ((o: OTIFRecord) => string) | undefined;
      
      // For material and plant, try to get more descriptive names from rawData
      if (dim.id === "material") {
        displayNameAccessor = (o) => {
          const materialCode = o.material || "(blank)";
          const materialDesc = o.rawData?.["material description"] || o.rawData?.["material"] || "";
          return materialDesc ? `${materialCode} - ${materialDesc}` : materialCode;
        };
      } else if (dim.id === "plant") {
        displayNameAccessor = (o) => {
          const plantCode = o.plant || "(blank)";
          const plantDesc = o.rawData?.["plant description"] || o.rawData?.["plant name"] || "";
          return plantDesc ? `${plantCode} - ${plantDesc}` : plantCode;
        };
      }
      
      result[dim.id] = buildMissRanking(orders, dim.accessor, displayNameAccessor, TOP_MISS_EXPANDED_ROWS);
    }
    return result;
  }, [orders]);

  const highRiskMissOrders = useMemo(
    () => orders.filter((r) => r.status === "Miss" && r.riskScore >= HIGH_RISK_THRESHOLD),
    [orders]
  );

  const analyticsDimConfig = MISS_DIMENSIONS.find((d) => d.id === selectedDimension)!;

  const distributionAll = useMemo(
    () => buildDistribution(orders, analyticsDimConfig.accessor, null),
    [orders, analyticsDimConfig],
  );

  const dimensionData = useMemo(() => distributionAll.slice(0, 10), [distributionAll]);

  useEffect(() => {
    setTableIncludeKeys(EMPTY_DIM_INCLUDE);
    setTableMinTotal("");
    setTableMinMissRate("");
    setTableRowsInput(String(MISS_TABLE_ROWS_DEFAULT));
    setMissRateTableOrderFilter("all");
    setDimSeriesVisible({ hit: true, miss: true });
  }, [selectedDimension]);

  useEffect(() => {
    setTableIncludeKeys(EMPTY_DIM_INCLUDE);
  }, [missRateTableOrderFilter]);

  const toggleDimSeries = useCallback((key: DimSeriesKey) => {
    setDimSeriesVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.hit && !next.miss) return prev;
      return next;
    });
  }, []);

  const ordersForMissRateTable = useMemo(() => {
    if (missRateTableOrderFilter === "all") return orders;
    if (missRateTableOrderFilter === "hit") return orders.filter((o) => o.status === "Hit");
    return orders.filter((o) => o.status === "Miss");
  }, [orders, missRateTableOrderFilter]);

  const distributionForMissRateTable = useMemo(
    () => buildDistribution(ordersForMissRateTable, analyticsDimConfig.accessor, null),
    [ordersForMissRateTable, analyticsDimConfig],
  );

  const dimensionIncludeOptions = useMemo(() => {
    const keys = distributionForMissRateTable.map((r) => r.fullName);
    return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
  }, [distributionForMissRateTable]);

  const tableMinTotalNum = Math.max(0, parseInt(tableMinTotal, 10) || 0);
  const tableMinMissRateNum = Math.min(100, Math.max(0, parseFloat(tableMinMissRate) || 0));

  const dimensionTableRows = useMemo(() => {
    let rows = distributionForMissRateTable;
    if (tableMinTotalNum > 0) rows = rows.filter((r) => r.total >= tableMinTotalNum);
    if (tableMinMissRateNum > 0) rows = rows.filter((r) => r.missRate >= tableMinMissRateNum);
    if (tableIncludeKeys.size > 0) rows = rows.filter((r) => tableIncludeKeys.has(r.fullName));
    return rows.slice(0, tableTopNNum);
  }, [distributionForMissRateTable, tableMinTotalNum, tableMinMissRateNum, tableIncludeKeys, tableTopNNum]);

  const tableFilterActive =
    missRateTableOrderFilter !== "all" ||
    tableMinTotalNum > 0 ||
    tableMinMissRateNum > 0 ||
    tableIncludeKeys.size > 0 ||
    tableTopNNum !== MISS_TABLE_ROWS_DEFAULT;

  const clearTableFilters = useCallback(() => {
    setMissRateTableOrderFilter("all");
    setTableMinTotal("");
    setTableMinMissRate("");
    setTableIncludeKeys(EMPTY_DIM_INCLUDE);
    setTableRowsInput(String(MISS_TABLE_ROWS_DEFAULT));
  }, []);

  const setIncludeFilter = useCallback((next: Set<string>) => {
    setTableIncludeKeys(next.size === 0 ? EMPTY_DIM_INCLUDE : new Set(next));
  }, []);

  const leadTimeBuckets = useMemo(() => buildLeadTimeBuckets(orders), [orders]);

  const riskScoreBuckets = useMemo(() => {
    const buckets = [
      { name: "0-20%", min: 0, max: 20, count: 0 },
      { name: "21-40%", min: 21, max: 40, count: 0 },
      { name: "41-60%", min: 41, max: 60, count: 0 },
      { name: "61-80%", min: 61, max: 80, count: 0 },
      { name: "81-100%", min: 81, max: 100, count: 0 },
    ];
    for (const o of orders) {
      const score = o.riskScore;
      const bucket = buckets.find((b) => score >= b.min && score <= b.max);
      if (bucket) bucket.count++;
    }
    return buckets;
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
        <StatCard label="Total Orders" value={overallStats.total.toLocaleString()} icon={Package} />
        <StatCard label="Hit Rate" value={`${overallStats.hitRate}%`} icon={TrendingUp} accent="text-success" />
        <StatCard label="Miss Rate" value={`${overallStats.missRate}%`} icon={TrendingDown} accent="text-destructive" />
        <StatCard label="Total Miss" value={overallStats.miss.toLocaleString()} icon={TrendingDown} accent="text-destructive" />
      </div>

      {/* OTIF Miss Overview */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">OTIF Miss Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MISS_DIMENSIONS.map((dim) => {
            const Icon = dim.icon;
            const ranking = topMissRankings[dim.id] || [];
            const canExpand = ranking.length > TOP_MISS_CARD_ROWS;
            const isExpanded = !!missCardExpanded[dim.id];
            const displayRows =
              isExpanded && canExpand
                ? ranking.slice(0, TOP_MISS_EXPANDED_ROWS)
                : ranking.slice(0, TOP_MISS_CARD_ROWS);
            const maxCount = Math.max(1, displayRows[0]?.count ?? 1);

            return (
              <div
                key={dim.id}
                className="analytics-glass-card p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {ranking.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canExpand) return;
                          setMissCardExpanded((prev) => ({ ...prev, [dim.id]: !prev[dim.id] }));
                        }}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pl-0.5 pr-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                          canExpand && "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                          !canExpand && "cursor-default",
                        )}
                        aria-expanded={canExpand ? isExpanded : undefined}
                        aria-label={
                          canExpand
                            ? `${isExpanded ? "Collapse" : "Expand"} top miss list for ${dim.label}`
                            : undefined
                        }
                        disabled={!canExpand}
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none",
                            isExpanded && canExpand && "rotate-180",
                            !canExpand && "opacity-40",
                          )}
                          style={{ color: MISS_OVERVIEW_CHEVRON_COLOR }}
                          aria-hidden
                        />
                        <h4 className="text-sm font-semibold leading-tight text-foreground">
                          Top Miss by {dim.label}
                        </h4>
                      </button>
                    ) : (
                      <h4 className="text-sm font-semibold leading-tight text-foreground">
                        Top Miss by {dim.label}
                      </h4>
                    )}
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>

                <div
                  className={cn(
                    "overflow-hidden transition-[max-height] duration-300 ease-in-out motion-reduce:transition-none",
                    isExpanded && canExpand
                      ? "max-h-[min(22rem,55vh)]"
                      : "max-h-[10.5rem]",
                  )}
                >
                  <div
                    className={cn(
                      "space-y-0.5",
                      isExpanded && canExpand &&
                        "miss-overview-card-scroll max-h-[min(21rem,52vh)] overflow-y-auto overflow-x-hidden pr-1",
                    )}
                  >
                    {displayRows.length === 0 && (
                      <p className="text-xs text-muted-foreground py-1">No miss data</p>
                    )}
                    {displayRows.map((item, i) => {
                      const pct = Math.min(100, (item.count / maxCount) * 100);
                      const displayLabel = formatMissOverviewDisplayLabel(item.displayName);
                      const labelShort =
                        !isExpanded || !canExpand
                          ? displayLabel.length > 22
                            ? displayLabel.slice(0, 19) + "..."
                            : displayLabel
                          : displayLabel;
                      return (
                        <div
                          key={item.name}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/55 dark:hover:bg-white/[0.06]"
                          title={displayLabel}
                        >
                          <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{i + 1}.</span>
                            <span
                              className={cn(
                                "min-w-0 text-sm text-foreground",
                                !isExpanded || !canExpand ? "truncate" : "break-words",
                                i === 0 && "font-semibold",
                              )}
                            >
                              {labelShort}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div
                              className="h-1.5 w-10 overflow-hidden rounded-full bg-muted/80 ring-1 ring-inset ring-border/30 sm:w-14"
                              aria-hidden
                            >
                              <div
                                className="h-full rounded-full bg-destructive/80 transition-[width] duration-300 ease-out motion-reduce:transition-none dark:bg-destructive/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums text-destructive sm:w-12">
                              {item.count.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hit/Miss Pie + Lead Time Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={CHART_CARD_SHELL}>
          <div className="mb-3 flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className={CHART_TITLE_CLASS}>Hit vs Miss Distribution</h3>
          </div>
          <div className={cn("relative min-h-[280px]", CHART_INNER_SURFACE)}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 8, right: 32, bottom: 40, left: 32 }}>
                <Pie
                  data={hitMissPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="46%"
                  innerRadius="54%"
                  outerRadius="78%"
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  labelLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  label={renderHitMissPieLabel}
                >
                  {hitMissPie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<HitMissPieTooltip />} />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total orders</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">{overallStats.total.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className={CHART_CARD_SHELL}>
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className={CHART_TITLE_CLASS}>Lead Time Distribution</h3>
          </div>
          <div className={CHART_INNER_SURFACE}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={leadTimeBuckets} margin={{ top: 10, right: 8, left: 4, bottom: 28 }}>
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.85}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  label={{ value: "Lead time (days)", position: "insideBottom", offset: -4, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  width={44}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  allowDecimals={false}
                />
                <Tooltip content={<LeadTimeBucketTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.12)" }} />
                <Bar dataKey="hit" stackId="lt" fill={ANALYTICS_HIT_FILL} name="Hit" radius={[0, 0, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="hit" content={(props) => <LeadTimeSegmentLabel {...props} />} />
                </Bar>
                <Bar dataKey="miss" stackId="lt" fill={ANALYTICS_MISS_FILL} name="Miss" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="miss" content={(props) => <LeadTimeSegmentLabel {...props} />} />
                </Bar>
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Hit/Miss by Dimension */}
      <div className="analytics-glass-card p-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Hit/Miss by {analyticsDimConfig.label}
            </h3>
          </div>
          <nav className="flex flex-wrap gap-0.5 border-b border-border/60" aria-label="Chart dimension">
            {MISS_DIMENSIONS.map((dim) => {
              const active = selectedDimension === dim.id;
              return (
                <button
                  key={dim.id}
                  type="button"
                  onClick={() => setSelectedDimension(dim.id)}
                  className={cn(
                    "relative px-3 py-2 text-xs font-medium transition-colors duration-200",
                    active
                      ? "text-primary"
                      : "text-muted-foreground/70 hover:bg-muted/45 hover:text-foreground",
                  )}
                >
                  {dim.label}
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out",
                      active ? "scale-x-100" : "scale-x-0",
                    )}
                    aria-hidden
                  />
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mb-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-2">
          <button
            type="button"
            onClick={() => toggleDimSeries("hit")}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150",
              dimSeriesVisible.hit ? "text-foreground opacity-100" : "text-muted-foreground opacity-45 line-through decoration-muted-foreground/50",
            )}
            style={{ color: dimSeriesVisible.hit ? ANALYTICS_HIT_FILL : undefined }}
            title={dimSeriesVisible.hit ? "Hide Hit series" : "Show Hit series"}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: ANALYTICS_HIT_FILL }}
            />
            Hit
          </button>
          <button
            type="button"
            onClick={() => toggleDimSeries("miss")}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150",
              dimSeriesVisible.miss ? "text-foreground opacity-100" : "text-muted-foreground opacity-45 line-through decoration-muted-foreground/50",
            )}
            style={{ color: dimSeriesVisible.miss ? ANALYTICS_MISS_FILL : undefined }}
            title={dimSeriesVisible.miss ? "Hide Miss series" : "Show Miss series"}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: ANALYTICS_MISS_FILL }}
            />
            Miss
          </button>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={dimensionData}
            layout="vertical"
            margin={{ top: 4, right: 100, left: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical
              horizontal={false}
              stroke="hsl(220, 13%, 91%)"
              strokeOpacity={0.85}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={{ stroke: "hsl(220, 13%, 88%)" }}
              axisLine={{ stroke: "hsl(220, 13%, 88%)" }}
            />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip content={<DimensionHitMissTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)" }} />
            {dimSeriesVisible.hit && (
              <Bar
                dataKey="hit"
                stackId="dim"
                fill={ANALYTICS_HIT_FILL}
                name="Hit"
                radius={
                  dimSeriesVisible.miss
                    ? [6, 0, 0, 6]
                    : [6, 6, 6, 6]
                }
                maxBarSize={28}
              >
                <LabelList
                  dataKey="hit"
                  position="right"
                  content={(props: Record<string, unknown>) => {
                    const p = props.payload as { hit?: number; miss?: number } | undefined;
                    if (!p) return null;
                    if (dimSeriesVisible.miss && (p.miss ?? 0) > 0) return null;
                    return <HitMissBarEndLabels {...props} />;
                  }}
                />
              </Bar>
            )}
            {dimSeriesVisible.miss && (
              <Bar
                dataKey="miss"
                stackId="dim"
                fill={ANALYTICS_MISS_FILL}
                name="Miss"
                radius={
                  dimSeriesVisible.hit
                    ? [0, 6, 6, 0]
                    : [6, 6, 6, 6]
                }
                maxBarSize={28}
              >
                <LabelList
                  dataKey="miss"
                  position="right"
                  content={(props: Record<string, unknown>) => {
                    const p = props.payload as { hit?: number; miss?: number } | undefined;
                    if (!p || !dimSeriesVisible.miss) return null;
                    if ((p.miss ?? 0) <= 0) return null;
                    return <HitMissBarEndLabels {...props} />;
                  }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Miss Rate by dimension table */}
      <div className="analytics-glass-card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Miss Rate by {analyticsDimConfig.label} (Top {tableTopNNum}
              {tableFilterActive ? ", filtered" : ""})
            </h3>
          </div>
        </div>

        <div
          className={cn(
            "mb-4 inline-flex w-full max-w-md items-center rounded-full border border-border/70 bg-background/90 p-1 shadow-sm transition-[border-color,box-shadow] duration-200 sm:w-auto",
            missRateTableOrderFilter === "miss" && "border-destructive/35 shadow-[0_6px_20px_-8px_hsl(var(--destructive)/0.25)]",
            missRateTableOrderFilter === "hit" && "border-primary/35 shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.18)]",
          )}
          role="group"
          aria-label="Filter table by order outcome"
        >
          {(["all", "hit", "miss"] as const).map((mode) => {
            const label = mode === "all" ? "All" : mode === "hit" ? "Hit" : "Miss";
            const active = missRateTableOrderFilter === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setMissRateTableOrderFilter(mode)}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-4 py-1.5 text-center text-xs font-semibold transition-[color,background-color,box-shadow] duration-200 sm:flex-initial",
                  active && mode === "all" && "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/15",
                  active && mode === "hit" && "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20",
                  active && mode === "miss" && "bg-destructive/15 text-destructive shadow-sm ring-1 ring-destructive/25",
                  !active && "text-muted-foreground hover:bg-muted/45 hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            "mb-4 flex flex-wrap items-center gap-2 rounded-xl p-2 glass-surface glass-surface-ring shadow-sm",
            tableFilterActive && "border-primary/25",
          )}
        >
          <div className="flex items-center gap-1.5 pl-1">
            <label htmlFor="miss-table-rows" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
              Rows
            </label>
            <Input
              id="miss-table-rows"
              type="number"
              min={1}
              max={MISS_TABLE_ROWS_MAX}
              value={tableRowsInput}
              onChange={(e) => setTableRowsInput(e.target.value)}
              className="h-8 w-[4.25rem] text-xs tabular-nums"
              aria-describedby="miss-table-rows-hint"
            />
            <span id="miss-table-rows-hint" className="sr-only">
              Number of rows to show, 1 to {MISS_TABLE_ROWS_MAX}. Default {MISS_TABLE_ROWS_DEFAULT}.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="miss-table-min-total">
              Minimum orders
            </label>
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">Min orders</span>
            <Input
              id="miss-table-min-total"
              type="number"
              min={0}
              placeholder="0"
              value={tableMinTotal}
              onChange={(e) => setTableMinTotal(e.target.value)}
              className="h-8 w-[4.5rem] text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="miss-table-min-rate">
              Minimum miss rate
            </label>
            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">Min miss %</span>
            <Input
              id="miss-table-min-rate"
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="0"
              value={tableMinMissRate}
              onChange={(e) => setTableMinMissRate(e.target.value)}
              className="h-8 w-[4.5rem] text-xs"
            />
          </div>
          {dimensionIncludeOptions.length > 0 && (
            <ColumnFilterCheckbox
              label={analyticsDimConfig.label}
              options={dimensionIncludeOptions}
              selected={tableIncludeKeys}
              onChange={setIncludeFilter}
              showLabel
              triggerClassName={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                tableIncludeKeys.size > 0
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            />
          )}
          {tableFilterActive && (
            <button
              type="button"
              onClick={clearTableFilters}
              className="ml-auto text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              Reset table filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{analyticsDimConfig.label}</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Hit</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Miss</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Miss Rate</th>
                <th className="py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground pl-4">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {dimensionTableRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
              {dimensionTableRows.map((row) => (
                <tr key={row.fullName} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 text-foreground font-medium" title={row.fullName}>{row.name}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{row.total.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-success">{row.hit.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-destructive">{row.miss.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-medium">{row.missRate}%</td>
                  <td className="py-2.5 pl-4">
                    <div className="flex items-center gap-1 h-4">
                      <div
                        className="h-full rounded-l"
                        style={{
                          width: `${row.total > 0 ? (row.hit / row.total) * 120 : 0}px`,
                          backgroundColor: ANALYTICS_HIT_FILL,
                        }}
                      />
                      <div
                        className="h-full rounded-r"
                        style={{
                          width: `${row.total > 0 ? (row.miss / row.total) * 120 : 0}px`,
                          backgroundColor: ANALYTICS_MISS_FILL,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const OTIFAnalyticsPanel = memo(OTIFAnalyticsPanelInner);

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Package;
  accent?: string;
}) {
  return (
    <div className="analytics-glass-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
