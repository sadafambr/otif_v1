import type { OTIFRecord } from "@/types/otif";

// In-memory store to pass parsed CSV data between pages without sessionStorage limits
let storedRecords: OTIFRecord[] = [];
let storedFilename: string = "";
let storedRawHeaders: string[] = [];

export function setDashboardData(records: OTIFRecord[], filename: string, rawHeaders?: string[]) {
  storedRecords = records;
  storedFilename = filename;
  storedRawHeaders = rawHeaders || [];
}

export function getDashboardData() {
  return { records: storedRecords, filename: storedFilename, rawHeaders: storedRawHeaders };
}

export function clearDashboardData() {
  storedRecords = [];
  storedFilename = "";
  storedRawHeaders = [];
}

