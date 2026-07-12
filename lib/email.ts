import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { Attendee, EmailLog } from "@/lib/types";
import { nanoid } from "nanoid";

const APP_BASE_URL =
  process.env.APP_BASE_URL || "http://localhost:3000";

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID!;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID!;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY!;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY!;
const EMAILJS_MONTHLY_QUOTA = Math.max(
  0,
  Number(process.env.EMAILJS_MONTHLY_QUOTA) || 200
);

// How many emails to send in parallel during bulk operations. Kept low to
// respect EmailJS rate limits while still being far faster than serial sends.
const SEND_CONCURRENCY = Math.max(
  1,
  Number(process.env.EMAIL_SEND_CONCURRENCY) || 5
);
// Max retry attempts for a single email on transient (429 / 5xx) failures.
const SEND_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fixed-size worker pool: runs `worker` over `items` with at most `limit`
// concurrent executions. Each item is processed exactly once.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const poolSize = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: poolSize }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

// POST to EmailJS with retry + backoff on rate limiting (429) and 5xx errors.
async function postEmailJs(body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(
      "https://api.emailjs.com/api/v1.0/email/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );

    const retryable = response.status === 429 || response.status >= 500;
    if (response.ok || !retryable || attempt >= SEND_MAX_RETRIES) {
      return response;
    }

    const retryAfterHeader = Number(response.headers.get("retry-after"));
    const backoffMs =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : Math.min(2000 * 2 ** attempt, 10_000);
    console.warn("[postEmailJs] retrying", {
      status: response.status,
      attempt: attempt + 1,
      backoffMs,
    });
    // Add jitter to avoid synchronized retries across concurrent sends.
    await sleep(backoffMs + Math.floor(Math.random() * 250));
  }
}

// ─── EmailJS quota (history API) ───────────────────────────────────────────────

export type EmailQuota = {
  limit: number;
  used: number;
  remaining: number;
  ok: boolean;
};

type EmailJsHistoryRow = { created_at: string };
type EmailJsHistoryResponse = {
  is_last_page: boolean;
  rows: EmailJsHistoryRow[];
};

const QUOTA_CACHE_TTL_MS = 60_000;
const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 50;

let quotaCache: { at: number; value: EmailQuota } | null = null;

function getCurrentMonthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function fetchEmailJsHistoryPage(
  page: number
): Promise<EmailJsHistoryResponse> {
  const params = new URLSearchParams({
    user_id: EMAILJS_PUBLIC_KEY,
    accessToken: EMAILJS_PRIVATE_KEY,
    page: String(page),
    count: String(HISTORY_PAGE_SIZE),
  });

  const response = await fetch(
    `https://api.emailjs.com/api/v1.1/history?${params}`,
    { method: "GET" }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`EmailJS history error ${response.status}: ${body}`);
  }

  return response.json() as Promise<EmailJsHistoryResponse>;
}

export function invalidateQuotaCache(): void {
  quotaCache = null;
}

export function adjustQuotaCache(delta: number): void {
  if (!quotaCache?.value.ok || delta === 0) return;
  const { limit } = quotaCache.value;
  const used = Math.max(0, quotaCache.value.used + delta);
  const remaining = Math.max(0, limit - used);
  quotaCache = {
    at: Date.now(),
    value: { limit, used, remaining, ok: true },
  };
}

