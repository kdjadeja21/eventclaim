import "server-only";
import { eq, isNull, ne, or, SQL } from "drizzle-orm";
import { isTestLoginUid, TEST_LOGIN_UID } from "@/lib/auth/test-login-config";
import { auditLogs, events } from "@/lib/db/schema";
import { Event } from "@/lib/types";

/** SQL filter for admin event lists.
 * Test login only sees its own events; real admins share everything else. */
export function eventOwnerScopeSql(sessionUid: string): SQL {
  if (isTestLoginUid(sessionUid)) {
    return eq(events.ownerUid, TEST_LOGIN_UID);
  }
  return or(isNull(events.ownerUid), ne(events.ownerUid, TEST_LOGIN_UID))!;
}

/** SQL filter for audit logs by actor uid. */
export function auditUserScopeSql(sessionUid: string): SQL {
  if (isTestLoginUid(sessionUid)) {
    return eq(auditLogs.userId, TEST_LOGIN_UID);
  }
  return ne(auditLogs.userId, TEST_LOGIN_UID);
}

/** Whether the session may read/mutate this event (and its child data). */
export function canAccessEvent(
  sessionUid: string,
  event: Pick<Event, "ownerUid">
): boolean {
  if (isTestLoginUid(sessionUid)) {
    return event.ownerUid === TEST_LOGIN_UID;
  }
  return event.ownerUid !== TEST_LOGIN_UID;
}

export function ownerUidForNewEvent(sessionUid: string): string {
  return sessionUid;
}
