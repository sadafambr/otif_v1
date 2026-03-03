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
  leadTime: string;
  riskScore: number;
  status: "Hit" | "Miss";
  /** Optional probabilities from model export (percent 0–100) */
  probHit?: number;
  probMiss?: number;
  /** SHAP-based risk signals extracted from CSV top features */
  riskSignals?: string;
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
}

export interface PeriodFilter {
  label: string;
  value: string;
}

