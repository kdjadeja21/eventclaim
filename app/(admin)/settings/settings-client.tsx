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
import { Separator } from "@/components/ui/separator";
import { AppSettings } from "@/lib/settings";
import { useAppSettings } from "@/lib/use-app-settings";

export default function SettingsClient() {
  const { loading } = useAppSettings();

  // Rendered only once settings have finished loading from localStorage, so
  // the form's initial state is correct on first mount — no effect needed to
  // re-sync it afterwards.
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SettingsForm />;
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

  async function handleSave() {
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
    toast.success("Local settings cleared");
  }

  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-start gap-3">
        <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          These values are encrypted and stored <strong>only in this browser&apos;s
          localStorage</strong> — they are never sent to or stored on a server, and no
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">.env</code>
          file is used. They won&apos;t sync to other browsers or devices, and
          clearing your browser data will remove them.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowSecrets((v) => !v)}
        >
          {showSecrets ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {showSecrets ? "Hide values" : "Show values"}
        </Button>
      </div>

      {/* Luma */}
      <Card data-tour="settings-luma">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base">Luma API</CardTitle>
                <CardDescription>
                  Used to sync guests from a Luma event into Attendees.
                </CardDescription>
              </div>
            </div>
            <Link
              href="/settings/guide#luma"
              target="_blank"
              rel="noopener noreferrer"
              data-tour="settings-guide-luma"
              className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-primary hover:underline underline-offset-2"
            >
              Setup guide
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="luma-api-key">Luma API Key</Label>
            <Input
              id="luma-api-key"
              type={showSecrets ? "text" : "password"}
              autoComplete="off"
              placeholder="secret-xxxxxxxxxxxxxxxx"
              value={draft.lumaApiKey}
              onChange={(e) => set("lumaApiKey", e.target.value.trim())}
            />
            <p className="text-xs text-muted-foreground">
              From your Luma <strong>City Calendar</strong> with Luma Plus:
              Settings &rarr; Developer &rarr; API Keys.{" "}
              <Link
                href="/settings/guide#luma"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Setup guide
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* EmailJS */}
      <Card data-tour="settings-emailjs">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base">EmailJS</CardTitle>
                <CardDescription>
                  Used to send claim emails to attendees.
                </CardDescription>
              </div>
            </div>
            <Link
              href="/settings/guide#emailjs"
              target="_blank"
              rel="noopener noreferrer"
              data-tour="settings-guide-emailjs"
              className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-primary hover:underline underline-offset-2"
            >
              Setup guide
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emailjs-service-id">Service ID</Label>
              <Input
                id="emailjs-service-id"
                autoComplete="off"
                placeholder="service_xxxxxxx"
                value={draft.emailjsServiceId}
                onChange={(e) => set("emailjsServiceId", e.target.value.trim())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emailjs-template-id">Template ID</Label>
              <Input
                id="emailjs-template-id"
                autoComplete="off"
                placeholder="template_xxxxxxx"
                value={draft.emailjsTemplateId}
                onChange={(e) => set("emailjsTemplateId", e.target.value.trim())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emailjs-public-key">Public Key</Label>
              <Input
                id="emailjs-public-key"
                type={showSecrets ? "text" : "password"}
                autoComplete="off"
                placeholder="user_xxxxxxxxxxxxxxxx"
                value={draft.emailjsPublicKey}
                onChange={(e) => set("emailjsPublicKey", e.target.value.trim())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emailjs-private-key">Private Key</Label>
              <Input
                id="emailjs-private-key"
                type={showSecrets ? "text" : "password"}
                autoComplete="off"
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                value={draft.emailjsPrivateKey}
                onChange={(e) => set("emailjsPrivateKey", e.target.value.trim())}
              />
            </div>
          </div>

          <Separator className="my-2" />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emailjs-quota">Monthly Send Quota</Label>
              <Input
                id="emailjs-quota"
                type="number"
                min={0}
                value={draft.emailjsMonthlyQuota}
                onChange={(e) =>
                  set("emailjsMonthlyQuota", Math.max(0, Number(e.target.value) || 0))
                }
              />
              <p className="text-xs text-muted-foreground">
                Matches your EmailJS plan&apos;s monthly email limit.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emailjs-used-baseline">Used Baseline</Label>
              <Input
                id="emailjs-used-baseline"
                type="number"
                min={0}
                value={draft.emailjsMonthlyUsedBaseline}
                onChange={(e) =>
                  set(
                    "emailjsMonthlyUsedBaseline",
                    Math.max(0, Number(e.target.value) || 0)
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Sends already used this month outside this app, if any.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-base-url">App Base URL (optional)</Label>
            <Input
              id="app-base-url"
              autoComplete="off"
              placeholder="https://your-app.example.com"
              value={draft.appBaseUrl}
              onChange={(e) => set("appBaseUrl", e.target.value.trim())}
            />
            <p className="text-xs text-muted-foreground">
              Used to build claim links in emails. Defaults to this browser&apos;s
              current origin when left blank.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>
            Luma: {lumaConfigured ? "configured" : "not configured"} &middot; EmailJS:{" "}
            {emailConfigured ? "configured" : "not configured"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={saving}
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
