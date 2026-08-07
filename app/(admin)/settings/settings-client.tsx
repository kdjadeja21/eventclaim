"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  Lock,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  isSettingsDraftValid,
  validateSettings,
} from "@/lib/settings";
import { useAppSettings } from "@/lib/use-app-settings";
import { cn } from "@/lib/utils";

export default function SettingsClient() {
  const { loading } = useAppSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SettingsForm />;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-[11px] leading-snug text-destructive" role="alert">
      {message}
    </p>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <CircleDashed className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

function SettingsForm() {
  const { settings, updateSettings, resetSettings, lumaConfigured, emailConfigured } =
    useAppSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const errors = validateSettings(draft);
  const draftValid = isSettingsDraftValid(draft);
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const canSave = hasUnsavedChanges && draftValid && !saving;

  async function handleSave() {
    if (!draftValid) {
      toast.error("Fix the highlighted fields before saving");
      return;
    }
    setSaving(true);
    try {
      await updateSettings(draft);
      toast.success("Settings saved locally (encrypted in this browser)");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    resetSettings();
    setDraft({ ...DEFAULT_SETTINGS });
    toast.success("Local settings cleared");
  }

  return (
    <div className="space-y-4">
      {/* Compact privacy + status toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-gradient-to-br from-primary/[0.04] via-background to-secondary/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
            <Lock className="h-3.5 w-3.5" />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Encrypted in this browser&apos;s{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              localStorage
            </code>{" "}
            only — never sent to a server. Clearing browser data removes them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusPill
            ok={lumaConfigured}
            label={lumaConfigured ? "Luma ready" : "Luma needed"}
          />
          <StatusPill
            ok={emailConfigured}
            label={emailConfigured ? "EmailJS ready" : "EmailJS needed"}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setShowSecrets((v) => !v)}
          >
            {showSecrets ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {showSecrets ? "Hide" : "Show"}
          </Button>
        </div>
      </div>

      {/* Side-by-side integrations on large screens */}
      <div
        data-demo-focus="settings-integrations"
        className="grid gap-4 lg:grid-cols-2 lg:items-start"
      >
        {/* Luma */}
        <Card className="overflow-hidden shadow-sm ring-1 ring-black/5">
          <CardHeader className="space-y-0 border-b bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold">Luma API</CardTitle>
                  <CardDescription className="text-xs">
                    Sync checked-in guests into Attendees.
                  </CardDescription>
                </div>
              </div>
              <Link
                href="/settings/guide#luma"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline underline-offset-2"
              >
                Guide
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            <div className="space-y-1">
              <Label htmlFor="luma-api-key" className="text-xs">
                API Key
              </Label>
              <Input
                id="luma-api-key"
                type={showSecrets ? "text" : "password"}
                autoComplete="off"
                placeholder="secret-xxxxxxxxxxxxxxxx"
                value={draft.lumaApiKey}
                aria-invalid={Boolean(errors.lumaApiKey)}
                className={cn("h-9", errors.lumaApiKey && "border-destructive")}
                onChange={(e) => set("lumaApiKey", e.target.value.trim())}
              />
              <FieldError message={errors.lumaApiKey} />
              {!errors.lumaApiKey ? (
                <p className="text-[11px] text-muted-foreground">
                  City Calendar → Settings → Developer → API Keys
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* EmailJS credentials */}
        <Card className="overflow-hidden shadow-sm ring-1 ring-black/5">
          <CardHeader className="space-y-0 border-b bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold">EmailJS</CardTitle>
                  <CardDescription className="text-xs">
                    Send claim emails to attendees.
                  </CardDescription>
                </div>
              </div>
              <Link
                href="/settings/guide#emailjs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline underline-offset-2"
              >
                Guide
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="emailjs-service-id" className="text-xs">
                  Service ID
                </Label>
                <Input
                  id="emailjs-service-id"
                  autoComplete="off"
                  placeholder="service_xxxxxxx"
                  value={draft.emailjsServiceId}
                  aria-invalid={Boolean(errors.emailjsServiceId)}
                  className={cn(
                    "h-9",
                    errors.emailjsServiceId && "border-destructive"
                  )}
                  onChange={(e) => set("emailjsServiceId", e.target.value.trim())}
                />
                <FieldError message={errors.emailjsServiceId} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailjs-template-id" className="text-xs">
                  Template ID
                </Label>
                <Input
                  id="emailjs-template-id"
                  autoComplete="off"
                  placeholder="template_xxxxxxx"
                  value={draft.emailjsTemplateId}
                  aria-invalid={Boolean(errors.emailjsTemplateId)}
                  className={cn(
                    "h-9",
                    errors.emailjsTemplateId && "border-destructive"
                  )}
                  onChange={(e) =>
                    set("emailjsTemplateId", e.target.value.trim())
                  }
                />
                <FieldError message={errors.emailjsTemplateId} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailjs-public-key" className="text-xs">
                  Public Key
                </Label>
                <Input
                  id="emailjs-public-key"
                  type={showSecrets ? "text" : "password"}
                  autoComplete="off"
                  placeholder="user_xxxxxxxxxxxxxxxx"
                  value={draft.emailjsPublicKey}
                  aria-invalid={Boolean(errors.emailjsPublicKey)}
                  className={cn(
                    "h-9",
                    errors.emailjsPublicKey && "border-destructive"
                  )}
                  onChange={(e) => set("emailjsPublicKey", e.target.value.trim())}
                />
                <FieldError message={errors.emailjsPublicKey} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailjs-private-key" className="text-xs">
                  Private Key
                </Label>
                <Input
                  id="emailjs-private-key"
                  type={showSecrets ? "text" : "password"}
                  autoComplete="off"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={draft.emailjsPrivateKey}
                  aria-invalid={Boolean(errors.emailjsPrivateKey)}
                  className={cn(
                    "h-9",
                    errors.emailjsPrivateKey && "border-destructive"
                  )}
                  onChange={(e) =>
                    set("emailjsPrivateKey", e.target.value.trim())
                  }
                />
                <FieldError message={errors.emailjsPrivateKey} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delivery options — full width, denser */}
      <Card className="overflow-hidden shadow-sm ring-1 ring-black/5">
        <CardHeader className="space-y-0 border-b bg-muted/30 p-4">
          <CardTitle className="text-sm font-semibold">Delivery options</CardTitle>
          <CardDescription className="text-xs">
            Quota tracking and claim-link base URL for emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="emailjs-quota" className="text-xs">
                Monthly send quota
              </Label>
              <Input
                id="emailjs-quota"
                type="number"
                min={1}
                step={1}
                value={draft.emailjsMonthlyQuota}
                aria-invalid={Boolean(errors.emailjsMonthlyQuota)}
                className={cn(
                  "h-9",
                  errors.emailjsMonthlyQuota && "border-destructive"
                )}
                onChange={(e) =>
                  set(
                    "emailjsMonthlyQuota",
                    e.target.value === "" ? 0 : Number(e.target.value)
                  )
                }
              />
              <FieldError message={errors.emailjsMonthlyQuota} />
              {!errors.emailjsMonthlyQuota ? (
                <p className="text-[11px] text-muted-foreground">
                  Matches your EmailJS plan limit.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="emailjs-used-baseline" className="text-xs">
                Used baseline
              </Label>
              <Input
                id="emailjs-used-baseline"
                type="number"
                min={0}
                step={1}
                value={draft.emailjsMonthlyUsedBaseline}
                aria-invalid={Boolean(errors.emailjsMonthlyUsedBaseline)}
                className={cn(
                  "h-9",
                  errors.emailjsMonthlyUsedBaseline && "border-destructive"
                )}
                onChange={(e) =>
                  set(
                    "emailjsMonthlyUsedBaseline",
                    e.target.value === "" ? 0 : Number(e.target.value)
                  )
                }
              />
              <FieldError message={errors.emailjsMonthlyUsedBaseline} />
              {!errors.emailjsMonthlyUsedBaseline ? (
                <p className="text-[11px] text-muted-foreground">
                  Sends already used outside this app.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="app-base-url" className="text-xs">
                App base URL{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="app-base-url"
                autoComplete="off"
                placeholder="https://your-app.example.com"
                value={draft.appBaseUrl}
                aria-invalid={Boolean(errors.appBaseUrl)}
                className={cn("h-9", errors.appBaseUrl && "border-destructive")}
                onChange={(e) => set("appBaseUrl", e.target.value.trim())}
              />
              <FieldError message={errors.appBaseUrl} />
              {!errors.appBaseUrl ? (
                <p className="text-[11px] text-muted-foreground">
                  Defaults to this origin for claim links.
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div
        data-demo-focus="settings-save-bar"
        className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>
            {hasUnsavedChanges ? (
              draftValid ? (
                <span className="text-amber-700">Unsaved changes</span>
              ) : (
                <span className="text-destructive">
                  Fix validation errors to save
                </span>
              )
            ) : (
              "All changes saved"
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}
