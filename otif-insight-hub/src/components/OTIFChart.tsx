import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown } from "lucide-react";
import type { DashboardSummary } from "@/types/otif";

interface OTIFChartProps {
  summary: DashboardSummary;
}

/** Compact Hit vs Miss bar chart — use inside hover panels or expanded sections. */
export function OTIFDistributionChartInline({
  summary,
  height = 140,
}: {
  summary: DashboardSummary;
  height?: number;
}) {
  const data = useMemo(
    () => [
      { name: "OTIF Miss", value: summary.otifMiss, color: "hsl(0, 72%, 51%)" },
      { name: "OTIF Hit", value: summary.otifHit, color: "hsl(160, 84%, 39%)" },
    ],
    [summary]
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" barSize={28} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis type="category" dataKey="name" width={76} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
            formatter={(v: number) => v.toLocaleString()}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Collapsible chart block (e.g. Admin model dashboard). */
export function OTIFChart({ summary }: OTIFChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border bg-card shadow-sm animate-fade-in overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">OTIF Distribution Chart</h3>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <OTIFDistributionChartInline summary={summary} height={140} />
        </div>
      )}
    </div>
  );
}
