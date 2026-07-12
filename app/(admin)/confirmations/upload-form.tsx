"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { uploadConfirmationAttendees } from "./upload-actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmationImportResult } from "@/lib/confirmation/types";

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConfirmationImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const res = await uploadConfirmationAttendees(text, { onlyApproved });
      setResult(res);
      toast.success(
        `Imported ${res.imported} attendee${res.imported !== 1 ? "s" : ""}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload Attendees</CardTitle>
        <CardDescription>
          Upload a CSV of approved attendees. Requires a{" "}
          <code className="text-xs bg-muted px-1 rounded">name</code> (or{" "}
          <code className="text-xs bg-muted px-1 rounded">first_name</code>/
          <code className="text-xs bg-muted px-1 rounded">last_name</code>) and{" "}
          <code className="text-xs bg-muted px-1 rounded">email</code> column.
          Everything else (phone, survey answers, team info) is kept for the
          attendee detail view. Re-uploads are idempotent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="confirmation-file">Attendees CSV File</Label>
            <div className="mt-1.5 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                id="confirmation-file"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="confirmation-file" className="cursor-pointer">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                {file ? (
                  <p className="text-sm font-medium">{file.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click to select CSV or drag &amp; drop
                  </p>
                )}
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <Label htmlFor="approved-toggle" className="text-sm cursor-pointer">
                Only import rows with approval_status = approved
              </Label>
              <p className="text-xs text-muted-foreground">
                Toggle OFF to import every row regardless of approval status
              </p>
            </div>
            <Switch
              id="approved-toggle"
              checked={onlyApproved}
              onCheckedChange={setOnlyApproved}
            />
          </div>

          <Button type="submit" disabled={!file || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Attendees
              </>
            )}
          </Button>
        </form>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Upload Complete
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ResultRow label="Imported" value={result.imported} variant="success" />
              <ResultRow label="Skipped" value={result.skipped} variant="secondary" />
              <ResultRow
                label="Invalid rows"
                value={result.invalid}
                variant={result.invalid > 0 ? "warning" : "secondary"}
              />
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                <p className="font-medium text-foreground">Row errors:</p>
                {result.errors.slice(0, 20).map((e, i) => (
                  <p key={i} className="text-destructive">
                    {e}
                  </p>
                ))}
                {result.errors.length > 20 && (
                  <p>…and {result.errors.length - 20} more</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "secondary" | "warning";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}
