import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/KPICard";
import { OTIFChart } from "@/components/OTIFChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  TrendingDown,
  CheckCircle,
  XCircle,
  BarChart3,
  Upload,
  Database,
  Loader2,
  Trash2,
  Play,
  Activity,
  RefreshCw,
  Wrench,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// ---------- shared types ----------

interface ConfusionMatrix {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
}

interface AdminModelMetrics {
  month: string;
  miss_precision: number;
  miss_recall: number;
  accuracy: number;
  auc: number;
  threshold: number;
  thr_reason: string;
  total_predictions: number;
  miss_count: number;
  hit_count: number;
  confusion: ConfusionMatrix;
  has_reports: boolean;
}

interface AdminModelSummaryResponse {
  availableMonths: string[];
  metrics: AdminModelMetrics | null;
}

interface ShapFeature {
  feature: string;
  mean_abs_shap: number;
}

interface AdminShapResponse {
  availableMonths: string[];
  shapSummary: ShapFeature[];
}

interface CustomPredictionSummary {
  totalOrders: number;
  missCount: number;
  hitCount: number;
  missRate: number;
}

interface DataStatus {
  hasMaster: boolean;
  minDate: string | null;
  maxDate: string | null;
  totalRows: number;
}

interface PerformanceCurvesData {
  month: string;
  roc: { fpr: number[]; tpr: number[]; auc: number };
  pr: { precision: number[]; recall: number[] };
}

// ---------- fetch helpers ----------

