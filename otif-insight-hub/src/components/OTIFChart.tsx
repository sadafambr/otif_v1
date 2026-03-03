import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { DashboardSummary } from "@/types/otif";

interface OTIFChartProps {
  summary: DashboardSummary;
}

export function OTIFChart({ summary }: OTIFChartProps) {
  const data = useMemo(
    () => [
      { name: "OTIF Miss", value: summary.otifMiss, color: "hsl(0, 72%, 51%)" },
      { name: "OTIF Hit", value: summary.otifHit, color: "hsl(160, 84%, 39%)" },
    ],
    [summary]
  );

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground">OTIF Distribution</h3>
      <p className="mb-6 text-sm text-muted-foreground">Order volume by OTIF prediction</p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} layout="vertical" barSize={32}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(220, 13%, 91%)" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
          <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 13, fill: "hsl(220, 20%, 14%)" }} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(220, 13%, 91%)",
              fontSize: 13,
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
