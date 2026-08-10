import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { portalUsers } from "@/lib/db/schema";
import {
  ACCESS_ADMIN_EMAIL,
  AccessDecision,
  normalizeEmail,
  PortalUserStatus,
  isAccessAdminEmail,
  isBlockedStatus,
} from "@/lib/access";

export type PortalUser = {
  id: string;
  email: string;
  firebaseUid: string | null;
  displayName: string | null;
  status: PortalUserStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function toPortalUser(row: typeof portalUsers.$inferSelect): PortalUser {
  return {
    id: row.id,
    email: row.email,
    firebaseUid: row.firebaseUid,
    displayName: row.displayName,
    status: row.status as PortalUserStatus,
    requestedAt: row.requestedAt,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function findPortalUserByEmail(
  email: string
): Promise<PortalUser | null> {
  const normalized = normalizeEmail(email);
  const rows = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.email, normalized))
    .limit(1);
  return rows[0] ? toPortalUser(rows[0]) : null;
}

export async function listPortalUsers(): Promise<PortalUser[]> {
  const rows = await db
    .select()
    .from(portalUsers)
    .orderBy(desc(portalUsers.requestedAt));
  return rows.map(toPortalUser);
}

export async function listPortalUsersByStatus(
  statuses: PortalUserStatus[]
): Promise<PortalUser[]> {
  if (statuses.length === 0) return [];
  const rows = await db
    .select()
    .from(portalUsers)
    .where(inArray(portalUsers.status, statuses))
    .orderBy(desc(portalUsers.requestedAt));
  return rows.map(toPortalUser);
}

/**
 * Ensures the sole access admin always has an approved row so they can never
 * lock themselves out of the portal.
 */
export async function ensureAccessAdminUser(input: {
  email: string;
  firebaseUid: string;
  displayName?: string | null;
}): Promise<PortalUser> {
  const email = normalizeEmail(input.email);
  if (!isAccessAdminEmail(email)) {
    throw new Error("NOT_ACCESS_ADMIN");
  }

  const existing = await findPortalUserByEmail(email);
  const ts = nowIso();

  if (!existing) {
    const id = nanoid();
    await db.insert(portalUsers).values({
      id,
      email: ACCESS_ADMIN_EMAIL,
      firebaseUid: input.firebaseUid,
      displayName: input.displayName ?? null,
      status: "approved",
      requestedAt: ts,
      reviewedAt: ts,
      reviewedBy: ACCESS_ADMIN_EMAIL,
      createdAt: ts,
      updatedAt: ts,
    });
    const created = await findPortalUserByEmail(email);
    if (!created) throw new Error("FAILED_TO_SEED_ACCESS_ADMIN");
    return created;
  }

  await db
    .update(portalUsers)
    .set({
      firebaseUid: input.firebaseUid,
      displayName: input.displayName ?? existing.displayName,
      status: "approved",
      reviewedAt: existing.status === "approved" ? existing.reviewedAt : ts,
      reviewedBy:
        existing.status === "approved" ? existing.reviewedBy : ACCESS_ADMIN_EMAIL,
      updatedAt: ts,
    })
    .where(eq(portalUsers.id, existing.id));

  const updated = await findPortalUserByEmail(email);
  if (!updated) throw new Error("FAILED_TO_UPDATE_ACCESS_ADMIN");
  return updated;
}

/**
 * Resolves Google sign-in into an access decision. Creates a pending request
 * for unknown emails. Never creates a request for denied/revoked users.
 */
export async function resolveSignInAccess(input: {
  email: string;
  firebaseUid: string;
  displayName?: string | null;
}): Promise<AccessDecision & { user?: PortalUser }> {
  const email = normalizeEmail(input.email);

  if (isAccessAdminEmail(email)) {
    const user = await ensureAccessAdminUser(input);
    return { status: "approved", user };
  }

  const existing = await findPortalUserByEmail(email);
  const ts = nowIso();

  if (!existing) {
    const id = nanoid();
    await db.insert(portalUsers).values({
      id,
      email,
      firebaseUid: input.firebaseUid,
      displayName: input.displayName ?? null,
      status: "pending",
      requestedAt: ts,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: ts,
      updatedAt: ts,
    });
    return { status: "pending" };
  }

  if (isBlockedStatus(existing.status)) {
    return { status: existing.status };
  }

  if (existing.status === "pending") {
    await db
      .update(portalUsers)
      .set({
        firebaseUid: input.firebaseUid,
        displayName: input.displayName ?? existing.displayName,
        updatedAt: ts,
      })
      .where(eq(portalUsers.id, existing.id));
    return { status: "pending", user: existing };
  }

  // approved
  await db
    .update(portalUsers)
    .set({
      firebaseUid: input.firebaseUid,
      displayName: input.displayName ?? existing.displayName,
      updatedAt: ts,
    })
    .where(eq(portalUsers.id, existing.id));

  return { status: "approved", user: existing };
}

export async function isEmailApproved(email: string | undefined | null): Promise<boolean> {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  if (isAccessAdminEmail(normalized)) {
    // Belt-and-suspenders: access admin is always allowed even if the row is
    // briefly missing (e.g. mid-migration).
    return true;
  }
  const user = await findPortalUserByEmail(normalized);
  return user?.status === "approved";
}

export async function setPortalUserStatus(input: {
  userId: string;
  status: Exclude<PortalUserStatus, "pending">;
  reviewedBy: string;
}): Promise<PortalUser> {
  const reviewedBy = normalizeEmail(input.reviewedBy);
  if (!isAccessAdminEmail(reviewedBy)) {
    throw new Error("FORBIDDEN");
  }

  const rows = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.id, input.userId))
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("NOT_FOUND");

  // Never demote or alter the access admin via the management UI.
  if (isAccessAdminEmail(existing.email)) {
    throw new Error("CANNOT_MODIFY_ACCESS_ADMIN");
  }

  const ts = nowIso();
  await db
    .update(portalUsers)
    .set({
      status: input.status,
      reviewedAt: ts,
      reviewedBy,
      updatedAt: ts,
    })
    .where(eq(portalUsers.id, input.userId));

  const updated = await findPortalUserByEmail(existing.email);
  if (!updated) throw new Error("NOT_FOUND");
  return updated;
}

