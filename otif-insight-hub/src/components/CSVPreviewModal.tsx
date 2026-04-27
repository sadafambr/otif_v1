import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OTIFRecord } from "@/types/otif";

interface CSVPreviewModalProps {
  filename: string;
  records: OTIFRecord[];
  fileSize: string;
  onClose: () => void;
}

export function CSVPreviewModal({ filename, records, fileSize, onClose }: CSVPreviewModalProps) {
  return (
    <div className="glass-modal-backdrop fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="glass-modal-panel relative mx-4 flex min-h-0 max-h-[88vh] w-full max-w-5xl flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{filename}</h2>
            <p className="text-sm text-muted-foreground">{records.length} rows • {fileSize}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable Table — sticky header on each th so body rows never paint over labels */}
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  #
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Sales Order
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Customer
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Material
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Plant
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-left font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Req. Delivery
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 pr-4 text-right font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Risk Score
                </th>
                <th className="sticky top-0 z-20 border-b border-border bg-muted py-3 text-center font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
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
      </div>
    </div>
  );
}
