import type { OTIFRecord } from "@/types/otif";
import { clearDynamicHeaderLabels, setDynamicHeaderLabels } from "@/lib/columnMapping";

// In-memory store to pass parsed spreadsheet data between pages without sessionStorage limits
let storedRecords: OTIFRecord[] = [];
let storedFilename: string = "";
let storedRawHeaders: string[] = [];
let storedHeaderLabels: Record<string, string> = {};

export function setDashboardData(
  records: OTIFRecord[],
  filename: string,
  rawHeaders?: string[],
  headerLabels?: Record<string, string>,
) {
  storedRecords = records;
  storedFilename = filename;
  storedRawHeaders = rawHeaders || [];
  storedHeaderLabels = headerLabels || {};
  setDynamicHeaderLabels(storedHeaderLabels);
}

export function getDashboardData() {
  return {
    records: storedRecords,
    filename: storedFilename,
    rawHeaders: storedRawHeaders,
    headerLabels: storedHeaderLabels,
  };
}

export function clearDashboardData() {
  storedRecords = [];
  storedFilename = "";
  storedRawHeaders = [];
  storedHeaderLabels = {};
  clearDynamicHeaderLabels();
}

