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
        className="glass-modal-panel relative mx-4 flex max-h-[88vh] w-full max-w-5xl flex-col animate-fade-in"
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

        {/* Scrollable Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b border-border text-muted-foreground">
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
