"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { importAttendees, importCoupons } from "./actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttendeeImportResult, CouponImportResult } from "@/lib/types";
import { EventSectionNav } from "../event-section-nav";

type Props = { params: Promise<{ slug: string }> };

export default function ImportPage({ params: paramsPromise }: Props) {
  const [slug, setSlug] = useState<string>("");

  // Resolve params once on mount
  useState(() => {
    paramsPromise.then((p) => {
      setSlug(p.slug);
    });
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/events/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import Data</h1>
          <p className="text-sm text-muted-foreground">
            Upload attendees from Luma or add coupon links
          </p>
        </div>
      </div>

      <EventSectionNav slug={slug} active="import" />

      <Tabs defaultValue="attendees">
        <TabsList className="w-full">
          <TabsTrigger value="attendees" className="flex-1">
            Attendees (Luma CSV)
          </TabsTrigger>
          <TabsTrigger value="coupons" className="flex-1">
            Coupons
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendees">
          <AttendeeImportForm slug={slug} />
        </TabsContent>
        <TabsContent value="coupons">
          <CouponImportForm slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttendeeImportForm({ slug }: { slug: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [checkedInOnly, setCheckedInOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AttendeeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !slug) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const res = await importAttendees(slug, text, checkedInOnly);
      setResult(res);
      toast.success(`Imported ${res.imported} attendee${res.imported !== 1 ? "s" : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle className="text-base">Import Attendees from Luma</CardTitle>
        <CardDescription>
          Upload the CSV exported from Luma. Columns like{" "}
          <code className="text-xs bg-muted px-1 rounded">name</code>,{" "}
          <code className="text-xs bg-muted px-1 rounded">email</code>, and{" "}
          <code className="text-xs bg-muted px-1 rounded">checked_in_at</code>{" "}
          are detected automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="attendee-file">Luma CSV File</Label>
            <div className="mt-1.5 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                id="attendee-file"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="attendee-file" className="cursor-pointer">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                {file ? (
                  <p className="text-sm font-medium">{file.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click to select CSV or drag & drop
                  </p>
                )}
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <Label
                htmlFor="checked-in-toggle"
                className="text-sm cursor-pointer"
              >
                Only import checked-in attendees
              </Label>
              <p className="text-xs text-muted-foreground">
                Toggle OFF to import all attendees (useful for testing)
              </p>
            </div>
            <Switch
              id="checked-in-toggle"
              checked={checkedInOnly}
              onCheckedChange={setCheckedInOnly}
            />
          </div>

          <Button type="submit" disabled={!file || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import Attendees
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
          <ImportResultCard
            items={[
              { label: "Imported", value: result.imported, variant: "success" },
              { label: "Skipped (already exists)", value: result.skipped, variant: "secondary" },
              { label: "Invalid rows", value: result.invalid, variant: result.invalid > 0 ? "warning" : "secondary" },
              { label: "Auto-assigned coupons", value: result.assigned, variant: result.assigned > 0 ? "success" : "secondary" },
              { label: "Waiting for coupon", value: result.waitingForCoupon, variant: result.waitingForCoupon > 0 ? "warning" : "secondary" },
            ]}
            errors={result.errors}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CouponImportForm({ slug }: { slug: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CouponImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !slug) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const res = await importCoupons(slug, text);
      setResult(res);
      toast.success(`Imported ${res.imported} coupon${res.imported !== 1 ? "s" : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle className="text-base">Import Coupon Links</CardTitle>
        <CardDescription>
          Upload a plain text file or CSV with one coupon URL per line. Example:{" "}
          <code className="text-xs bg-muted px-1 rounded">
            https://cursor.com/referral?code=ABC
          </code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="coupon-file">Coupon File (.csv or .txt)</Label>
            <div className="mt-1.5 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                id="coupon-file"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="coupon-file" className="cursor-pointer">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                {file ? (
                  <p className="text-sm font-medium">{file.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click to select file or drag & drop
                  </p>
                )}
              </label>
            </div>
          </div>

          <Button type="submit" disabled={!file || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import Coupons
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
          <ImportResultCard
            items={[
              { label: "Imported", value: result.imported, variant: "success" },
              { label: "Duplicates skipped", value: result.duplicatesSkipped, variant: "secondary" },
              { label: "Invalid skipped", value: result.invalidSkipped, variant: result.invalidSkipped > 0 ? "warning" : "secondary" },
              { label: "Auto-assigned to attendees", value: result.autoAssigned, variant: result.autoAssigned > 0 ? "success" : "secondary" },
            ]}
            errors={result.errors}
          />
        )}
      </CardContent>
    </Card>
  );
}

type BadgeVariant = "success" | "secondary" | "warning" | "destructive" | "default";

function ImportResultCard({
  items,
  errors,
}: {
  items: { label: string; value: number; variant: BadgeVariant }[];
  errors: string[];
}) {
  return (
    <div className="mt-4 rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Import Complete
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ label, value, variant }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <Badge variant={variant}>{value}</Badge>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
          <p className="font-medium text-foreground">Row errors:</p>
          {errors.slice(0, 20).map((e, i) => (
            <p key={i} className="text-destructive">
              {e}
            </p>
          ))}
          {errors.length > 20 && (
            <p>…and {errors.length - 20} more</p>
          )}
        </div>
      )}
    </div>
  );
}
