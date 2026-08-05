-- ─── Denormalized counter triggers ─────────────────────────────────────────
-- Replaces the ~15 hand-written FieldValue.increment(...) call sites and the
-- drift-repair code in getAttendeeDetail. These counters can now never drift
-- from the rows that back them because Postgres maintains them atomically as
-- part of the same transaction as the underlying insert/update/delete.

create or replace function trg_grants_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update attendees set grant_count = grant_count + 1 where id = new.attendee_id;
    if new.status = 'claimed' then
      update attendees set claimed_count = claimed_count + 1, claimed_any = true where id = new.attendee_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'claimed' and new.status = 'claimed' then
      update attendees set claimed_count = claimed_count + 1, claimed_any = true where id = new.attendee_id;
    elsif old.status = 'claimed' and new.status <> 'claimed' then
      update attendees
      set claimed_count = greatest(claimed_count - 1, 0),
          claimed_any = (claimed_count - 1) > 0
      where id = new.attendee_id;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update attendees set grant_count = greatest(grant_count - 1, 0) where id = old.attendee_id;
    if old.status = 'claimed' then
      update attendees
      set claimed_count = greatest(claimed_count - 1, 0),
          claimed_any = (claimed_count - 1) > 0
      where id = old.attendee_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;

create trigger grants_after_change
after insert or update or delete on grants
for each row execute function trg_grants_after_change();

create or replace function trg_coupon_links_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update coupons set link_total = link_total + 1 where id = new.coupon_id;
    if new.status = 'available' and not new.is_disabled then
      update coupons set link_available = link_available + 1 where id = new.coupon_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (old.status = 'available' and not old.is_disabled)
       and not (new.status = 'available' and not new.is_disabled) then
      update coupons set link_available = greatest(link_available - 1, 0) where id = new.coupon_id;
    elsif not (old.status = 'available' and not old.is_disabled)
       and (new.status = 'available' and not new.is_disabled) then
      update coupons set link_available = link_available + 1 where id = new.coupon_id;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update coupons set link_total = greatest(link_total - 1, 0) where id = old.coupon_id;
    if old.status = 'available' and not old.is_disabled then
      update coupons set link_available = greatest(link_available - 1, 0) where id = old.coupon_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;

create trigger coupon_links_after_change
after insert or update or delete on coupon_links
for each row execute function trg_coupon_links_after_change();

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- Mirrors the deny-all posture of the previous firestore.rules: every table
-- has RLS enabled with zero policies, so PostgREST (anon/authenticated) can
-- never read or write anything. The app talks to Postgres directly with the
-- Drizzle/postgres.js client, which connects as a superuser-ish app role and
-- bypasses RLS by design — the "server-only" boundary is enforced in code
-- (lib/db/client.ts imports "server-only"), not by RLS.

alter table events enable row level security;
alter table attendees enable row level security;
alter table coupons enable row level security;
alter table coupon_links enable row level security;
alter table grants enable row level security;
alter table email_logs enable row level security;
alter table audit_logs enable row level security;

-- anon/authenticated only exist on a real Supabase project (created by the
-- Auth/PostgREST extensions), not on a bare local Postgres used for sandbox
-- testing, so guard the revoke to keep this migration idempotent everywhere.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on events, attendees, coupons, coupon_links, grants, email_logs, audit_logs from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on events, attendees, coupons, coupon_links, grants, email_logs, audit_logs from authenticated';
  end if;
end;
$$;
