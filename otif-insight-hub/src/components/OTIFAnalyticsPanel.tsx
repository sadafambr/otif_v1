import { useMemo, useState } from "react";
import {
  Package, TrendingUp, TrendingDown, BarChart3,
  PieChart as PieChartIcon, Activity, Building2,
  Factory, Boxes,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import type { OTIFRecord } from "@/types/otif";

interface DimensionDef {
  id: string;
  label: string;
  icon: typeof Package;
  accessor: (o: OTIFRecord) => string;
}

const MISS_DIMENSIONS: DimensionDef[] = [
  { id: "businessUnit", label: "Business Unit", icon: Building2, accessor: (o) => (o.rawData?.["division of business name"] ?? "").trim() || "(blank)" },
  { id: "plant", label: "Plant", icon: Factory, accessor: (o) => o.plant || "(blank)" },
  { id: "material", label: "Material", icon: Boxes, accessor: (o) => o.material || "(blank)" },
  { id: "customer", label: "Customer", icon: Package, accessor: (o) => o.customer || "(blank)" },
];

const CUSTOMER_DIMENSION = MISS_DIMENSIONS.find((d) => d.id === "customer")!;

/** Miss overview row: Customer last for emphasis. */
const TOP_MISS_OVERVIEW_DIMENSIONS: DimensionDef[] = [
  ...MISS_DIMENSIONS.filter((d) => d.id !== "customer"),
  CUSTOMER_DIMENSION,
];

function buildMissRanking(orders: OTIFRecord[], accessor: (o: OTIFRecord) => string, topN = 3) {
  const countMap = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "Miss") continue;
    const val = accessor(o);
    countMap.set(val, (countMap.get(val) || 0) + 1);
  }
  return Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));
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