export async function getEmailQuota(options?: {
  force?: boolean;
}): Promise<EmailQuota> {
  const limit = EMAILJS_MONTHLY_QUOTA;

  if (
    !options?.force &&
    quotaCache &&
    Date.now() - quotaCache.at < QUOTA_CACHE_TTL_MS
  ) {
    return quotaCache.value;
  }

  try {
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
      return { limit, used: 0, remaining: limit, ok: false };
    }

    const monthStart = getCurrentMonthStartUtc();
    let used = 0;
    let page = 1;
    let done = false;

    while (!done && page <= HISTORY_MAX_PAGES) {
      if (page > 1) {
        // History API is rate-limited to 1 request per second.
        await sleep(1100);
      }

      const data = await fetchEmailJsHistoryPage(page);
      const rows = data.rows ?? [];

      for (const row of rows) {
        const createdAt = new Date(row.created_at);
        if (createdAt >= monthStart) {
          used++;
        } else {
          done = true;
          break;
        }
      }

      if (data.is_last_page || rows.length === 0) {
        done = true;
      } else {
        page++;
      }
    }

    const remaining = Math.max(0, limit - used);
    const value: EmailQuota = { limit, used, remaining, ok: true };
    quotaCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[getEmailQuota] failed", err);
    return { limit, used: 0, remaining: limit, ok: false };
  }
}

// ─── Email Template ────────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  attendeeName: string;
  claimUrl: string;
  notionGuideUrl: string;
  eventName?: string;
}): string {
  const { attendeeName, claimUrl, notionGuideUrl, eventName } = params;
  const firstName = attendeeName.split(" ")[0] || attendeeName;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Partner Offers Are Ready</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#09090b;padding:24px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="https://www.cursor.com/favicon.ico"
                         alt="Cursor"
                         width="32"
                         height="32"
                         style="display:block;width:32px;height:32px;border-radius:6px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;">Cursor Community</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.02em;">
                Your Partner Offers Are Ready 🎉
              </h1>
              <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;">
                Thank you for attending${eventName ? ` <strong>${eventName}</strong>` : " our event"}. We're excited to share exclusive partner offers and credits as a thank-you for your participation.
              </p>
              <p style="margin:0 0 32px;font-size:16px;color:#52525b;line-height:1.6;">
                Click the button below to view and claim all your offers:
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background:#09090b;border-radius:8px;text-align:center;">
                    <a href="${claimUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.01em;">
                      View My Offers →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback plain-text link -->
              <p style="margin:0 0 32px;font-size:13px;color:#71717a;line-height:1.5;">
                If the button above doesn't work, copy and paste this link into your browser:<br />
                <a href="${claimUrl}" style="color:#09090b;word-break:break-all;">${claimUrl}</a>
              </p>

              <!-- Note -->
              <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0;font-size:14px;color:#71717a;line-height:1.5;">
                  <strong style="color:#09090b;">Note:</strong> This link is unique to you. Please don't share it.
                </p>
              </div>

              ${notionGuideUrl ? `
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
                Need help redeeming? Check out our step-by-step guide:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${notionGuideUrl}"
                   style="color:#09090b;font-weight:600;font-size:15px;">
                  How to Redeem Your Offers →
                </a>
              </p>
              ` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:13px;color:#a1a1aa;text-align:center;line-height:1.5;">
                Sent by Cursor Community &middot; This email was intended for ${attendeeName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send one email ────────────────────────────────────────────────────────────

export async function sendCouponEmail(
  attendee: Attendee,
  notionGuideUrl: string,
  isResend = false,
  eventName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!attendee.grantCount || attendee.grantCount < 1) {
    return { success: false, error: "No offers granted yet — cannot send email" };
  }
  if (!attendee.claimToken) {
    return { success: false, error: "No claim token — grants not assigned yet" };
  }

  const claimUrl = `${APP_BASE_URL}/claim/${attendee.claimToken}`;

  console.log("[sendCouponEmail] preparing send", {
    to: attendee.email,
    claimUrl,
    isResend,
  });

  try {
    const response = await postEmailJs(
      JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: attendee.email,
          to_name: attendee.name,
          subject: "Your Partner Offers Are Ready to Claim",
          message_html: buildEmailHtml({
            attendeeName: attendee.name,
            claimUrl,
            notionGuideUrl,
            eventName,
          }),
        },
      })
    );

    console.log("[sendCouponEmail] emailjs response", { status: response.status });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`EmailJS error ${response.status}: ${body}`);
    }

    // Persist email log
    const logId = nanoid();
    const now = new Date().toISOString();
    const log: EmailLog = {
      id: logId,
      attendeeId: attendee.id,
      eventId: attendee.eventId,
      emailType: isResend ? "resend" : "initial",
      sentAt: now,
      resendCount: 0,
      status: "sent",
    };
    await adminDb.collection("emailLogs").doc(logId).set(log);

    // Update attendee email status
    await adminDb
      .collection("events")
      .doc(attendee.eventId)
      .collection("attendees")
      .doc(attendee.id)
      .update({
        emailStatus: "sent",
        emailSentAt: now,
      });

    await writeAuditLog({
      eventId: attendee.eventId,
      action: isResend ? "email_resent" : "email_sent",
      metadata: { attendeeId: attendee.id, email: attendee.email },
    });

    adjustQuotaCache(1);

    console.log("[sendCouponEmail] success", { attendeeId: attendee.id, email: attendee.email });
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[sendCouponEmail] failed", {
      attendeeId: attendee.id,
      email: attendee.email,
      error: errorMsg,
    });

    // Update attendee email status to failed
    await adminDb
      .collection("events")
      .doc(attendee.eventId)
      .collection("attendees")
      .doc(attendee.id)
      .update({ emailStatus: "failed" });

    await writeAuditLog({
      eventId: attendee.eventId,
      action: "email_failed",
      metadata: { attendeeId: attendee.id, email: attendee.email, error: errorMsg },
    });

    return { success: false, error: errorMsg };
  }
}

