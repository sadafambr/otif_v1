import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xlsb"];
const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                           // .xls / .xlsb
];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  const hasAllowedMime = !file.type || ALLOWED_MIME_TYPES.includes(file.type);
  return hasAllowedExtension && hasAllowedMime;
}

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  onInvalidFile?: (message: string) => void;
  accept?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function FileUploadZone({
  onFileSelect,
  onInvalidFile,
  accept = ".csv,.xlsx,.xlsb",
  disabled,
  isLoading,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!isAllowedFile(file)) {
      const msg = `Unsupported file type "${file.name}". Please upload a .csv, .xlsx, or .xlsb file.`;
      if (onInvalidFile) {
        onInvalidFile(msg);
      } else {
        alert(msg);
      }
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFileSelect, onInvalidFile, disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "glass-upload-zone flex cursor-pointer flex-col items-center justify-center p-12",
        isDragOver && "border-primary scale-[1.01] bg-primary/10 shadow-md",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Upload className="h-6 w-6 animate-pulse" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">
        {isLoading ? "Uploading and scanning file..." : "Upload OTIF Data File"}
      </h3>
      <p className="text-center text-sm text-muted-foreground">
        {isLoading ? (
          <>
            Please wait while we read and validate your dataset.
            <br />
            This may take a few seconds for larger files.
          </>
        ) : (
          <>
            Drag and drop your file here, or click to browse.
            <br />
            <span className="font-medium text-foreground/70">Accepted formats: .csv, .xlsx, .xlsb</span>
          </>
        )}
      </p>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
    </div>
  );
}
