import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function FileUploadZone({ onFileSelect, accept = ".csv", disabled, isLoading }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect, disabled]
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
    if (file) onFileSelect(file);
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
        {isLoading ? "Uploading and scanning CSV..." : "Upload OTIF CSV"}
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
            Drag and drop your CSV file here, or click to browse.
            <br />
            Compatible with standard OTIF prediction export format.
          </>
        )}
      </p>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
    </div>
  );
}
