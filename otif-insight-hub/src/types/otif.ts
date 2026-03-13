// Types for the OTIF Risk Intelligence platform

export interface OTIFFile {
  id: string;
  filename: string;
  uploadDate: string;
  rowCount: number;
  fileSize: string;
}

export interface OTIFRecord {
  rowNum: number;
  salesOrder: string;
  customer: string;
  material: string;
  plant: string;
  reqDelivery: string;
  soCreateDate: string;
  leadTime: string;
  riskScore: number;
  status: "Hit" | "Miss";
  /** Optional probabilities from model export (percent 0–100) */
  probHit?: number;
  probMiss?: number;
  /** SHAP-based risk signals extracted from CSV top features */
  riskSignals?: string;
  /** Per-row SHAP top features from model output */
  top1Feature?: string;
  top1Value?: string;
  top1Shap?: number;
  top2Feature?: string;
  top2Value?: string;
  top2Shap?: number;
  top3Feature?: string;
  top3Value?: string;
  top3Shap?: number;
  /** All raw CSV column values keyed by lowercase header name */
  rawData: Record<string, string>;
}

export interface DashboardSummary {
  totalOrders: number;
  otifMiss: number;
  otifHit: number;
  missRate: number;
  lastUpdated: string;
}

export interface OrderDetail {
  salesOrder: string;
  customer: string;
  material: string;
  plant: string;
  probHit: number;
  probMiss: number;
  prediction: "Hit" | "Miss";
  reqDelivery: string;
  leadTime: string;
  explanation: string;
  riskDrivers: RiskDriver[];
  genaiSummary?: string;
  shapOneLiner?: string;
}

export interface RiskDriver {
  rank: number;
  name: string;
  value: string;
  description: string;
  shapValue: number;
  maxShap: number;
  explanation: string;
  flag: boolean;
}

export interface OrderFilters {
  search: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  leadTimeMin?: number;
  leadTimeMax?: number;
  riskScoreMin?: number;
  riskScoreMax?: number;
  statusFilter?: "Hit" | "Miss" | null;
  customers?: string[];
  plants?: string[];
  soCreateDateStart?: string;
  soCreateDateEnd?: string;
}

export interface PeriodFilter {
  label: string;
  value: string;
}

