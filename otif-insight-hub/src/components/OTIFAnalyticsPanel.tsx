import { useMemo, useState } from "react";
import {
  Package, TrendingUp, TrendingDown, BarChart3,
  PieChart as PieChartIcon, Activity, Globe, Building2,
  Factory, Boxes, AlertTriangle, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import type { OTIFRecord } from "@/types/otif";

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
  { id: "region", label: "Customer", icon: Globe, accessor: (o) => (o.rawData?.["state - province"] ?? o.rawData?.["country"] ?? "").trim() || "(blank)" },
  { id: "customer", label: "Customer", icon: Package, accessor: (o) => o.customer || "(blank)" },
];

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
    .sort((a, b) => b.missRate - a.missRate)
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

interface OTIFAnalyticsPanelProps {
  orders: OTIFRecord[];
}

export function OTIFAnalyticsPanel({ orders }: OTIFAnalyticsPanelProps) {
  const [selectedDimension, setSelectedDimension] = useState("plant");

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
      { name: "Hit", value: overallStats.hit, color: "hsl(160, 84%, 39%)" },
      { name: "Miss", value: overallStats.miss, color: "hsl(0, 72%, 51%)" },
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
      
      result[dim.id] = buildMissRanking(orders, dim.accessor, displayNameAccessor);
    }
    return result;
  }, [orders]);

  const highRiskMissOrders = useMemo(
    () => orders.filter((r) => r.status === "Miss" && r.riskScore >= HIGH_RISK_THRESHOLD),
    [orders]
  );

  const analyticsDimConfig = MISS_DIMENSIONS.find((d) => d.id === selectedDimension)!;
  const dimensionData = useMemo(
    () => buildDistribution(orders, analyticsDimConfig.accessor),
    [orders, analyticsDimConfig]
  );

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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Orders" value={overallStats.total.toLocaleString()} icon={Package} />
        <StatCard label="Hit Rate" value={`${overallStats.hitRate}%`} icon={TrendingUp} accent="text-success" />
        <StatCard label="Miss Rate" value={`${overallStats.missRate}%`} icon={TrendingDown} accent="text-destructive" />
        <StatCard label="Avg Lead Time" value={`${overallStats.avgLeadTime} days`} icon={Activity} />
        <StatCard label="Avg Risk Score" value={`${overallStats.avgRiskScore}%`} icon={BarChart3} />
        <StatCard label="Total Miss" value={overallStats.miss.toLocaleString()} icon={TrendingDown} accent="text-destructive" />
      </div>

      {/* OTIF Miss Overview */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">OTIF Miss Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MISS_DIMENSIONS.slice(0, 4).map((dim) => {
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
                        <span className={i === 0 ? "font-semibold" : ""}>{item.displayName.length > 22 ? item.displayName.slice(0, 19) + "..." : item.displayName}</span>
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
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

      {/* Miss Rate by dimension table */}
      <div className="analytics-glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Miss Rate by {analyticsDimConfig.label} (Top 10)
          </h3>
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
              {dimensionData.map((row) => (
                <tr key={row.name} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 text-foreground font-medium" title={row.fullName}>{row.name}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{row.total.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-success">{row.hit.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-destructive">{row.miss.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-medium">{row.missRate}%</td>
                  <td className="py-2.5 pl-4">
                    <div className="flex items-center gap-1 h-4">
                      <div
                        className="h-full rounded-l bg-[hsl(160,84%,39%)]"
                        style={{ width: `${row.total > 0 ? (row.hit / row.total) * 120 : 0}px` }}
                      />
                      <div
                        className="h-full rounded-r bg-[hsl(0,72%,51%)]"
                        style={{ width: `${row.total > 0 ? (row.miss / row.total) * 120 : 0}px` }}
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
