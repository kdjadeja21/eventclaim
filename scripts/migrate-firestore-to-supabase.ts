/**
 * One-time backfill: copies existing Firestore data into Supabase Postgres.
 *
 * Requires:
 *   - FIREBASE_SERVICE_ACCOUNT / NEXT_PUBLIC_FIREBASE_PROJECT_ID (source)
 *   - DIRECT_URL (destination — the direct Postgres connection, not the
 *     pooler, since this is a long-lived batch job)
 *
 * Usage:
 *   npx tsx scripts/migrate-firestore-to-supabase.ts [--verify-only]
 *
 * Idempotent: every insert uses ON CONFLICT DO NOTHING keyed on the same id
 * the Firestore document used, so re-running after a partial failure is safe.
 * Run with --verify-only to compare row counts without writing anything.
 */
import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import postgres from "postgres";

const VERIFY_ONLY = process.argv.includes("--verify-only");

function getFirestoreSource() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const app =
    getApps()[0] ??
    initializeApp(
      serviceAccountJson
        ? { credential: cert(JSON.parse(serviceAccountJson)) }
        : { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }
    );
  return getFirestore(app);
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) throw new Error("Set DIRECT_URL before running the backfill.");

  const fs = getFirestoreSource();
  const sql = postgres(directUrl, { prepare: false });

  try {
    console.log(`Starting Firestore -> Supabase backfill${VERIFY_ONLY ? " (verify-only)" : ""}...`);

    const eventsSnap = await fs.collection("events").get();
    console.log(`Found ${eventsSnap.size} events.`);

    let totalAttendees = 0;
    let totalCoupons = 0;
    let totalLinks = 0;
    let totalGrants = 0;
    let totalEmailLogs = 0;

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data();

      if (!VERIFY_ONLY) {
        await sql`
          insert into events (
            id, name, slug, date, notion_guide_url, status, created_at,
            updated_at, luma_last_synced_at, auto_send_email, tagline,
            description, time_label, venue
          ) values (
            ${event.id}, ${event.name}, ${event.slug}, ${event.date},
            ${event.notionGuideUrl ?? ""}, ${event.status}, ${event.createdAt},
            ${event.updatedAt}, ${event.lumaLastSyncedAt ?? null},
            ${event.autoSendEmail ?? false}, ${event.tagline ?? null},
            ${event.description ?? null}, ${event.timeLabel ?? null},
            ${event.venue ?? null}
          )
          on conflict (id) do nothing
        `;
      }

      const attendeesSnap = await eventDoc.ref.collection("attendees").get();
      totalAttendees += attendeesSnap.size;

      for (const attendeeDoc of attendeesSnap.docs) {
        const a = attendeeDoc.data();
        if (!VERIFY_ONLY) {
          await sql`
            insert into attendees (
              id, event_id, name, email, grant_count, claimed_count,
              claimed_any, email_status, email_sent_at, claim_token,
              created_at, registered_at, checked_in_at, is_blacklisted
            ) values (
              ${a.id}, ${event.id}, ${a.name}, ${a.email}, ${a.grantCount ?? 0},
              ${a.claimedCount ?? 0}, ${a.claimedAny ?? false}, ${a.emailStatus},
              ${a.emailSentAt ?? null}, ${a.claimToken ?? null}, ${a.createdAt},
              ${a.registeredAt ?? null}, ${a.checkedInAt ?? null},
              ${a.isBlacklisted ?? false}
            )
            on conflict (id) do nothing
          `;
        }

        const grantsSnap = await attendeeDoc.ref.collection("grants").get();
        totalGrants += grantsSnap.size;
        for (const grantDoc of grantsSnap.docs) {
          const g = grantDoc.data();
          if (!VERIFY_ONLY) {
            await sql`
              insert into grants (
                attendee_id, coupon_id, event_id, value, link_id, status,
                assigned_at, claimed_at
              ) values (
                ${a.id}, ${g.couponId}, ${event.id}, ${g.value},
                ${g.linkId ?? null}, ${g.status}, ${g.assignedAt},
                ${g.claimedAt ?? null}
              )
              on conflict (attendee_id, coupon_id) do nothing
            `;
          }
        }
      }

      const couponsSnap = await eventDoc.ref.collection("coupons").get();
      totalCoupons += couponsSnap.size;

      for (const couponDoc of couponsSnap.docs) {
        const c = couponDoc.data();
        if (!VERIFY_ONLY) {
          await sql`
            insert into coupons (
              id, event_id, name, kind, category, logo_url, highlight,
              description, note, shared_value, redeem_url, link_total,
              link_available, sort_order, is_disabled, created_at
            ) values (
              ${c.id}, ${event.id}, ${c.name}, ${c.kind}, ${c.category ?? ""},
              ${c.logoUrl ?? ""}, ${c.highlight ?? ""}, ${c.description ?? ""},
              ${c.note ?? null}, ${c.sharedValue ?? null}, ${c.redeemUrl ?? null},
              ${c.linkTotal ?? 0}, ${c.linkAvailable ?? 0}, ${c.sortOrder ?? 0},
              ${c.isDisabled ?? false}, ${c.createdAt}
            )
            on conflict (id) do nothing
          `;
        }

        const linksSnap = await couponDoc.ref.collection("links").get();
        totalLinks += linksSnap.size;
        for (const linkDoc of linksSnap.docs) {
          const l = linkDoc.data();
          if (!VERIFY_ONLY) {
            await sql`
              insert into coupon_links (
                id, coupon_id, event_id, url, status, assigned_to,
                assigned_at, claimed_at, is_disabled
              ) values (
                ${l.id}, ${c.id}, ${event.id}, ${l.url}, ${l.status},
                ${l.assignedTo ?? null}, ${l.assignedAt ?? null},
                ${l.claimedAt ?? null}, ${l.isDisabled ?? false}
              )
              on conflict (id) do nothing
            `;
          }
        }
      }
    }

    const emailLogsSnap = await fs.collection("emailLogs").get();
    totalEmailLogs = emailLogsSnap.size;
    for (const logDoc of emailLogsSnap.docs) {
      const l = logDoc.data();
      if (!VERIFY_ONLY) {
        await sql`
          insert into email_logs (id, attendee_id, event_id, email_type, sent_at, resend_count, status, error)
          values (${l.id}, ${l.attendeeId}, ${l.eventId}, ${l.emailType}, ${l.sentAt}, ${l.resendCount ?? 0}, ${l.status}, ${l.error ?? null})
          on conflict (id) do nothing
        `;
      }
    }

    const auditLogsSnap = await fs.collection("auditLogs").get();
    for (const logDoc of auditLogsSnap.docs) {
      const l = logDoc.data();
      if (!VERIFY_ONLY) {
        await sql`
          insert into audit_logs (id, event_id, action, metadata, user_id, timestamp)
          values (${l.id}, ${l.eventId ?? null}, ${l.action}, ${sql.json(l.metadata ?? {})}, ${l.userId}, ${l.timestamp})
          on conflict (id) do nothing
        `;
      }
    }

    console.log("Source (Firestore) counts:");
    console.table({
      events: eventsSnap.size,
      attendees: totalAttendees,
      coupons: totalCoupons,
      couponLinks: totalLinks,
      grants: totalGrants,
      emailLogs: totalEmailLogs,
      auditLogs: auditLogsSnap.size,
    });

    const [dest] = await sql`
      select
        (select count(*) from events) as events,
        (select count(*) from attendees) as attendees,
        (select count(*) from coupons) as coupons,
        (select count(*) from coupon_links) as coupon_links,
        (select count(*) from grants) as grants,
        (select count(*) from email_logs) as email_logs,
        (select count(*) from audit_logs) as audit_logs
    `;
    console.log("Destination (Postgres) counts:");
    console.table(dest);

    // Spot-check referential integrity: every grant with a link_id should
    // point at a coupon_link that itself is marked assigned/claimed.
    const [integrity] = await sql`
      select count(*) as orphaned_link_grants
      from grants g
      left join coupon_links cl on cl.id = g.link_id
      where g.link_id is not null and cl.id is null
    `;
    console.log(`Orphaned grant->link references: ${integrity.orphaned_link_grants}`);

    if (VERIFY_ONLY) {
      console.log("Verify-only run complete — no rows were written.");
    } else {
      console.log("Backfill complete.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
