import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

interface DataStatus {
  hasMaster: boolean;
  minDate: string | null;
  maxDate: string | null;
  totalRows: number;
}

async function fetchDataStatus(token: string | null): Promise<DataStatus> {
  const res = await fetch(`${API_BASE}/admin/data/status`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error("Failed to load data status");
  }
  return res.json();
}

export default function AdminDataManagement() {
  const { user, token } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-data-status"],
    queryFn: () => fetchDataStatus(token),
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center px-8">
          <p className="text-sm text-muted-foreground">Admin access is required to manage data.</p>
        </div>
      </AppLayout>
    );
  }

  const runAction = async (path: string, method: "POST") => {
    setActionError(null);
    setLoadingAction(true);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || "Action failed");
      }
      await refetch();
    } catch (err: any) {
      setActionError(err.message ?? "Action failed");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-2xl font-bold text-foreground">Data Management</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Inspect and control the local OTIF master repository used for model training and evaluation.
        </p>

        {error && (
          <p className="mb-4 text-sm text-destructive">
            {(error as Error).message}
          </p>
        )}

        {isLoading && !data && <p className="text-sm text-muted-foreground">Loading data status…</p>}

        {data && (
          <div className="mb-6 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <p>
              Repository status:{" "}
              <span className="font-semibold text-foreground">
                {data.hasMaster ? "Ready" : "Empty"}
              </span>
            </p>
            {data.hasMaster && (
              <>
                <p>
                  Date range:{" "}
                  <span className="font-semibold text-foreground">
                    {data.minDate?.slice(0, 10)} – {data.maxDate?.slice(0, 10)}
                  </span>
                </p>
                <p>
                  Total rows: <span className="font-semibold text-foreground">{data.totalRows.toLocaleString()}</span>
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Run rolling backtest</p>
              <p className="text-xs text-muted-foreground">
                Re-train and evaluate the model over the configured date window.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingAction}
              onClick={() => runAction("/admin/data/backtest", "POST")}
            >
              Start backtest
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Clear local repository</p>
              <p className="text-xs text-muted-foreground">
                Remove the local master parquet file. Use with caution.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={loadingAction}
              onClick={() => runAction("/admin/data/clear", "POST")}
            >
              Clear repository
            </Button>
          </div>
        </div>

        {actionError && (
          <p className="mt-4 text-sm text-destructive">
            {actionError}
          </p>
        )}
      </div>
    </AppLayout>
  );
}

