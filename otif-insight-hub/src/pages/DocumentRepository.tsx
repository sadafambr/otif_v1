import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { FileUploadZone } from "@/components/FileUploadZone";
import { FileCard } from "@/components/FileCard";
import { CSVPreviewModal } from "@/components/CSVPreviewModal";
import { useFiles, useCSVPreview } from "@/hooks/useOTIF";
import { useNavigate } from "react-router-dom";
import { setDashboardData } from "@/lib/dataStore";
import { enrichOrders } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { OTIFFile } from "@/types/otif";

export default function DocumentRepository() {
  const { files, loading, uploadFile, deleteFile } = useFiles();
  const { records, loading: previewLoading, parseCSV } = useCSVPreview();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [previewFile, setPreviewFile] = useState<OTIFFile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
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

    // --- Skip automatic enrichment (prioritize CSV data) ---
    /*
    setEnriching(true);
    try {
      const enriched = await enrichOrders(rawFile, token || undefined);
      // Merge enriched data back into parsed records by row index
      for (const eRow of enriched.rows) {
        const idx = eRow.rowIndex;
        if (idx >= 0 && idx < parsed.length) {
          parsed[idx].probHit = eRow.probHit;
          parsed[idx].probMiss = eRow.probMiss;
          parsed[idx].riskScore = eRow.riskScore;
          parsed[idx].status = eRow.prediction;
          parsed[idx].top1Feature = eRow.top1Feature ?? undefined;
          parsed[idx].top1Value = eRow.top1Value ?? undefined;
          parsed[idx].top1Shap = eRow.top1Shap ?? undefined;
          parsed[idx].top2Feature = eRow.top2Feature ?? undefined;
          parsed[idx].top2Value = eRow.top2Value ?? undefined;
          parsed[idx].top2Shap = eRow.top2Shap ?? undefined;
          parsed[idx].top3Feature = eRow.top3Feature ?? undefined;
          parsed[idx].top3Value = eRow.top3Value ?? undefined;
          parsed[idx].top3Shap = eRow.top3Shap ?? undefined;
          // Build risk signals from SHAP features
          const signals = [eRow.top1Feature, eRow.top2Feature, eRow.top3Feature].filter(Boolean);
          parsed[idx].riskSignals = signals.length > 0 ? signals.join("; ") : undefined;
        }
      }
    } catch (err) {
      console.warn("Model enrichment unavailable, using client-side defaults:", err);
      // Continue with un-enriched data — dashboard still works
    } finally {
      setEnriching(false);
    }
    */

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

        <FileUploadZone onFileSelect={handleUpload} disabled={loading || previewLoading || enriching} isLoading={loading || previewLoading || enriching} />

        {(loading || previewLoading || enriching) && (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        )}

        {enriching && (
          <p className="mt-2 text-sm text-primary">Running model predictions & SHAP analysis…</p>
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
