import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown } from "lucide-react";
import type { DashboardSummary } from "@/types/otif";

interface OTIFChartProps {
  summary: DashboardSummary;
}

export function OTIFChart({ summary }: OTIFChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const data = useMemo(
    () => [
      { name: "OTIF Miss", value: summary.otifMiss, color: "hsl(0, 72%, 51%)" },
      { name: "OTIF Hit", value: summary.otifHit, color: "hsl(160, 84%, 39%)" },
    ],
    [summary]
  );

  return (
    <div className="rounded-xl border bg-card shadow-sm animate-fade-in overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">OTIF Distribution</h3>
          <p className="text-sm text-muted-foreground">Order volume by OTIF prediction</p>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground rotate-180 transition-transform" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-6">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data} layout="vertical" barSize={32}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(220, 13%, 91%)" />
              <XAxis type="number" tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 13, fill: "hsl(220, 20%, 14%)" }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  style={{ fontSize: 13, fontWeight: 600, fill: "hsl(220, 20%, 14%)" }}
                  formatter={(v: number) => v.toLocaleString()}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}