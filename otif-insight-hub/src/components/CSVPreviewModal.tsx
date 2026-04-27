import { useState, useMemo, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OTIFRecord } from "@/types/otif";

const PAGE_SIZE_MIN = 1;
const PAGE_SIZE_MAX = 10_000;

function clampPageSize(raw: number): number {
  if (!Number.isFinite(raw)) return PAGE_SIZE_MIN;
  const n = Math.floor(raw);
  return Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, n));
}

interface CSVPreviewModalProps {
  filename: string;
  records: OTIFRecord[];
  fileSize: string;
  onClose: () => void;
}

const headerCell =
  "sticky top-0 z-20 border-b border-border bg-muted py-3 text-left font-medium text-muted-foreground";

export function CSVPreviewModal({ filename, records, fileSize, onClose }: CSVPreviewModalProps) {
  const [page, setPage] = useState(1);
  const [goToPageOpen, setGoToPageOpen] = useState(false);
  const [goToPageDraft, setGoToPageDraft] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [pageSizeDraft, setPageSizeDraft] = useState("25");

  useEffect(() => {
    setPageSizeDraft(String(pageSize));
  }, [pageSize]);

  const commitPageSize = (n: number) => {
    const clamped = clampPageSize(n);
    setPageSize(clamped);
    setPage(1);
  };

  const flushPageSizeDraft = () => {
    const trimmed = pageSizeDraft.trim();
    if (trimmed === "") {
      setPageSizeDraft(String(pageSize));
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      setPageSizeDraft(String(pageSize));
      return;
    }
    commitPageSize(parsed);
    setPageSizeDraft(String(clampPageSize(parsed)));
  };

  const totalPages = useMemo(
    () => (records.length === 0 ? 0 : Math.ceil(records.length / pageSize)),
    [records.length, pageSize],
  );

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, page, pageSize]);

  useEffect(() => {
    if (totalPages === 0) {
      setPage(1);
      return;
    }
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [records.length, pageSize]);

  return (
    <div className="glass-modal-backdrop fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="glass-modal-panel relative mx-4 flex min-h-0 max-h-[88vh] w-full max-w-5xl flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{filename}</h2>
            <p className="text-sm text-muted-foreground">
              {records.length} rows • {fileSize}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Match OrderTable: count + rows per page (no top padding on scroll — avoids sticky bleed-through) */}
        <div className="flex shrink-0 flex-col gap-2 border-b px-6 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0">
            Showing{" "}
            <span className="tabular-nums text-foreground/90">{pageRows.length}</span> of{" "}
            <span className="tabular-nums text-foreground/90">{records.length}</span> rows
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="csv-preview-page-size" className="whitespace-nowrap">
              Rows per page
            </label>
            <Input
              id="csv-preview-page-size"
              type="number"
              min={PAGE_SIZE_MIN}
              max={PAGE_SIZE_MAX}
              step={1}
              inputMode="numeric"
              aria-label="Rows per page"
              title={`${PAGE_SIZE_MIN}–${PAGE_SIZE_MAX} rows`}
              className={cn(
                "h-8 w-[4.5rem] tabular-nums px-2 text-xs shadow-sm [appearance:textfield]",
                "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              )}
              value={pageSizeDraft}
              onChange={(e) => setPageSizeDraft(e.target.value)}
              onBlur={flushPageSizeDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  flushPageSizeDraft();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-background px-6 pb-3">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={cn(headerCell, "pr-4 text-left")}>#</th>
                <th className={cn(headerCell, "pr-4 text-left")}>Sales Order</th>
                <th className={cn(headerCell, "pr-4 text-left")}>Customer</th>
                <th className={cn(headerCell, "pr-4 text-left")}>Material</th>
                <th className={cn(headerCell, "pr-4 text-left")}>Plant</th>
                <th className={cn(headerCell, "pr-4 text-left")}>Req. Delivery</th>
                <th className={cn(headerCell, "pr-4 text-right")}>Risk Score</th>
                <th className={cn(headerCell, "text-center")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.rowNum} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-3 pr-4 text-muted-foreground">{r.rowNum}</td>
                  <td className="py-3 pr-4 font-medium text-primary">{r.salesOrder}</td>
                  <td className="py-3 pr-4">{r.customer}</td>
                  <td className="py-3 pr-4">{r.material}</td>
                  <td className="py-3 pr-4">{r.plant}</td>
                  <td className="py-3 pr-4">{r.reqDelivery}</td>
                  <td className="py-3 pr-4 text-right">{r.riskScore}%</td>
                  <td className="py-3 text-center">
                    <span className={r.status === "Hit" ? "status-hit" : "status-miss"}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-6 py-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <div className="flex min-h-8 flex-col items-center justify-center gap-1 sm:flex-row sm:gap-3">
              {!goToPageOpen ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setGoToPageDraft(String(page));
                      setGoToPageOpen(true);
                    }}
                  >
                    Go to page…
                  </button>
                </>
              ) : (
                <form
                  className="flex flex-wrap items-center justify-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number.parseInt(goToPageDraft.trim(), 10);
                    if (!Number.isFinite(n)) return;
                    const next = Math.min(totalPages, Math.max(1, n));
                    setPage(next);
                    setGoToPageOpen(false);
                  }}
                >
                  <span className="text-xs text-muted-foreground">Page</span>
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    inputMode="numeric"
                    value={goToPageDraft}
                    onChange={(e) => setGoToPageDraft(e.target.value)}
                    className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setGoToPageOpen(false);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">of {totalPages}</span>
                  <Button type="submit" size="sm" className="h-8 px-3">
                    Go
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setGoToPageOpen(false)}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
