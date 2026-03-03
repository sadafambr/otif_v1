import type { OTIFRecord } from "@/types/otif";

// In-memory store to pass parsed CSV data between pages without sessionStorage limits
let storedRecords: OTIFRecord[] = [];
let storedFilename: string = "";

export function setDashboardData(records: OTIFRecord[], filename: string) {
  storedRecords = records;
  storedFilename = filename;
}

export function getDashboardData() {
  return { records: storedRecords, filename: storedFilename };
}

export function clearDashboardData() {
  storedRecords = [];
  storedFilename = "";
}
