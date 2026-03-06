import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { FileUploadZone } from "@/components/FileUploadZone";
import { FileCard } from "@/components/FileCard";
import { CSVPreviewModal } from "@/components/CSVPreviewModal";
import { useFiles, useCSVPreview } from "@/hooks/useOTIF";
import { useNavigate } from "react-router-dom";
import { setDashboardData } from "@/lib/dataStore";
import type { OTIFFile } from "@/types/otif";

export default function DocumentRepository() {
  const { files, loading, uploadFile, deleteFile } = useFiles();
  const { records, loading: previewLoading, parseCSV } = useCSVPreview();
  const navigate = useNavigate();

  const [previewFile, setPreviewFile] = useState<OTIFFile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Store raw File objects keyed by OTIFFile id
  const rawFilesRef = useRef<Map<string, File>>(new Map());

  const handleUpload = async (file: File) => {
    setErrorMessage(null);
    try {
      const otifFile = await uploadFile(file);
      if (!otifFile) {
        setErrorMessage("File could not be uploaded. Please try again with a valid OTIF CSV export.");
        return;
      }
      rawFilesRef.current.set(otifFile.id, file);
    } catch (err) {
      console.error(err);
      setErrorMessage("Something went wrong while uploading the file. Please check the file format and try again.");
    }
  };

  const handlePreview = async (otifFile: OTIFFile) => {
    setErrorMessage(null);
    const rawFile = rawFilesRef.current.get(otifFile.id);
    if (!rawFile) {
      setErrorMessage("Unable to find the original file for preview. Please re-upload the dataset.");
      return;
    }
    const parsed = await parseCSV(rawFile);
    if (!parsed || parsed.length === 0) {
      setErrorMessage("The selected file could not be parsed. Ensure it is a valid OTIF CSV with at least one data row.");
      return;
    }
    setPreviewFile(otifFile);
  };

  const handleLoadToDashboard = async (otifFile: OTIFFile) => {
    setErrorMessage(null);
    const rawFile = rawFilesRef.current.get(otifFile.id);
    if (!rawFile) {
      setErrorMessage("Unable to find the original file. Please re-upload the dataset before loading it to the dashboard.");
      return;
    }
    const parsed = await parseCSV(rawFile);
    if (!parsed || parsed.length === 0) {
      setErrorMessage("No valid records were found in this file. Please confirm the OTIF export format and try again.");
      return;
    }
    const rawHeaders = parsed[0] ? Object.keys(parsed[0].rawData) : [];
    setDashboardData(parsed, otifFile.filename, rawHeaders);
    navigate("/dashboard");
  };

  const handleDelete = (otifFile: OTIFFile) => {
    rawFilesRef.current.delete(otifFile.id);
    deleteFile(otifFile.id);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="text-2xl font-bold text-foreground">Document Repository</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Upload, manage, and preview your OTIF CSV data files
        </p>

        <FileUploadZone onFileSelect={handleUpload} disabled={loading || previewLoading} isLoading={loading || previewLoading} />

        {(loading || previewLoading) && (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        )}

        {errorMessage && (
          <p className="mt-4 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <div className="mt-8 space-y-3">
          {files.length === 0 && !loading && !previewLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">No files uploaded yet</p>
          )}
          {files.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              onPreview={handlePreview}
              onLoadToDashboard={handleLoadToDashboard}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      {previewFile && records.length > 0 && (
        <CSVPreviewModal
          filename={previewFile.filename}
          records={records}
          fileSize={previewFile.fileSize}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </AppLayout>
  );
}