async function fetchModelSummary(month: string | undefined, token: string | null): Promise<AdminModelSummaryResponse> {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetch(`${API_BASE}/admin/model-dashboard${params}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to load model dashboard");
  return res.json();
}

async function fetchShap(month: string | undefined, token: string | null): Promise<AdminShapResponse> {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetch(`${API_BASE}/admin/shap-summary${params}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to load SHAP summary");
  return res.json();
}

async function fetchDataStatus(token: string | null): Promise<DataStatus> {
  const res = await fetch(`${API_BASE}/admin/data/status`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to load data status");
  return res.json();
}

async function fetchPerformanceCurves(month: string | undefined, token: string | null): Promise<PerformanceCurvesData> {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetch(`${API_BASE}/admin/performance-curves${params}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error("Failed to load performance curves");
  return res.json();
}

// ---------- SVG Line Chart ----------

function SVGLineChart({
  xData,
  yData,
  xLabel,
  yLabel,
  title,
  color,
  legendLabel,
  diagonalGuide,
}: {
  xData: number[];
  yData: number[];
  xLabel: string;
  yLabel: string;
  title: string;
  color: string;
  legendLabel?: string;
  diagonalGuide?: boolean;
}) {
  const W = 280;
  const H = 220;
  const pad = { top: 30, right: 16, bottom: 38, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const toX = (v: number) => pad.left + v * plotW;
  const toY = (v: number) => pad.top + (1 - v) * plotH;

  const pathD = xData
    .map((x, i) => `${i === 0 ? "M" : "L"}${toX(x).toFixed(1)},${toY(yData[i]).toFixed(1)}`)
    .join(" ");

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 260 }}>
      {/* Background */}
      <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="hsl(var(--muted))" rx="2" />

      {/* Grid lines */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={toX(t)} y1={pad.top} x2={toX(t)} y2={pad.top + plotH} stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={pad.left} y1={toY(t)} x2={pad.left + plotW} y2={toY(t)} stroke="hsl(var(--border))" strokeWidth="0.5" />
          <text x={toX(t)} y={pad.top + plotH + 12} textAnchor="middle" className="fill-muted-foreground" fontSize="8">
            {t.toFixed(1)}
          </text>
          <text x={pad.left - 4} y={toY(t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="8">
            {t.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Diagonal guide (for ROC) */}
      {diagonalGuide && (
        <line
          x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)}
          stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
        />
      )}

      {/* Data line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

      {/* Title */}
      <text x={W / 2} y={16} textAnchor="middle" className="fill-foreground" fontSize="11" fontWeight="600">
        {title}
      </text>

      {/* Axis labels */}
      <text x={pad.left + plotW / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground" fontSize="9">
        {xLabel}
      </text>
      <text
        x={10} y={pad.top + plotH / 2}
        textAnchor="middle" className="fill-muted-foreground" fontSize="9"
        transform={`rotate(-90, 10, ${pad.top + plotH / 2})`}
      >
        {yLabel}
      </text>

      {/* Legend */}
      {legendLabel && (
        <g>
          <line x1={toX(0.55)} y1={toY(0.1)} x2={toX(0.65)} y2={toY(0.1)} stroke={color} strokeWidth="2" />
          <text x={toX(0.67)} y={toY(0.1) + 3} className="fill-foreground" fontSize="8">
            {legendLabel}
          </text>
        </g>
      )}
    </svg>
  );
}

// ---------- tab definitions ----------

type TabId = "dashboard" | "shap" | "prediction" | "data";

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Model Dashboard", icon: Activity },
  { id: "shap", label: "XAI SHAP", icon: BarChart3 },
  { id: "prediction", label: "Custom Prediction", icon: Upload },
  { id: "data", label: "Data Management", icon: Database },
];

// ========== MAIN COMPONENT ==========

export default function AdminModelDashboard() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center px-8">
          <p className="text-sm text-muted-foreground">Admin access is required to view the model dashboard.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">OTIF Model Command Centre</h1>
            <p className="text-sm text-muted-foreground">
              Technical health, explainability, prediction &amp; data management.
            </p>
          </div>
          <MonthSelector
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border bg-muted/40 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {activeTab === "dashboard" && <TabDashboard month={selectedMonth} token={token} />}
        {activeTab === "shap" && <TabShap month={selectedMonth} token={token} />}
        {activeTab === "prediction" && <TabPrediction token={token} />}
        {activeTab === "data" && <TabDataManagement token={token} />}
      </div>
    </AppLayout>
  );
}

// ---------- Month Selector ----------

function MonthSelector({
  selectedMonth,
  onMonthChange,
}: {
  selectedMonth: string | undefined;
  onMonthChange: (m: string | undefined) => void;
}) {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin-model-dashboard", undefined],
    queryFn: () => fetchModelSummary(undefined, token),
  });

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>Test month:</span>
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        value={selectedMonth ?? ""}
        onChange={(e) => onMonthChange(e.target.value || undefined)}
      >
        <option value="">Latest</option>
        {data?.availableMonths.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

// ================================================================
// TAB 1 — Model Dashboard (Performance Overview)
// ================================================================

function TabDashboard({ month, token }: { month: string | undefined; token: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-model-dashboard", month],
    queryFn: () => fetchModelSummary(month, token),
  });

  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);

  const metrics = data?.metrics ?? null;

  const handleTrain = async () => {
    setTraining(true);
    setTrainMsg(null);
    try {
      const params = month ? `?month=${encodeURIComponent(month)}` : "";
      const res = await fetch(`${API_BASE}/admin/train${params}`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Training failed");
      }
      const d = await res.json();
      setTrainMsg(`Training complete for ${d.month}`);
    } catch (err: any) {
      setTrainMsg(`Error: ${err.message}`);
    } finally {
      setTraining(false);
    }
  };

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading) return <LoadingBlock label="Loading model metrics\u2026" />;
  if (!metrics) return <p className="text-sm text-muted-foreground">No model data available for this month.</p>;

  const cm = metrics.confusion;
  const hasCM = cm && (cm.tp + cm.tn + cm.fp + cm.fn) > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero KPIs */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Performance Overview — {metrics.month}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Miss Precision"
            value={`${(metrics.miss_precision * 100).toFixed(1)}%`}
            description="Accuracy on late orders"
            icon={XCircle}
            variant="risk"
          />
          <KPICard
            label="Miss Recall"
            value={`${(metrics.miss_recall * 100).toFixed(1)}%`}
            description="Coverage of late orders"
            icon={XCircle}
            variant="risk"
          />
          <KPICard
            label="Accuracy"
            value={`${(metrics.accuracy * 100).toFixed(1)}%`}
            description="Overall model accuracy"
            icon={CheckCircle}
            variant="default"
          />
          <KPICard
            label="AUC-ROC"
            value={metrics.auc.toFixed(3)}
            description="Discrimination power"
            icon={TrendingDown}
            variant="info"
          />
        </div>
      </div>

      {/* Model Evaluation — Confusion Matrix */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Model Evaluation</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {hasCM ? (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Confusion Matrix</h3>
              <div className="grid grid-cols-3 gap-1 text-center text-sm">
                <div />
                <div className="font-semibold text-muted-foreground text-xs uppercase">Pred MISS</div>
                <div className="font-semibold text-muted-foreground text-xs uppercase">Pred HIT</div>
                <div className="font-semibold text-muted-foreground text-xs uppercase text-right pr-2">Actual MISS</div>
                <div className="rounded-md bg-green-100 dark:bg-green-900/30 p-3">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{cm.tn}</p>
                  <p className="text-xs text-muted-foreground">TN</p>
                </div>
                <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-3">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{cm.fp}</p>
                  <p className="text-xs text-muted-foreground">FP</p>
                </div>
                <div className="font-semibold text-muted-foreground text-xs uppercase text-right pr-2">Actual HIT</div>
                <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-3">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{cm.fn}</p>
                  <p className="text-xs text-muted-foreground">FN</p>
                </div>
                <div className="rounded-md bg-green-100 dark:bg-green-900/30 p-3">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{cm.tp}</p>
                  <p className="text-xs text-muted-foreground">TP</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              No confusion matrix data available (requires y_true column in predictions).
            </Card>
          )}

          {/* Prediction Distribution */}
          <OTIFChart
            summary={{
              totalOrders: metrics.total_predictions,
              otifMiss: metrics.miss_count,
              otifHit: metrics.hit_count,
              missRate:
                metrics.total_predictions > 0
                  ? Math.round((metrics.miss_count / metrics.total_predictions) * 1000) / 10
                  : 0,
              lastUpdated: new Date().toISOString(),
            }}
          />
        </div>
      </div>

      {/* Performance Curves — ROC & PR */}
      <PerformanceCurves month={month} token={token} />

      {/* Prediction Distribution — Donut Chart */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Prediction Distribution</h2>
        <Card className="p-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 items-center">
            {/* Donut Chart */}
            <div>
              <p className="mb-4 text-sm font-medium text-muted-foreground">Predicted OTIF Distribution</p>
              {(() => {
                const total = metrics.total_predictions || 1;
                const hitPct = (metrics.hit_count / total) * 100;
                const missPct = (metrics.miss_count / total) * 100;
                const R = 80;
                const C = 2 * Math.PI * R; // circumference
                const hitLen = (hitPct / 100) * C;
                const missLen = (missPct / 100) * C;

                return (
                  <div className="flex items-center gap-6">
                    <svg viewBox="0 0 220 220" className="h-52 w-52 shrink-0">
                      {/* HIT arc (green) — starts at top */}
                      <circle
                        cx="110" cy="110" r={R}
                        fill="none"
                        stroke="hsl(160, 84%, 39%)"
                        strokeWidth="32"
                        strokeDasharray={`${hitLen} ${C}`}
                        strokeDashoffset="0"
                        transform="rotate(-90 110 110)"
                        className="transition-all duration-700"
                      />
                      {/* MISS arc (red/coral) */}
                      <circle
                        cx="110" cy="110" r={R}
                        fill="none"
                        stroke="hsl(0, 72%, 51%)"
                        strokeWidth="32"
                        strokeDasharray={`${missLen} ${C}`}
                        strokeDashoffset={`${-hitLen}`}
                        transform="rotate(-90 110 110)"
                        className="transition-all duration-700"
                      />
                      {/* Center label */}
                      <text x="110" y="105" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="700">
                        {total.toLocaleString()}
                      </text>
                      <text x="110" y="125" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
                        Total
                      </text>
                    </svg>

                    {/* Legend */}
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "hsl(160, 84%, 39%)" }} />
                        <span className="text-foreground font-medium">HIT</span>
                        <span className="text-muted-foreground">
                          {metrics.hit_count.toLocaleString()} ({hitPct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "hsl(0, 72%, 51%)" }} />
                        <span className="text-foreground font-medium">MISS</span>
                        <span className="text-muted-foreground">
                          {metrics.miss_count.toLocaleString()} ({missPct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Summary stats */}
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Total Predictions:</strong> {metrics.total_predictions.toLocaleString()}
              </p>
              <p>
                <strong className="text-foreground">MISS Predictions:</strong> {metrics.miss_count.toLocaleString()}{" "}
                ({metrics.total_predictions > 0 ? ((metrics.miss_count / metrics.total_predictions) * 100).toFixed(1) : 0}%)
              </p>
              <p>
                <strong className="text-foreground">HIT Predictions:</strong> {metrics.hit_count.toLocaleString()}{" "}
                ({metrics.total_predictions > 0 ? ((metrics.hit_count / metrics.total_predictions) * 100).toFixed(1) : 0}%)
              </p>
              {metrics.miss_count > metrics.hit_count && (
                <p className="mt-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                  High MISS percentage suggests the model is flagging significant supply chain risks in this period.
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Threshold info + Training */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-4 text-sm text-muted-foreground">
          <h3 className="mb-2 font-semibold text-foreground">Evaluation Snapshot</h3>
          <p>
            Optimal Threshold: <span className="font-mono font-semibold text-foreground">{metrics.threshold.toFixed(3)}</span>
          </p>
          <p className="mt-1">
            Threshold Selection: <span className="font-mono">{metrics.thr_reason}</span>
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Model Training</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Re-train the model for the selected month. This may take several minutes.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={training} onClick={handleTrain}>
              {training ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Training…</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" /> Train / Re-train {metrics.month}</>
              )}
            </Button>
          </div>
          {trainMsg && <p className="mt-2 text-xs">{trainMsg}</p>}
        </Card>
      </div>
    </div>
  );
}

// ================================================================
// Performance Curves (ROC + PR) — separate section in Tab 1
// ================================================================

function PerformanceCurves({ month, token }: { month: string | undefined; token: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-perf-curves", month],
    queryFn: () => fetchPerformanceCurves(month, token),
  });

  if (error) return null; // silently skip if no curves available
  if (isLoading) return <LoadingBlock label="Loading performance curves..." />;
  if (!data) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-foreground">Performance Curves</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <SVGLineChart
            xData={data.roc.fpr}
            yData={data.roc.tpr}
            xLabel="False Positive Rate"
            yLabel="True Positive Rate"
            title="ROC Curve"
            color="hsl(14, 90%, 55%)"
            legendLabel={`ROC (AUC = ${data.roc.auc.toFixed(2)})`}
            diagonalGuide
          />
        </Card>
        <Card className="p-4">
          <SVGLineChart
            xData={data.pr.recall}
            yData={data.pr.precision}
            xLabel="Recall"
            yLabel="Precision"
            title="Precision-Recall Curve"
            color="hsl(220, 70%, 55%)"
          />
        </Card>
      </div>
    </div>
  );
}

// ================================================================
// TAB 2 — XAI SHAP Explainability
// ================================================================

function TabShap({ month, token }: { month: string | undefined; token: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-shap", month],
    queryFn: () => fetchShap(month, token),
  });

  const shapSummary = data?.shapSummary ?? [];
  const maxShap = shapSummary.length > 0 ? shapSummary[0].mean_abs_shap : 1;

  // Risk factor mapping (matches Streamlit)
  const riskMapping: Record<string, string> = {
    f_lead_gap_days: "Lead Time Tightness: Small gap between ready and requested dates increases delay risk.",
    f_congestion: "Node Congestion: High activity at plant/warehouse slow down order processing.",
    f_unit_price: "Value Sensitivity: High-value orders often have complex logistics.",
    f_line_count: "Complexity: Higher item count per order increases picking and packing time.",
    f_miss_rate: "Historical Risk: The specific Plant/Material combination shows a trend of delays.",
    f_tolerance: "Tolerance Strictness: Extreme precision required by customer leaves no buffer.",
  };

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading) return <LoadingBlock label="Loading SHAP summary…" />;
  if (shapSummary.length === 0) return <p className="text-sm text-muted-foreground">No SHAP data available for the selected month.</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground">Global SHAP Risk Drivers</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* SHAP bar chart */}
        <Card className="p-4 lg:col-span-3">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Top 15 Global Features (Mean |SHAP|)</h3>
          <div className="space-y-2">
            {shapSummary.slice(0, 15).map((row) => (
              <div key={row.feature} className="flex items-center gap-3 text-sm">
                <div className="w-44 truncate font-mono text-xs text-muted-foreground" title={row.feature}>
                  {row.feature}
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                    style={{ width: `${Math.min(100, (row.mean_abs_shap / maxShap) * 100)}%` }}
                  />
                </div>
                <div className="w-16 text-right font-mono text-xs text-muted-foreground">
                  {row.mean_abs_shap.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Risk factor interpretation */}
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Risk Factor Interpretation</h3>
          <div className="space-y-3">
            {shapSummary.slice(0, 8).map((row) => {
              let desc = "Variable impact on supply chain stability.";
              for (const [key, val] of Object.entries(riskMapping)) {
                if (row.feature.includes(key)) {
                  desc = val;
                  break;
                }
              }
              return (
                <div key={row.feature} className="rounded-md border px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{row.feature}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Static SHAP Report Images */}
      {month && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Aggregated SHAP Reports</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <img
                src={`${API_BASE}/admin/shap-images/${month}/global_shap_bar_${month}.png`}
                alt="Global SHAP Bar Summary"
                className="w-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <p className="px-4 py-2 text-xs text-muted-foreground">Global SHAP Bar Summary</p>
            </Card>
            <Card className="overflow-hidden">
              <img
                src={`${API_BASE}/admin/shap-images/${month}/global_shap_beeswarm_${month}.png`}
                alt="Global SHAP Beeswarm"
                className="w-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <p className="px-4 py-2 text-xs text-muted-foreground">Global SHAP Beeswarm (Directional Impact)</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// TAB 3 — Custom Prediction
// ================================================================

function TabPrediction({ token }: { token: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CustomPredictionSummary | null>(null);

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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Custom Order Prediction</h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV or Excel file to score orders with the latest OTIF model and view batch-level statistics.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Upload file</label>
          <Input
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Use the same OTIF prediction export format you use in the Streamlit UI.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!file || loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running prediction…
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" /> Run prediction
            </>
          )}
        </Button>
      </form>

      {summary && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold text-foreground">Batch Results</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBlock label="Total Orders" value={summary.totalOrders.toLocaleString()} />
            <StatBlock label="OTIF Miss" value={summary.missCount.toLocaleString()} variant="risk" />
            <StatBlock label="OTIF Hit" value={summary.hitCount.toLocaleString()} variant="success" />
            <StatBlock label="Miss Rate" value={`${summary.missRate.toFixed(1)}%`} variant="risk" />
          </div>
        </Card>
      )}
    </div>
  );
}

// ================================================================
// TAB 4 — Data Management
// ================================================================

function TabDataManagement({ token }: { token: string | null }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-data-status"],
    queryFn: () => fetchDataStatus(token),
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionLabel, setActionLabel] = useState<string | null>(null);

  const runAction = async (path: string, label: string) => {
    setActionError(null);
    setLoadingAction(true);
    setActionLabel(label);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
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
      setActionLabel(null);
    }
  };

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Data Retention &amp; Management</h2>
        <p className="text-sm text-muted-foreground">
          Inspect and control the local OTIF master repository used for model training and evaluation.
        </p>
      </div>

      {isLoading && !data && <LoadingBlock label="Loading data status…" />}

      {data && (
        <Card className="p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Repository Status</span>
          </div>
          <p>
            Status:{" "}
            <span className={`font-semibold ${data.hasMaster ? "text-success" : "text-destructive"}`}>
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
        </Card>
      )}

      <Card className="divide-y p-0">
        <ActionRow
          title="Train model"
          description="Train or re-train the OTIF model for the latest available month."
          icon={<Wrench className="h-4 w-4" />}
          loading={loadingAction && actionLabel === "train"}
          disabled={loadingAction}
          onClick={() => runAction("/admin/train", "train")}
        />
        <ActionRow
          title="Run rolling backtest"
          description="Re-train and evaluate the model over the configured date window (Jan 2024 – Dec 2025)."
          icon={<Play className="h-4 w-4" />}
          loading={loadingAction && actionLabel === "backtest"}
          disabled={loadingAction}
          onClick={() => runAction("/admin/data/backtest", "backtest")}
        />
        <ActionRow
          title="Clear local repository"
          description="Remove the local master parquet file. Use with caution."
          icon={<Trash2 className="h-4 w-4" />}
          loading={loadingAction && actionLabel === "clear"}
          disabled={loadingAction}
          destructive
          onClick={() => runAction("/admin/data/clear", "clear")}
        />
      </Card>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
    </div>
  );
}

// ---------- Shared UI helpers ----------

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function StatBlock({ label, value, variant }: { label: string; value: string; variant?: "risk" | "success" }) {
  const color =
    variant === "risk" ? "text-destructive" : variant === "success" ? "text-success" : "text-foreground";
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ActionRow({
  title,
  description,
  icon,
  loading,
  disabled,
  destructive,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        variant={destructive ? "destructive" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={onClick}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon}
        <span className="ml-1">{loading ? "Running…" : title.split(" ").slice(0, 2).join(" ")}</span>
      </Button>
    </div>
  );
}