/**
 * Access admin can pre-approve a user by email without waiting for a request.
 * Denied/revoked rows are reopened to approved (admin override — users still
 * cannot self-serve a new request while blocked).
 */
export async function addApprovedPortalUser(input: {
  email: string;
  displayName?: string | null;
  reviewedBy: string;
}): Promise<PortalUser> {
  const reviewedBy = normalizeEmail(input.reviewedBy);
  if (!isAccessAdminEmail(reviewedBy)) {
    throw new Error("FORBIDDEN");
  }

  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("INVALID_EMAIL");
  }

  const existing = await findPortalUserByEmail(email);
  const ts = nowIso();

  if (!existing) {
    const id = nanoid();
    await db.insert(portalUsers).values({
      id,
      email,
      firebaseUid: null,
      displayName: input.displayName?.trim() || null,
      status: "approved",
      requestedAt: ts,
      reviewedAt: ts,
      reviewedBy,
      createdAt: ts,
      updatedAt: ts,
    });
    const created = await findPortalUserByEmail(email);
    if (!created) throw new Error("FAILED_TO_ADD_USER");
    return created;
  }

  if (isAccessAdminEmail(existing.email) && existing.status === "approved") {
    return existing;
  }

  await db
    .update(portalUsers)
    .set({
      displayName: input.displayName?.trim() || existing.displayName,
      status: "approved",
      reviewedAt: ts,
      reviewedBy,
      updatedAt: ts,
    })
    .where(eq(portalUsers.id, existing.id));

  const updated = await findPortalUserByEmail(email);
  if (!updated) throw new Error("FAILED_TO_ADD_USER");
  return updated;
}
