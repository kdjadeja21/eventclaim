/**
 * Local-only seed for demo video recording. Not part of the app runtime.
 */
import { nanoid } from "nanoid";
import postgres from "postgres";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const sql = postgres(url, { prepare: false });
const now = new Date().toISOString();

async function main() {
  const eventId = "evt_demo_cursor_meetup";
  const slug = "cursor-community-meetup";
  const couponId = "cpn_demo_credits";

  await sql`DELETE FROM events WHERE id = ${eventId}`;

  await sql`
    INSERT INTO events (
      id, name, slug, date, notion_guide_url, status, created_at, updated_at,
      auto_send_email, tagline, description, time_label, venue
    ) VALUES (
      ${eventId},
      ${"Cursor Community Meetup"},
      ${slug},
      ${"2026-08-15"},
      ${"https://www.notion.so"},
      ${"active"},
      ${now},
      ${now},
      ${false},
      ${"Credits for every checked-in attendee"},
      ${"Distribute Cursor Credits after the meetup with claim emails and tracked redemptions."},
      ${"6:00 PM – 9:00 PM"},
      ${"Community Hub"}
    )
  `;

  await sql`
    INSERT INTO coupons (
      id, event_id, name, kind, category, logo_url, highlight, description,
      note, link_total, link_available, sort_order, is_disabled, created_at
    ) VALUES (
      ${couponId},
      ${eventId},
      ${"Cursor Credits"},
      ${"uniqueLink"},
      ${"Partner"},
      ${""},
      ${"$20 Cursor Credits"},
      ${"Unique referral link for each attendee"},
      ${"One link per person"},
      ${0},
      ${0},
      ${0},
      ${false},
      ${now}
    )
  `;

  const people = [
    { name: "Alex Rivera", email: "alex@example.com", status: "sent", claimed: true },
    { name: "Jordan Lee", email: "jordan@example.com", status: "sent", claimed: false },
    { name: "Sam Patel", email: "sam@example.com", status: "pending", claimed: false },
    { name: "Taylor Kim", email: "taylor@example.com", status: "sent", claimed: true },
    { name: "Casey Nguyen", email: "casey@example.com", status: "failed", claimed: false },
  ] as const;

  for (const person of people) {
    const attendeeId = `${eventId}_${person.email}`;
    const claimToken = nanoid(32);
    const linkId = nanoid();
    const code = nanoid(12).toUpperCase().replace(/[^A-Z0-9]/g, "A").slice(0, 12);
    const linkUrl = `https://cursor.com/referral?code=${code}`;

    await sql`
      INSERT INTO attendees (
        id, event_id, name, email, grant_count, claimed_count, claimed_any,
        email_status, email_sent_at, claim_token, created_at, registered_at,
        checked_in_at, is_blacklisted, is_test
      ) VALUES (
        ${attendeeId},
        ${eventId},
        ${person.name},
        ${person.email},
        ${0},
        ${0},
        ${false},
        ${person.status},
        ${person.status === "sent" ? now : null},
        ${claimToken},
        ${now},
        ${now},
        ${now},
        ${false},
        ${false}
      )
    `;

    await sql`
      INSERT INTO coupon_links (
        id, coupon_id, event_id, url, status, assigned_to, assigned_at,
        claimed_at, is_disabled, is_test
      ) VALUES (
        ${linkId},
        ${couponId},
        ${eventId},
        ${linkUrl},
        ${person.claimed ? "claimed" : "assigned"},
        ${attendeeId},
        ${now},
        ${person.claimed ? now : null},
        ${false},
        ${false}
      )
    `;

    await sql`
      INSERT INTO grants (
        coupon_id, event_id, attendee_id, value, link_id, status, assigned_at, claimed_at
      ) VALUES (
        ${couponId},
        ${eventId},
        ${attendeeId},
        ${linkUrl},
        ${linkId},
        ${person.claimed ? "claimed" : "assigned"},
        ${now},
        ${person.claimed ? now : null}
      )
    `;

    if (person.status === "sent" || person.status === "failed") {
      await sql`
        INSERT INTO email_logs (
          id, attendee_id, event_id, email_type, sent_at, resend_count, status, error
        ) VALUES (
          ${nanoid()},
          ${attendeeId},
          ${eventId},
          ${"initial"},
          ${now},
          ${0},
          ${person.status === "failed" ? "failed" : "sent"},
          ${person.status === "failed" ? "Demo seed failure" : null}
        )
      `;
    }
  }

  const actions = [
    "event_created",
    "coupon_created",
    "attendee_imported",
    "coupon_granted",
    "email_sent",
    "grant_claimed",
  ] as const;

  for (const action of actions) {
    await sql`
      INSERT INTO audit_logs (id, event_id, action, metadata, user_id, timestamp)
      VALUES (
        ${nanoid()},
        ${eventId},
        ${action},
        ${sql.json({ source: "demo-seed" })},
        ${"demo-user"},
        ${new Date()}
      )
    `;
  }

  console.log("Seeded demo event:", slug);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
