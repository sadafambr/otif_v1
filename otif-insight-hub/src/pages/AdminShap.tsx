import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";

interface ShapFeature {
  feature: string;
  mean_abs_shap: number;
}

interface AdminShapResponse {
  availableMonths: string[];
  shapSummary: ShapFeature[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function fetchAdminShap(month: string | undefined, token: string | null): Promise<AdminShapResponse> {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetch(`${API_BASE}/admin/shap-summary${params}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error("Failed to load SHAP summary");
  }
  return res.json();
}

export default function AdminShap() {
  const { user, token } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-shap", selectedMonth],
    queryFn: () => fetchAdminShap(selectedMonth, token),
  });

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center px-8">
          <p className="text-sm text-muted-foreground">Admin access is required to view SHAP explainability.</p>
        </div>
      </AppLayout>
    );
  }

  const shapSummary = data?.shapSummary ?? [];

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">SHAP Explainability</h1>
            <p className="text-sm text-muted-foreground">
              Global feature importance for the OTIF model, by test month.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="mr-2">Test month:</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={selectedMonth ?? ""}
              onChange={(e) => setSelectedMonth(e.target.value || undefined)}
            >
              <option value="">Latest</option>
              {data?.availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm text-destructive">
            {(error as Error).message}
          </p>
        )}

        {isLoading && !data && <p className="text-sm text-muted-foreground">Loading SHAP summary…</p>}

        {!isLoading && shapSummary.length === 0 && (
          <p className="text-sm text-muted-foreground">No SHAP data available for the selected month.</p>
        )}

        {shapSummary.length > 0 && (
          <Card className="p-4">
            <div className="mb-3 text-sm font-medium text-muted-foreground">
              Top global risk drivers (mean |SHAP|).
            </div>
            <div className="space-y-2">
              {shapSummary.slice(0, 20).map((row) => (
                <div key={row.feature} className="flex items-center gap-3 text-sm">
                  <div className="w-52 truncate font-mono text-xs text-muted-foreground">{row.feature}</div>
                  <div className="flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-destructive"
                      style={{ width: `${Math.min(100, row.mean_abs_shap * 200)}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-muted-foreground">
                    {row.mean_abs_shap.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

