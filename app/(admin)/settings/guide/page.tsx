import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  KeyRound,
  Mail,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {number}
      </span>
      <div className="min-w-0 space-y-1.5 pt-0.5">
        <p className="text-sm font-medium leading-snug">{title}</p>
        <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
          {children}
        </div>
      </div>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

export default function SettingsGuidePage() {
  return (
    <div className="w-full max-w-full space-y-6">
      <div className="space-y-4 max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
        </Button>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Setup guide
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Follow these steps to connect Luma and EmailJS. No coding
              required — copy values from each site and paste them into{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Settings
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="#luma">
              <KeyRound className="h-3.5 w-3.5" />
              Luma API
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="#emailjs">
              <Mail className="h-3.5 w-3.5" />
              EmailJS
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      {/* ── Luma ─────────────────────────────────────────────────────────── */}
      <Card id="luma" className="scroll-mt-6 h-full min-w-0">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Luma API</CardTitle>
              <CardDescription>
                Lets EventClaim sync guests from your Luma event into Attendees.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>Luma Plus is required.</strong> API access only works on a{" "}
              <strong>City Calendar</strong> with an active Luma Plus
              subscription. Personal calendars and free plans cannot use the
              API.
            </p>
          </div>

          <ol className="space-y-5">
            <Step number={1} title="Sign in to Luma">
              <p>
                Open{" "}
                <a
                  href="https://luma.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 text-foreground"
                >
                  luma.com
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and sign in with the account that manages your City Calendar.
              </p>
            </Step>

            <Step number={2} title="Open your City Calendar">
              <p>
                Go to{" "}
                <a
                  href="https://luma.com/home/calendars"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 text-foreground"
                >
                  Calendars Home
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and select your <strong>City Calendar</strong> — not a personal
                calendar. API keys belong to one calendar only, and Plus must be
                on that calendar.
              </p>
            </Step>

            <Step number={3} title="Confirm Luma Plus is active">
              <p>
                On that City Calendar, make sure{" "}
                <a
                  href="https://luma.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 text-foreground"
                >
                  Luma Plus
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                is subscribed. Without Plus, the API key page will say access is
                unavailable and the key will not work.
              </p>
            </Step>

            <Step number={4} title="Open Developer / API Keys">
              <p>
                Still on the City Calendar, open{" "}
                <strong>Settings → Developer</strong>. Or go directly to{" "}
                <a
                  href="https://luma.com/calendar/manage/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 text-foreground"
                >
                  Manage API Keys
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and choose the same City Calendar.
              </p>
            </Step>

            <Step number={5} title="Copy your API key">
              <p>
                In <strong>API Keys</strong>, create a key if needed, then copy
                it. It usually looks like <Code>secret-…</Code>. This key only
                works for events managed by that City Calendar.
              </p>
            </Step>

            <Step number={6} title="Paste into EventClaim Settings">
              <p>
                Open{" "}
                <Link
                  href="/settings"
                  className="underline underline-offset-2 text-foreground"
                >
                  Settings
                </Link>{" "}
                in this app, paste the key into <strong>Luma API Key</strong>,
                then click <strong>Save Settings</strong>. The footer should show
                “Luma: configured”.
              </p>
            </Step>

            <Step number={7} title="(Later) Find your Luma Event ID">
              <p>
                When you sync guests on an event’s Attendees page, you’ll also
                need the <strong>Luma Event ID</strong>. It starts with{" "}
                <Code>evt-</Code> and appears in the Luma event URL or event
                dashboard. Enter it in <strong>Fetch from Luma</strong> on that
                event — not on the Settings page.
              </p>
            </Step>
          </ol>
        </CardContent>
      </Card>

      {/* ── EmailJS ──────────────────────────────────────────────────────── */}
      <Card id="emailjs" className="scroll-mt-6 h-full min-w-0">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">EmailJS</CardTitle>
              <CardDescription>
                Lets EventClaim send claim emails to attendees.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              EventClaim already builds the full claim-email design. In EmailJS
              you only create a thin wrapper template with the{" "}
              <strong className="text-foreground">exact settings below</strong>{" "}
              so that dynamic email shows correctly.
            </p>
          </div>

          <ol className="space-y-5">
            <Step number={1} title="Create or sign in to EmailJS">
              <p>
                Open{" "}
                <a
                  href="https://www.emailjs.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 text-foreground"
                >
                  emailjs.com
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and sign in (or create a free account).
              </p>
            </Step>

            <Step number={2} title="Add an Email Service">
              <p>
                In the EmailJS dashboard, add an <strong>Email Service</strong>{" "}
                (Gmail, Outlook, or another provider).{" "}
                <strong className="text-foreground">
                  Connect the account from which the emails will actually be
                  sent
                </strong>{" "}
                — that address becomes the From address attendees see.
              </p>
              <p>
                After connecting, copy the <strong>Service ID</strong> (looks
                like <Code>service_…</Code>).
              </p>
            </Step>

            <Step number={3} title="Create the Email Template (exact settings)">
              <p>
                In the EmailJS dashboard, go to{" "}
                <strong>Email Templates → Create New Template</strong>. From the
                list of templates, select the default one{" "}
                <strong>&ldquo;Contact Us&rdquo;</strong> and click{" "}
                <strong>Create Template</strong>.
              </p>
              <p>
                EventClaim already created the email content in the portal —
                edit this template to use these <strong>exact</strong> settings
                so the dynamic template is visible:
              </p>
              <div className="rounded-lg border bg-background p-3 space-y-2 text-xs">
                <p>
                  <span className="font-medium text-foreground">To email:</span>{" "}
                  <Code>{"{{to_email}}"}</Code>
                </p>
                <p>
                  <span className="font-medium text-foreground">Subject:</span>{" "}
                  <Code>{"{{subject}}"}</Code>
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Content / body:
                  </span>{" "}
                  only{" "}
                  <Code>{"{{{message_html}}}"}</Code>
                </p>
                <p className="text-muted-foreground pt-1">
                  Use <strong className="text-foreground">three</strong> curly
                  braces around <Code>message_html</Code>. Two braces will show
                  raw HTML as plain text instead of the designed email. Do not
                  invent a custom layout in EmailJS — EventClaim owns the email
                  design.
                </p>
              </div>
            </Step>

            <Step number={4} title="Copy the Template ID">
              <p>
                While editing the template, click the <strong>Settings</strong>{" "}
                menu from the <strong>same row where Content is selected</strong>
                . From there you can see the <strong>Template ID</strong> —
                copy that one (looks like <Code>template_…</Code>).
              </p>
            </Step>

            <Step number={5} title="Copy Public and Private keys">
              <p>
                Open your EmailJS account <strong>API Keys</strong> (often under
                Account). Copy both:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Public Key</strong> (sometimes labeled User ID — looks
                  like <Code>user_…</Code> or similar)
                </li>
                <li>
                  <strong>Private Key</strong> (Access Token)
                </li>
              </ul>
            </Step>

            <Step number={6} title="Paste everything into EventClaim Settings">
              <p>
                Open{" "}
                <Link
                  href="/settings"
                  className="underline underline-offset-2 text-foreground"
                >
                  Settings
                </Link>{" "}
                and fill in Service ID, Template ID, Public Key, and Private Key.
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Monthly Send Quota</strong> — set to your EmailJS plan
                  limit (default 200).
                </li>
                <li>
                  <strong>Used Baseline</strong> — leave at <Code>0</Code> unless
                  you already sent emails outside this app this month.
                </li>
              </ul>
            </Step>

            <Step number={7} title="App Base URL (optional)">
              <p>
                Only fill this if claim links in emails should use a different
                domain than the browser you’re using now (for example your
                production URL). Otherwise leave it blank.
              </p>
            </Step>

            <Step number={8} title="Save and confirm">
              <p>
                Click <strong>Save Settings</strong>. The footer should show
                “EmailJS: configured”.
              </p>
            </Step>
          </ol>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              If emails fail, check these first
            </p>
            <ul className="text-xs text-amber-900/90 list-disc pl-5 space-y-1 leading-relaxed">
              <li>
                Content is exactly <Code>{"{{{message_html}}}"}</Code> (three
                braces), not two.
              </li>
              <li>Private Key (Access Token) is pasted correctly.</li>
              <li>
                You connected the sending email account on the Email Service
                step.
              </li>
              <li>Monthly quota is not used up.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      </div>

      <div className="pb-8">
        <Button asChild>
          <Link href="/settings">Done — go to Settings</Link>
        </Button>
      </div>
    </div>
  );
}
