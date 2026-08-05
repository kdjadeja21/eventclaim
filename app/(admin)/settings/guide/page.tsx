"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  KeyRound,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function StepItem({
  number,
  title,
  isLast = false,
  children,
}: {
  number: number;
  title: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex gap-4">
      {!isLast && (
        <span
          className="absolute left-4 top-9 -bottom-5 w-0.5 bg-border"
          aria-hidden="true"
        />
      )}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-sm ring-4 ring-background z-10">
        {number}
      </div>
      <div className="min-w-0 flex-1 space-y-2 pb-6">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <div className="text-sm text-muted-foreground leading-relaxed space-y-2.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground font-medium">
      {children}
    </code>
  );
}

function getInitialTab(): "luma" | "emailjs" {
  if (typeof window === "undefined") return "luma";
  const hash = window.location.hash.replace("#", "");
  return hash === "emailjs" ? "emailjs" : "luma";
}

export default function SettingsGuidePage() {
  const [activeTab, setActiveTab] = useState<"luma" | "emailjs">(getInitialTab);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Top Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shrink-0">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Integration Setup Guide
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Clear step-by-step instructions to quickly configure Luma API and EmailJS for EventClaim.
              </p>
            </div>
          </div>

          <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
            <Link href="/settings">
              Go to Settings
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Tabbed Interface */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          const next = val as "luma" | "emailjs";
          setActiveTab(next);
          window.history.replaceState(null, "", `#${next}`);
        }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="grid grid-cols-2 w-full sm:w-auto h-11 p-1 bg-muted/80 rounded-xl">
            <TabsTrigger
              value="luma"
              className="gap-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm px-5"
            >
              <KeyRound className="h-4 w-4" />
              Luma API Guide
            </TabsTrigger>
            <TabsTrigger
              value="emailjs"
              className="gap-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm px-5"
            >
              <Mail className="h-4 w-4" />
              EmailJS Guide
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-muted-foreground">
            Takes ~2-3 minutes per service &middot; No code required
          </span>
        </div>

        {/* ── LUMA TAB ──────────────────────────────────────────────────────── */}
        <TabsContent value="luma" className="space-y-6 outline-none">
          <Card className="border shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">1. Connect Luma API Key</CardTitle>
                    <CardDescription>
                      Required to automatically fetch and sync guests from your Luma events.
                    </CardDescription>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
                  <Sparkles className="h-3.5 w-3.5" /> Luma Sync
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-8">
              {/* Alert Callout */}
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800/50 p-4 flex items-start gap-3.5 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950 dark:text-amber-100">
                    Important Luma Prerequisite:
                  </p>
                  <p className="leading-relaxed">
                    Luma API access requires a <strong>City Calendar</strong> with an active <strong>Luma Plus</strong> subscription. Personal calendars or free plans do not have API access enabled by Luma.
                  </p>
                </div>
              </div>

              {/* Timeline Steps */}
              <div className="pt-2">
                <StepItem number={1} title="Sign in to your Luma Account">
                  <p>
                    Go to{" "}
                    <a
                      href="https://luma.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      luma.com
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    and log in with the account that manages your community events.
                  </p>
                </StepItem>

                <StepItem number={2} title="Select your City Calendar">
                  <p>
                    Navigate to{" "}
                    <a
                      href="https://luma.com/home/calendars"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Calendars Home
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    and select your <strong>City Calendar</strong>. Ensure you do not pick a personal calendar, as API keys are scoped directly per calendar.
                  </p>
                </StepItem>

                <StepItem number={3} title="Verify Luma Plus Status">
                  <p>
                    Check that your selected City Calendar has an active{" "}
                    <a
                      href="https://luma.com/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Luma Plus
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    membership. If Plus is inactive, Luma will disable API key generation.
                  </p>
                </StepItem>

                <StepItem number={4} title="Open Developer Settings & Generate Key">
                  <p>
                    Under your City Calendar settings, go to <strong>Settings &rarr; Developer</strong> or directly open{" "}
                    <a
                      href="https://luma.com/calendar/manage/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Manage API Keys
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    . Click to create or reveal your API key (formatted like <Code>secret-…</Code>).
                  </p>
                </StepItem>

                <StepItem number={5} title="Paste Key into EventClaim Settings">
                  <p>
                    Copy the key, return to{" "}
                    <Link href="/settings" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                      Settings
                    </Link>{" "}
                    in this app, paste it into <strong>Luma API Key</strong>, and click <strong>Save Settings</strong>.
                  </p>
                </StepItem>

                <StepItem number={6} title="Pro Tip: Locating your Luma Event ID" isLast>
                  <p>
                    When syncing attendees on a specific event page, you will also be prompted for a <strong>Luma Event ID</strong> (starts with <Code>evt-…</Code>). You can copy this directly from your Luma event URL bar or event dashboard.
                  </p>
                </StepItem>
              </div>

              <div className="pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Need to configure EmailJS next?
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveTab("emailjs");
                    window.history.replaceState(null, "", "#emailjs");
                  }}
                  className="gap-2"
                >
                  Continue to EmailJS Guide
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EMAILJS TAB ───────────────────────────────────────────────────── */}
        <TabsContent value="emailjs" className="space-y-6 outline-none">
          <Card className="border shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">2. Configure EmailJS Transactional Service</CardTitle>
                    <CardDescription>
                      Required to send instant claim links and dynamic coupon emails to attendees.
                    </CardDescription>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" /> HTML Delivery
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-8">
              {/* Info Header Banner */}
              <div className="rounded-xl border bg-muted/40 p-4 flex items-start gap-3.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="leading-relaxed">
                  EventClaim automatically handles all rich email design and HTML generation. In EmailJS, you only need to setup a basic wrapper template matching the exact variable names shown below.
                </p>
              </div>

              {/* Steps */}
              <div className="pt-2">
                <StepItem number={1} title="Sign in to EmailJS">
                  <p>
                    Open{" "}
                    <a
                      href="https://www.emailjs.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    >
                      emailjs.com
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    and log in to your dashboard (or create a free account).
                  </p>
                </StepItem>

                <StepItem number={2} title="Connect an Email Service">
                  <p>
                    Go to <strong>Email Services &rarr; Add New Service</strong> (e.g. Gmail or Outlook). Connect the exact email account from which you want attendees to receive emails. Copy the generated <strong>Service ID</strong> (looks like <Code>service_…</Code>).
                  </p>
                </StepItem>

                <StepItem number={3} title="Create Template from 'Contact Us' Starter">
                  <p>
                    Click <strong>Email Templates &rarr; Create New Template</strong>. From the available starter templates list, select <strong>&ldquo;Contact Us&rdquo;</strong> and click <strong>Create Template</strong>.
                  </p>
                  <p className="pt-1">
                    Edit the template fields to match these <strong>exact variable names</strong>:
                  </p>

                  <div className="mt-3 rounded-xl border bg-card p-4 space-y-2.5 text-xs shadow-xs">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-semibold text-foreground">Setting Field</span>
                      <span className="font-semibold text-foreground">Exact Variable / Value</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-0.5">
                      <span className="text-muted-foreground font-medium">To Email</span>
                      <span className="sm:col-span-2"><Code>{"{{to_email}}"}</Code></span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-0.5">
                      <span className="text-muted-foreground font-medium">Subject</span>
                      <span className="sm:col-span-2"><Code>{"{{subject}}"}</Code></span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-0.5">
                      <span className="text-muted-foreground font-medium">Content / Body</span>
                      <span className="sm:col-span-2"><Code>{"{{{message_html}}}"}</Code></span>
                    </div>

                    <div className="pt-2 border-t text-muted-foreground leading-relaxed">
                      ⚠️ <strong>Crucial:</strong> Use <strong>three curly braces</strong> <Code>{"{{{message_html}}}"}</Code> for the content body. Two braces will output raw unformatted HTML code to attendees instead of rendering the styled email card.
                    </div>
                  </div>
                </StepItem>

                <StepItem number={4} title="Locate & Copy Template ID">
                  <p>
                    While editing your template, click the <strong>Settings</strong> tab located on the <strong>same row as the Content editor tab</strong>. Copy the <strong>Template ID</strong> displayed there (looks like <Code>template_…</Code>).
                  </p>
                </StepItem>

                <StepItem number={5} title="Copy Account API Keys">
                  <p>
                    Navigate to your EmailJS Account <strong>API Keys</strong> section. Copy both your <strong>Public Key</strong> (User ID) and <strong>Private Key</strong> (Access Token).
                  </p>
                </StepItem>

                <StepItem number={6} title="Save in EventClaim Settings" isLast>
                  <p>
                    Return to{" "}
                    <Link href="/settings" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                      Settings
                    </Link>{" "}
                    and fill in Service ID, Template ID, Public Key, and Private Key. Adjust your <strong>Monthly Send Quota</strong> (e.g. 200 for free plan) and click <strong>Save Settings</strong>.
                  </p>
                </StepItem>
              </div>

              {/* Troubleshooting Box */}
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800/50 p-4 space-y-2 text-xs">
                <p className="font-semibold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Quick Troubleshooting Checklist
                </p>
                <ul className="list-disc pl-5 text-amber-900/90 dark:text-amber-200/90 space-y-1 leading-relaxed">
                  <li>Verify template body uses triple braces <Code>{"{{{message_html}}}"}</Code>.</li>
                  <li>Ensure Private Key (Access Token) is copied without trailing spaces.</li>
                  <li>Check that your connected email service is active in EmailJS.</li>
                </ul>
              </div>

              <div className="pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
                <Button asChild size="default">
                  <Link href="/settings">
                    All Done &mdash; Return to Settings
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
