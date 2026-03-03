import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

interface CustomPredictionSummary {
  totalOrders: number;
  missCount: number;
  hitCount: number;
  missRate: number;
}

export default function AdminCustomPrediction() {
  const { user, token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CustomPredictionSummary | null>(null);

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center px-8">
          <p className="text-sm text-muted-foreground">
            Admin access is required to use custom prediction.
          </p>
        </div>
      </AppLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setLoading(true);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/admin/custom-predict`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Prediction failed");
      }

      const data = await res.json();
      setSummary({
        totalOrders: data.totalOrders,
        missCount: data.missCount,
        hitCount: data.hitCount,
        missRate: data.missRate,
      });
    } catch (err: any) {
      setError(err.message ?? "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-2xl font-bold text-foreground">Custom Prediction</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Upload a CSV or Excel file to score orders with the latest OTIF model and view batch-level statistics.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Upload file</label>
            <Input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Use the same OTIF prediction export format you use in the current Streamlit UI.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!file || loading}>
            {loading ? "Running prediction..." : "Run prediction"}
          </Button>
        </form>

        {summary && (
          <div className="mt-6 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <p>
              Total orders: <span className="font-semibold text-foreground">{summary.totalOrders}</span>
            </p>
            <p>
              OTIF Miss: <span className="font-semibold text-foreground">{summary.missCount}</span>
            </p>
            <p>
              OTIF Hit: <span className="font-semibold text-foreground">{summary.hitCount}</span>
            </p>
            <p>
              Miss rate:{" "}
              <span className="font-semibold text-foreground">
                {summary.missRate != null && !Number.isNaN(Number(summary.missRate))
                  ? `${Number(summary.missRate).toFixed(1)}%`
                  : "N/A"}
              </span>
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