function buildDistribution(orders: OTIFRecord[], accessor: (o: OTIFRecord) => string, topN = 10) {
  const countMap = new Map<string, { total: number; miss: number; hit: number }>();
  for (const o of orders) {
    const val = accessor(o).trim() || "(blank)";
    const entry = countMap.get(val) || { total: 0, miss: 0, hit: 0 };
    entry.total++;
    if (o.status === "Miss") entry.miss++;
    else entry.hit++;
    countMap.set(val, entry);
  }
  return Array.from(countMap.entries())
    .map(([name, stats]) => ({
      name: name.length > 25 ? name.slice(0, 22) + "..." : name,
      fullName: name,
      ...stats,
      missRate: stats.total > 0 ? Math.round((stats.miss / stats.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
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

interface OTIFAnalyticsPanelProps {
  orders: OTIFRecord[];
}

export function OTIFAnalyticsPanel({ orders }: OTIFAnalyticsPanelProps) {
  const [selectedDimension, setSelectedDimension] = useState("customer");

  const overallStats = useMemo(() => {
    const total = orders.length;
    const miss = orders.filter((r) => r.status === "Miss").length;
    const hit = total - miss;
    const avgLeadTime =
      orders.reduce((s, r) => s + (parseInt(r.leadTime, 10) || 0), 0) / (total || 1);
    return {
      total, miss, hit,
      missRate: total > 0 ? Math.round((miss / total) * 1000) / 10 : 0,
      hitRate: total > 0 ? Math.round((hit / total) * 1000) / 10 : 0,
      avgLeadTime: Math.round(avgLeadTime * 10) / 10,
    };
  }, [orders]);

  const hitMissPie = useMemo(
    () => [
      { name: "Hit", value: overallStats.hit, color: "hsl(160, 84%, 39%)" },
      { name: "Miss", value: overallStats.miss, color: "hsl(0, 72%, 51%)" },
    ],
    [overallStats]
  );

  const topMissRankings = useMemo(() => {
    const result: Record<string, { name: string; count: number }[]> = {};
    for (const dim of MISS_DIMENSIONS) {
      result[dim.id] = buildMissRanking(orders, dim.accessor);
    }
    return result;
  }, [orders]);

  const detailedBreakdown = useMemo(
    () => buildDimensionStats(orders, CUSTOMER_DIMENSION.accessor).sort((a, b) => b.miss - a.miss),
    [orders]
  );

  const analyticsDimConfig = MISS_DIMENSIONS.find((d) => d.id === selectedDimension)!;
  const dimensionData = useMemo(() => {
    const data = buildDistribution(orders, analyticsDimConfig.accessor);
    if (selectedDimension === "customer") {
      return [...data].sort((a, b) => b.miss - a.miss);
    }
    return data;
  }, [orders, analyticsDimConfig, selectedDimension]);

  const leadTimeBuckets = useMemo(() => buildLeadTimeBuckets(orders), [orders]);

  return (
    <div className="space-y-6">
      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Orders" value={overallStats.total.toLocaleString()} icon={Package} />
        <StatCard label="Hit Rate" value={`${overallStats.hitRate}%`} icon={TrendingUp} accent="text-success" />
        <StatCard label="Miss Rate" value={`${overallStats.missRate}%`} icon={TrendingDown} accent="text-destructive" />
        <StatCard label="Avg Lead Time" value={`${overallStats.avgLeadTime} days`} icon={Activity} />
        <StatCard label="Total Miss" value={overallStats.miss.toLocaleString()} icon={TrendingDown} accent="text-destructive" />
      </div>

      {/* OTIF Miss Overview */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">OTIF Miss Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOP_MISS_OVERVIEW_DIMENSIONS.map((dim) => {
            const Icon = dim.icon;
            const ranking = topMissRankings[dim.id] || [];
            return (
              <div key={dim.id} className="analytics-glass-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-foreground">Top Miss by {dim.label}</h4>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-3">
                  {ranking.length === 0 && (
                    <p className="text-xs text-muted-foreground">No miss data</p>
                  )}
                  {ranking.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <span className="text-sm text-foreground">
                        <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                        <span className={i === 0 ? "font-semibold" : ""}>{item.name.length > 22 ? item.name.slice(0, 19) + "..." : item.name}</span>
                      </span>
                      <span className="text-sm font-semibold text-destructive">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Breakdown by Customer */}
      <div className="analytics-glass-card p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Miss rate by customer</h3>
          <p className="text-xs text-muted-foreground">Sorted by total predicted misses (highest first)</p>
        </div>
        <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted">
              <tr className="border-b">
                <th className="py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{CUSTOMER_DIMENSION.label}</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Miss</th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Miss Rate</th>
              </tr>
            </thead>
            <tbody>
              {detailedBreakdown.map((row) => (
                <tr key={row.fullName} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 text-foreground font-medium" title={row.fullName}>{row.name}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{row.total.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-destructive font-semibold">{row.miss.toLocaleString()}</td>
                  <td className={`py-2.5 text-right font-semibold ${
                    row.missRate >= 50 ? "text-destructive" : row.missRate >= 30 ? "text-amber-600" : "text-success"
                  }`}>
                    {row.missRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hit/Miss Pie + Lead Time Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="analytics-glass-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Hit vs Miss Distribution</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={hitMissPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                labelLine
              >
                {hitMissPie.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-glass-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Lead Time Distribution</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={leadTimeBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} label={{ value: "Days", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="hit" stackId="a" fill="hsl(160, 84%, 39%)" name="Hit" radius={[0, 0, 0, 0]} />
              <Bar dataKey="miss" stackId="a" fill="hsl(0, 72%, 51%)" name="Miss" radius={[4, 4, 0, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hit/Miss by Dimension */}
      <div className="analytics-glass-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Hit/Miss by {analyticsDimConfig.label}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {MISS_DIMENSIONS.map((dim) => (
              <button
                key={dim.id}
                onClick={() => setSelectedDimension(dim.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedDimension === dim.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {dim.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dimensionData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(220, 13%, 91%)" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="hit" stackId="a" fill="hsl(160, 84%, 39%)" name="Hit" />
            <Bar dataKey="miss" stackId="a" fill="hsl(0, 72%, 51%)" name="Miss" radius={[0, 4, 4, 0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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
