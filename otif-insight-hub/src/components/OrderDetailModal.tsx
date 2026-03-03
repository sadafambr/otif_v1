import { TriangleAlert, Sparkles, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrderDetail } from "@/types/otif";

interface OrderDetailModalProps {
  detail: OrderDetail | null;
  loading?: boolean;
  onClose: () => void;
}

export function OrderDetailModal({ detail, loading, onClose }: OrderDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-card shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {detail && (
          <div className="border-b px-6 py-4">
            <p className="text-sm text-muted-foreground">
              {detail.customer} • {detail.material} • Plant {detail.plant}
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && !detail && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating AI explanation…</p>
          </div>
        )}

        {detail && (
          <>
            {/* Metrics row */}
            <div className="grid grid-cols-4 gap-4 border-b px-6 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prob. Hit</p>
                <p className="text-xl font-bold text-success">{detail.probHit.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prob. Miss</p>
                <p className="text-xl font-bold text-destructive">{detail.probMiss.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prediction</p>
                <div className="mt-1 flex items-center gap-1">
                  {detail.prediction === "Miss" && <TriangleAlert className="h-4 w-4 text-destructive" />}
                  <span className={detail.prediction === "Miss" ? "text-xl font-bold text-destructive" : "text-xl font-bold text-success"}>
                    {detail.prediction}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Delivery Info</p>
                <p className="text-sm text-foreground">Req: {detail.reqDelivery}</p>
                <p className="text-sm text-foreground">Lead: {detail.leadTime}</p>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-auto px-6 py-4 space-y-5">

              {/* GenAI Explanation */}
              {loading && !detail.genaiSummary && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-primary">Generating AI explanation…</span>
                </div>
              )}

              {detail.genaiSummary && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">AI Explanation</h4>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                    {detail.genaiSummary}
                  </p>
                </div>
              )}

              {/* SHAP One-liner */}
              {detail.shapOneLiner && (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3">
                  <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">SHAP Insight: </span>
                    {detail.shapOneLiner}
                  </p>
                </div>
              )}

              {/* Risk Drivers */}
              {detail.riskDrivers && detail.riskDrivers.length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk Drivers</h4>
                  <div className="space-y-2">
                    {detail.riskDrivers.map((driver) => (
                      <div
                        key={driver.rank}
                        className={`rounded-lg border p-3 ${driver.flag ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {driver.flag && <TriangleAlert className="h-3.5 w-3.5 text-destructive" />}
                            <span className="text-sm font-medium text-foreground">{driver.name}</span>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{driver.value}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{driver.explanation}</p>
                        {/* SHAP bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted">
                            <div
                              className="h-1.5 rounded-full bg-primary transition-all"
                              style={{ width: `${Math.min(100, (driver.shapValue / driver.maxShap) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{driver.shapValue.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback explanation (when no GenAI) */}
              {!detail.genaiSummary && !loading && (
                <p className="text-sm text-muted-foreground">{detail.explanation}</p>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
