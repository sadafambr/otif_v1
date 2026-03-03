import { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OTIFRecord } from "@/types/otif";

interface CSVPreviewModalProps {
  filename: string;
  records: OTIFRecord[];
  fileSize: string;
  onClose: () => void;
}

const PAGE_SIZE = 15;

export function CSVPreviewModal({ filename, records, fileSize, onClose }: CSVPreviewModalProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(records.length / PAGE_SIZE);

  const pageRecords = useMemo(
    () => records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [records, page]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40" onClick={onClose}>
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-card shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{filename}</h2>
            <p className="text-sm text-muted-foreground">{records.length} rows • {fileSize}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-3 pr-4 text-left font-medium">#</th>
                <th className="pb-3 pr-4 text-left font-medium">Sales Order</th>
                <th className="pb-3 pr-4 text-left font-medium">Customer</th>
                <th className="pb-3 pr-4 text-left font-medium">Material</th>
                <th className="pb-3 pr-4 text-left font-medium">Plant</th>
                <th className="pb-3 pr-4 text-left font-medium">Req. Delivery</th>
                <th className="pb-3 pr-4 text-right font-medium">Risk Score</th>
                <th className="pb-3 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRecords.map((r) => (
                <tr key={r.rowNum} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-3 pr-4 text-muted-foreground">{r.rowNum}</td>
                  <td className="py-3 pr-4 font-medium text-primary">{r.salesOrder}</td>
                  <td className="py-3 pr-4">{r.customer}</td>
                  <td className="py-3 pr-4">{r.material}</td>
                  <td className="py-3 pr-4">{r.plant}</td>
                  <td className="py-3 pr-4">{r.reqDelivery}</td>
                  <td className="py-3 pr-4 text-right">{r.riskScore}%</td>
                  <td className="py-3 text-center">
                    <span className={r.status === "Hit" ? "status-hit" : "status-miss"}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-6 py-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
