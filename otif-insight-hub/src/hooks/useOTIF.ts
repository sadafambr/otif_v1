import { useState, useCallback } from "react";
import type { OTIFFile, OTIFRecord, DashboardSummary, OrderDetail, OrderFilters, RiskDriver } from "@/types/otif";
import { fetchOrderSummary } from "@/lib/api";
import { useAuth } from "./useAuth";

// Hook for file management
export function useFiles() {
  const [files, setFiles] = useState<OTIFFile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call: GET /files
      // const res = await fetch('/api/files');
      // const data = await res.json();
      // setFiles(data);
      setFiles([]);
    } catch (err) {
      console.error("Failed to fetch files", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call: POST /upload
      // const formData = new FormData();
      // formData.append('file', file);
      // const res = await fetch('/api/upload', { method: 'POST', body: formData });
      // const data = await res.json();

      // Simulate parsing
      const text = await file.text();
      const lines = text.trim().split("\n");
      const rowCount = Math.max(0, lines.length - 1);

      const newFile: OTIFFile = {
        id: generateFileId(),
        filename: file.name,
        uploadDate: new Date().toISOString(),
        rowCount,
        fileSize: formatFileSize(file.size),
      };
      setFiles((prev) => [...prev, newFile]);
      return newFile;
    } catch (err) {
      console.error("Failed to upload file", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteFile = useCallback(async (fileId: string) => {
    // TODO: Replace with actual API call: DELETE /files/:id
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  return { files, loading, fetchFiles, uploadFile, deleteFile };
}

// Hook for CSV preview
export function useCSVPreview() {
  const [records, setRecords] = useState<OTIFRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);

  const parseCSV = useCallback(async (file: File): Promise<OTIFRecord[]> => {
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split("\n");
      if (lines.length < 2) return [];

      // RFC 4180-aware CSV line parser: handles commas inside quoted fields
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (inQuotes) {
            if (ch === '"' && c + 1 < line.length && line[c + 1] === '"') {
              current += '"';
              c++; // skip escaped quote
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              current += ch;
            }
          } else {
            if (ch === '"') {
              inQuotes = true;
            } else if (ch === ',') {
              result.push(current.trim());
              current = "";
            } else {
              current += ch;
            }
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCSVLine(lines[0]);
      const headersLower = headers.map(h => h.toLowerCase());
      setRawHeaders(headers);
      const parsed: OTIFRecord[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 2) continue;

        const get = (key: string) => {
          const idx = headersLower.indexOf(key);
          return idx >= 0 ? cols[idx] : "";
        };

        // Multi-alias lookup: try several possible header names
        const getAny = (...keys: string[]) => {
          for (const k of keys) {
            const v = get(k);
            if (v) return v;
          }
          return "";
        };

        const rawStatus =
          getAny("otif_hit/miss", "otif_hit", "status", "prediction", "otif_status", "otif hit/miss");

        const normalizedStatus = rawStatus.trim().toLowerCase();

        // Parse probability: normalise 0–1 → percent, clamp to 0–100
        const parseProb = (value: string): number | null => {
          if (!value) return null;
          const n = parseFloat(value);
          if (!Number.isFinite(n)) return null;
          const pct = (n >= 0 && n <= 1) ? n * 100 : n;
          return Math.max(0, Math.min(100, pct));
        };

        const probHit = parseProb(
          getAny("otif_hit", "prob_hit", "hit_probability", "hit probability", "probability_hit", "hit_prob")
        );
        const probMiss = parseProb(
          getAny("otif_miss", "prob_miss", "risk_score", "riskscore", "miss probability", "probability_miss", "miss_prob", "risk_percent")
        );

        let status: "Hit" | "Miss";
        // If we have explicit probabilities, let them drive the label to avoid contradictions
        if (probHit !== undefined && probMiss !== undefined) {
          status = probHit >= probMiss ? "Hit" : "Miss";
        } else if (
          normalizedStatus.includes("miss") ||
          normalizedStatus.includes("late") ||
          normalizedStatus === "0" ||
          normalizedStatus === "false"
        ) {
          status = "Miss";
        } else if (
          normalizedStatus.includes("hit") ||
          normalizedStatus.includes("on-time") ||
          normalizedStatus.includes("ontime") ||
          normalizedStatus.includes("on time") ||
          normalizedStatus === "1" ||
          normalizedStatus === "true"
        ) {
          status = "Hit";
        } else {
          status = "Hit";
        }

        // Derive riskScore — same logic as Streamlit (risk_score = 1 - hit_probability)
        let riskScore: number;
        const rawRisk = getAny("risk_score", "riskscore", "risk_percent", "risk");
        if (rawRisk) {
          const n = parseFloat(rawRisk);
          if (Number.isFinite(n)) {
            riskScore = (n >= 0 && n <= 1) ? n * 100 : n;
          } else {
            riskScore = probMiss ?? (probHit != null ? 100 - probHit : 0);
          }
        } else if (probMiss != null) {
          riskScore = probMiss;
        } else if (probHit != null) {
          riskScore = 100 - probHit;
        } else {
          riskScore = 0;
        }
        // Clamp to 0–100 to prevent overflow
        riskScore = Math.max(0, Math.min(100, Math.round(riskScore * 10) / 10));

        // Derive lead time (gap days between request lead and material lead)
        // Priority: explicit column → f_lead_gap_days → f_request - f_material → raw dates
        let leadTime = getAny("lead_time", "leadtime", "lead days", "lead_days");
        if (!leadTime) {
          const gap = parseFloat(getAny("f_lead_gap_days", "lead_gap_days", "gap_days"));
          if (Number.isFinite(gap)) {
            leadTime = String(Math.round(gap));
          } else {
            const reqLead = parseFloat(getAny("f_request_lead_days", "request_lead_days", "request_lead"));
            const matLead = parseFloat(getAny("f_material_lead_days", "material_lead_days", "material_lead"));
            if (Number.isFinite(reqLead) && Number.isFinite(matLead)) {
              leadTime = String(Math.round(reqLead - matLead));
            } else {
              // Compute from raw date columns (same as backend feature_engineering.py):
              // f_request_lead_days = (Requested Delivery Date - SO create date).days
              // f_material_lead_days = (Mat_Avl_Date_OTIF - SO create date).days
              // f_lead_gap_days = f_request_lead_days - f_material_lead_days
              //                 = (RDD - Mat_Avl_Date).days
              const rddStr = getAny("requested delivery date", "requested_delivery_date",
                "req. deliv. date", "req_delivery", "requested_delivery", "req delivery date", "rdd");
              const matAvlStr = getAny("mat_avl_date_otif", "mat avl date otif",
                "material availability date", "mat_avail_date", "mad");
              const soDateStr = getAny("so create date", "so_create_date",
                "order date", "order_date", "sales order date", "so_date");

              const parseDate = (s: string) => {
                if (!s) return null;
                const d = new Date(s);
                return isNaN(d.getTime()) ? null : d;
              };

              const rddDate = parseDate(rddStr);
              const matAvlDate = parseDate(matAvlStr);
              const soDate = parseDate(soDateStr);

              if (rddDate && matAvlDate) {
                // lead_gap = (RDD - MatAvl) in days
                const diffMs = rddDate.getTime() - matAvlDate.getTime();
                leadTime = String(Math.round(diffMs / (1000 * 60 * 60 * 24)));
              } else if (rddDate && soDate && matAvlDate) {
                // f_request_lead = (RDD - SO).days, f_material_lead = (MatAvl - SO).days
                const reqMs = rddDate.getTime() - soDate.getTime();
                const matMs = matAvlDate.getTime() - soDate.getTime();
                const gapDays = (reqMs - matMs) / (1000 * 60 * 60 * 24);
                leadTime = String(Math.round(gapDays));
              }
            }
          }
        }

        // Extract SHAP risk signals from top features
        const shapSignals: string[] = [];
        for (const key of ["top1_feature", "top2_feature", "top3_feature", "top_feature_1", "top_feature_2", "top_feature_3", "shap_feature_1", "shap_feature_2", "shap_feature_3"]) {
          const feat = get(key);
          if (feat) shapSignals.push(feat);
        }

        // Extract individual SHAP top-feature fields for API forwarding
        const top1Feature = getAny("top1_feature", "top_feature_1", "shap_feature_1") || undefined;
        const top1Value = getAny("top1_value", "top_value_1", "shap_value_1") || undefined;
        const top1ShapRaw = parseFloat(getAny("top1_shap", "top_shap_1", "shap_impact_1"));
        const top1Shap = Number.isFinite(top1ShapRaw) ? top1ShapRaw : undefined;

        const top2Feature = getAny("top2_feature", "top_feature_2", "shap_feature_2") || undefined;
        const top2Value = getAny("top2_value", "top_value_2", "shap_value_2") || undefined;
        const top2ShapRaw = parseFloat(getAny("top2_shap", "top_shap_2", "shap_impact_2"));
        const top2Shap = Number.isFinite(top2ShapRaw) ? top2ShapRaw : undefined;

        const top3Feature = getAny("top3_feature", "top_feature_3", "shap_feature_3") || undefined;
        const top3Value = getAny("top3_value", "top_value_3", "shap_value_3") || undefined;
        const top3ShapRaw = parseFloat(getAny("top3_shap", "top_shap_3", "shap_impact_3"));
        const top3Shap = Number.isFinite(top3ShapRaw) ? top3ShapRaw : undefined;

        // Build rawData map: every CSV column keyed by lowercase header name
        const rawData: Record<string, string> = {};
        for (let h = 0; h < headersLower.length; h++) {
          rawData[headersLower[h]] = cols[h] || "";
        }

        parsed.push({
          rowNum: i,
          salesOrder: getAny("sales_order", "salesorder", "order", "sales order", "so"),
          customer: getAny("customer", "customer name", "customer_name", "ship-to name", "ship to name", "customer_id"),
          material: getAny("material", "material description", "material_description", "material id", "material code", "product"),
          plant: getAny("plant", "plant name", "location"),
          reqDelivery: getAny("req_delivery", "requested_delivery", "requested delivery date", "requested_delivery_date", "req. deliv. date", "req delivery date", "rdd"),
          soCreateDate: getAny("so create date", "so_create_date", "order date", "order_date", "sales order date", "so_date") || "",
          leadTime: leadTime || "",
          riskScore,
          status,
          probHit: probHit ?? undefined,
          probMiss: probMiss ?? undefined,
          riskSignals: shapSignals.length > 0 ? shapSignals.join("; ") : undefined,
          top1Feature, top1Value, top1Shap,
          top2Feature, top2Value, top2Shap,
          top3Feature, top3Value, top3Shap,
          rawData,
        });
      }

      setRecords(parsed);
      return parsed;
    } catch (err) {
      console.error("Failed to parse CSV", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { records, loading, parseCSV, setRecords, rawHeaders };
}

// Hook for dashboard data
export function useDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orders, setOrders] = useState<OTIFRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async (records: OTIFRecord[]) => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call: GET /dashboard
      const miss = records.filter(r => r.status === "Miss").length;
      const hit = records.filter(r => r.status === "Hit").length;
      const total = records.length;

      setSummary({
        totalOrders: total,
        otifMiss: miss,
        otifHit: hit,
        missRate: total > 0 ? Math.round((miss / total) * 1000) / 10 : 0,
        lastUpdated: new Date().toISOString(),
      });
      setOrders(records);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    // TODO: Replace with actual API call: GET /dashboard
    if (orders.length > 0) {
      await loadDashboard(orders);
    }
  }, [orders, loadDashboard]);

  return { summary, orders, loading, loadDashboard, refresh, setOrders };
}

// Hook for order detail / AI explanation
export function useOrderDetail() {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();

  const fetchDetail = useCallback(async (order: OTIFRecord) => {
    setLoading(true);
    try {
      const summary = await fetchOrderSummary(order, token || undefined);

      setDetail({
        salesOrder: order.salesOrder,
        customer: order.customer,
        material: order.material,
        plant: order.plant,
        probHit: summary.probHit,
        probMiss: summary.probMiss,
        prediction: summary.prediction,
        reqDelivery: order.reqDelivery,
        leadTime: order.leadTime,
        explanation: summary.explanation,
        riskDrivers: summary.riskDrivers,
        genaiSummary: summary.genaiSummary,
        shapOneLiner: summary.shapOneLiner,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { detail, loading, fetchDetail, setDetail };
}

function generateRiskDrivers(order: OTIFRecord): RiskDriver[] {
  const leadDays = parseInt(order.leadTime) || 3;
  const drivers: RiskDriver[] = [];

  if (leadDays <= 5) {
    drivers.push({
      rank: 1,
      name: "Extremely Tight Flag",
      value: "Yes",
      description: "Severely time-constrained orders where material readiness is far behind demand (tight ratio < 0.75).",
      shapValue: 3.45,
      maxShap: 4,
      explanation: `Extremely tight order — material readiness is far behind demand (tight ratio < 0.75), strongly increasing miss risk.`,
      flag: true,
    });
  }

  drivers.push({
    rank: drivers.length + 1,
    name: "Material Lead Days",
    value: `${leadDays} days`,
    description: "Material Availability Date minus Sales Order creation date.",
    shapValue: 1.95,
    maxShap: 4,
    explanation: `Material lead time of ${leadDays} days strongly increases the prediction.`,
    flag: false,
  });

  drivers.push({
    rank: drivers.length + 1,
    name: "Request Lead Days",
    value: `${leadDays} days`,
    description: "Requested Delivery Date minus Sales Order creation date.",
    shapValue: 1.45,
    maxShap: 4,
    explanation: `Short request lead time (${leadDays} days) leaves little room for delays, strongly increases miss risk.`,
    flag: false,
  });

  return drivers;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function generateFileId(): string {
  try {
    const globalCrypto: Crypto | undefined =
      (typeof window !== "undefined" && window.crypto) ||
      (typeof self !== "undefined" && (self as any).crypto);

    if (globalCrypto && "randomUUID" in globalCrypto && typeof (globalCrypto as any).randomUUID === "function") {
      return (globalCrypto as any).randomUUID();
    }

    if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
      const buf = new Uint32Array(4);
      globalCrypto.getRandomValues(buf);
      return Array.from(buf).map((n) => n.toString(16).padStart(8, "0")).join("");
    }
  } catch {
    // fall through to time-based id
  }

  return `file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