// ─── Concurrent bulk send ────────────────────────────────────────────────────

export type AttendeeSendStatus = "sent" | "failed" | "skipped";

export interface BulkSendResult {
  sent: number;
  failed: number;
  skipped: number;
  results: { attendeeId: string; status: AttendeeSendStatus; error?: string }[];
}

// Sends to many attendees in parallel (bounded by SEND_CONCURRENCY) and returns
// a per-attendee outcome so callers can update UI/state accurately. Attendees
// without a claim token are skipped (their coupon is not assigned yet).
export async function sendCouponEmailsConcurrent(
  attendees: Attendee[],
  notionGuideUrl: string,
  isResend: boolean
): Promise<BulkSendResult> {
  const results: BulkSendResult["results"] = new Array(attendees.length);

  await mapWithConcurrency(attendees, SEND_CONCURRENCY, async (attendee, i) => {
    if (!attendee.grantCount || !attendee.claimToken) {
      results[i] = {
        attendeeId: attendee.id,
        status: "skipped",
        error: "No offers granted — cannot send email",
      };
      return;
    }

    const result = await sendCouponEmail(attendee, notionGuideUrl, isResend);
    results[i] = result.success
      ? { attendeeId: attendee.id, status: "sent" }
      : { attendeeId: attendee.id, status: "failed", error: result.error };
  });

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return { sent, failed, skipped, results };
}

// ─── Bulk send pending emails ──────────────────────────────────────────────────

export async function sendPendingEmails(
  eventId: string,
  notionGuideUrl: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .where("emailStatus", "==", "pending")
    .where("grantCount", ">", 0)
    .get();

  const attendees = snap.docs.map((doc) => doc.data() as Attendee);
  const { sent, failed, skipped } = await sendCouponEmailsConcurrent(
    attendees,
    notionGuideUrl,
    false
  );

  return { sent, failed, skipped };
}

// ─── Resend failed emails ──────────────────────────────────────────────────────

export async function resendFailedEmails(
  eventId: string,
  notionGuideUrl: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .where("emailStatus", "==", "failed")
    .where("grantCount", ">", 0)
    .get();

  const attendees = snap.docs.map((doc) => doc.data() as Attendee);
  const { sent, failed, skipped } = await sendCouponEmailsConcurrent(
    attendees,
    notionGuideUrl,
    true
  );

  return { sent, failed, skipped };
}
