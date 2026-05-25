import * as XLSX from "xlsx";

const SPREADSHEET_EXTENSIONS = [".csv", ".xlsx", ".xlsb", ".xls"] as const;

export type SpreadsheetExtension = (typeof SPREADSHEET_EXTENSIONS)[number];

export function getSpreadsheetExtension(filename: string): SpreadsheetExtension | null {
  const lower = filename.trim().toLowerCase();
  for (const ext of SPREADSHEET_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export function isSpreadsheetFile(file: File): boolean {
  return getSpreadsheetExtension(file.name) !== null;
}

export interface SpreadsheetTable {
  /** Normalized keys aligned with `rawData` on each row (lowercase; duplicates get __2, __3, …). */
  columnKeys: string[];
  /** Human-readable column labels for UI (original header text; duplicates numbered). */
  columnLabels: string[];
  /** Data rows — each inner array matches `columnKeys` length. */
  rows: string[][];
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function buildColumnKeys(headers: string[]): { columnKeys: string[]; columnLabels: string[] } {
  const columnKeys: string[] = [];
  const columnLabels: string[] = [];
  const seen = new Map<string, number>();

  headers.forEach((raw, index) => {
    const trimmed = cellToString(raw);
    const labelBase = trimmed || `Column ${index + 1}`;
    const lower = labelBase.toLowerCase();
    const dup = seen.get(lower) ?? 0;
    seen.set(lower, dup + 1);
    const key = dup === 0 ? lower : `${lower}__${dup + 1}`;
    const label = dup === 0 ? labelBase : `${labelBase} (${dup + 1})`;
    columnKeys.push(key);
    columnLabels.push(label);
  });

  return { columnKeys, columnLabels };
}

function sheetToTable(sheet: XLSX.WorkSheet): SpreadsheetTable {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (grid.length === 0) {
    return { columnKeys: [], columnLabels: [], rows: [] };
  }

  const headerRow = (grid[0] ?? []).map(cellToString);
  const { columnKeys, columnLabels } = buildColumnKeys(headerRow);
  const width = columnKeys.length;

  const rows: string[][] = [];
  for (let r = 1; r < grid.length; r++) {
    const line = (grid[r] ?? []).map(cellToString);
    if (line.every((c) => !c)) continue;

    const padded: string[] = [];
    for (let c = 0; c < width; c++) {
      padded.push(line[c] ?? "");
    }
    rows.push(padded);
  }

  return { columnKeys, columnLabels, rows };
}

/**
 * Parse CSV, XLSX, XLSB, or XLS into a normalized table.
 * Uses the first worksheet; first non-empty row is treated as headers.
 */
export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetTable> {
  const ext = getSpreadsheetExtension(file.name);
  if (!ext) {
    throw new Error(
      `Unsupported file type "${file.name}". Please upload a .csv, .xlsx, .xlsb, or .xls file.`,
    );
  }

  const buffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  if (ext === ".csv") {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
    workbook = XLSX.read(text, { type: "string" });
  } else {
    workbook = XLSX.read(buffer, { type: "array" });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { columnKeys: [], columnLabels: [], rows: [] };
  }

  return sheetToTable(workbook.Sheets[sheetName]);
}
