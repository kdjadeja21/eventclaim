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

// ─── Email Template ────────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  attendeeName: string;
  claimUrl: string;
  notionGuideUrl: string;
}): string {
  const { attendeeName, claimUrl, notionGuideUrl } = params;
  const firstName = attendeeName.split(" ")[0] || attendeeName;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Cursor Credits Are Ready</title>
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
                Your Cursor Credits Are Ready 🎉
              </h1>
              <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;">
                Thank you for attending our event. We're excited to give you access to Cursor credits as a thank-you for your participation.
              </p>
              <p style="margin:0 0 32px;font-size:16px;color:#52525b;line-height:1.6;">
                Click the button below to claim your credits:
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background:#09090b;border-radius:8px;text-align:center;">
                    <a href="${claimUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.01em;">
                      Claim My Cursor Credits →
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
                  <strong style="color:#09090b;">Note:</strong> This link is unique to you. Please don't share it — each credit can only be claimed once.
                </p>
              </div>

              ${notionGuideUrl ? `
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
                Need help claiming? Check out our step-by-step guide:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${notionGuideUrl}"
                   style="color:#09090b;font-weight:600;font-size:15px;">
                  How to Claim Your Cursor Credits →
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
  isResend = false
): Promise<{ success: boolean; error?: string }> {
  if (!attendee.claimToken) {
    return { success: false, error: "No claim token — coupon not assigned yet" };
  }

  const claimUrl = `${APP_BASE_URL}/claim/${attendee.claimToken}`;

  console.log("[sendCouponEmail] preparing send", {
    to: attendee.email,
    claimUrl,
    isResend,
  });

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: attendee.email,
          to_name: attendee.name,
          subject: "Your Cursor Credits Are Ready to Claim",
          message_html: buildEmailHtml({
            attendeeName: attendee.name,
            claimUrl,
            notionGuideUrl,
          }),
        },
      }),
    });

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

    // Update coupon status to emailSent (only on first send, not resend)
    if (!isResend && attendee.couponId) {
      await adminDb
        .collection("events")
        .doc(attendee.eventId)
        .collection("coupons")
        .doc(attendee.couponId)
        .update({ status: "emailSent" });
    }

    await writeAuditLog({
      eventId: attendee.eventId,
      action: isResend ? "email_resent" : "email_sent",
      metadata: { attendeeId: attendee.id, email: attendee.email },
    });

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
    .where("couponId", "!=", null)
    .get();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const attendee = doc.data() as Attendee;
    if (!attendee.claimToken) { skipped++; continue; }

    const result = await sendCouponEmail(attendee, notionGuideUrl, false);
    if (result.success) sent++;
    else failed++;
  }

  return { sent, failed, skipped };
}

// ─── Resend failed emails ──────────────────────────────────────────────────────

export async function resendFailedEmails(
  eventId: string,
  notionGuideUrl: string
): Promise<{ sent: number; failed: number }> {
  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .where("emailStatus", "==", "failed")
    .get();

  let sent = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const attendee = doc.data() as Attendee;
    const result = await sendCouponEmail(attendee, notionGuideUrl, true);
    if (result.success) sent++;
    else failed++;
  }

  return { sent, failed };
}
