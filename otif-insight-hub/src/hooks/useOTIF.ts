import { useState, useCallback } from "react";
import type { OTIFFile, OTIFRecord, DashboardSummary, OrderDetail, OrderFilters, RiskDriver } from "@/types/otif";
import { fetchOrderSummary } from "@/lib/api";
import { isSpreadsheetFile, parseSpreadsheetFile } from "@/lib/spreadsheetParser";
import { buildHeaderLabelMap, mapSpreadsheetToOtifRecords } from "@/lib/otifRecordMapper";
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
      if (!isSpreadsheetFile(file)) {
        throw new Error(
          `Unsupported file type "${file.name}". Please upload a .csv, .xlsx, or .xlsb file.`,
        );
      }

      // TODO: Replace with actual API call: POST /upload
      const table = await parseSpreadsheetFile(file);
      const rowCount = table.rows.length;

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

export interface ParseSpreadsheetResult {
  records: OTIFRecord[];
  columnKeys: string[];
  headerLabels: Record<string, string>;
}

// Hook for spreadsheet preview (CSV / Excel)
export function useCSVPreview() {
  const [records, setRecords] = useState<OTIFRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [headerLabels, setHeaderLabels] = useState<Record<string, string>>({});

  const parseSpreadsheet = useCallback(async (file: File): Promise<ParseSpreadsheetResult> => {
    setLoading(true);
    try {
      if (!isSpreadsheetFile(file)) {
        console.error(`Unsupported file type: ${file.name}`);
        return { records: [], columnKeys: [], headerLabels: {} };
      }

      const table = await parseSpreadsheetFile(file);
      const parsed = mapSpreadsheetToOtifRecords(table);
      const labels = buildHeaderLabelMap(table);

      setRawHeaders(table.columnKeys);
      setHeaderLabels(labels);
      setRecords(parsed);

      return { records: parsed, columnKeys: table.columnKeys, headerLabels: labels };
    } catch (err) {
      console.error("Failed to parse spreadsheet", err);
      return { records: [], columnKeys: [], headerLabels: {} };
    } finally {
      setLoading(false);
    }
  }, []);

  /** @deprecated Use parseSpreadsheet — kept for existing call sites */
  const parseCSV = useCallback(
    async (file: File): Promise<OTIFRecord[]> => {
      const result = await parseSpreadsheet(file);
      return result.records;
    },
    [parseSpreadsheet],
  );

  return {
    records,
    loading,
    parseSpreadsheet,
    parseCSV,
    setRecords,
    rawHeaders,
    headerLabels,
  };
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
