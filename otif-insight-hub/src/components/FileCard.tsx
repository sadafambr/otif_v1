import { FileSpreadsheet, Eye, ArrowRight, Trash2, Calendar, Rows3, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OTIFFile } from "@/types/otif";

interface FileCardProps {
  file: OTIFFile;
  onPreview: (file: OTIFFile) => void;
  onLoadToDashboard: (file: OTIFFile) => void;
  onDelete: (file: OTIFFile) => void;
}

export function FileCard({ file, onPreview, onLoadToDashboard, onDelete }: FileCardProps) {
  const formattedDate = new Date(file.uploadDate).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-foreground">{file.filename}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formattedDate}</span>
            <span className="flex items-center gap-1"><Rows3 className="h-3 w-3" />{file.rowCount} rows</span>
            <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{file.fileSize}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPreview(file)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        <Button size="sm" onClick={() => onLoadToDashboard(file)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
          Load to Dashboard
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(file)} className="text-destructive hover:text-destructive/80 hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
