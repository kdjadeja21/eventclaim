"use server";

import { revalidatePath } from "next/cache";
import { requireAccessAdmin } from "@/lib/session";
import {
  addApprovedPortalUser,
  setPortalUserStatus,
} from "@/lib/db/repos/portal-users";
import { writeAuditLog } from "@/lib/db/repos/audit";

export type AccessActionResult =
  | { ok: true }
  | { ok: false; error: string };

function mapError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong";
  switch (err.message) {
    case "UNAUTHORIZED":
      return "You must be signed in";
    case "FORBIDDEN":
      return "Only the access administrator can manage portal users";
    case "NOT_FOUND":
      return "User not found";
    case "CANNOT_MODIFY_ACCESS_ADMIN":
      return "The access administrator account cannot be modified";
    case "INVALID_EMAIL":
      return "Enter a valid email address";
    default:
      return err.message || "Something went wrong";
  }
}

export async function approvePortalUserAction(
  userId: string
): Promise<AccessActionResult> {
  try {
    const admin = await requireAccessAdmin();
    const user = await setPortalUserStatus({
      userId,
      status: "approved",
      reviewedBy: admin.email,
    });
    await writeAuditLog({
      eventId: null,
      action: "portal_user_approved",
      userId: admin.uid,
      metadata: { email: user.email, portalUserId: user.id },
    });
    revalidatePath("/access");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mapError(err) };
  }
}

export async function denyPortalUserAction(
  userId: string
): Promise<AccessActionResult> {
  try {
    const admin = await requireAccessAdmin();
    const user = await setPortalUserStatus({
      userId,
      status: "denied",
      reviewedBy: admin.email,
    });
    await writeAuditLog({
      eventId: null,
      action: "portal_user_denied",
      userId: admin.uid,
      metadata: { email: user.email, portalUserId: user.id },
    });
    revalidatePath("/access");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mapError(err) };
  }
}

export async function revokePortalUserAction(
  userId: string
): Promise<AccessActionResult> {
  try {
    const admin = await requireAccessAdmin();
    const user = await setPortalUserStatus({
      userId,
      status: "revoked",
      reviewedBy: admin.email,
    });
    await writeAuditLog({
      eventId: null,
      action: "portal_user_revoked",
      userId: admin.uid,
      metadata: { email: user.email, portalUserId: user.id },
    });
    revalidatePath("/access");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mapError(err) };
  }
}

export async function addPortalUserAction(input: {
  email: string;
  displayName?: string;
}): Promise<AccessActionResult> {
  try {
    const admin = await requireAccessAdmin();
    const user = await addApprovedPortalUser({
      email: input.email,
      displayName: input.displayName ?? null,
      reviewedBy: admin.email,
    });
    await writeAuditLog({
      eventId: null,
      action: "portal_user_added",
      userId: admin.uid,
      metadata: { email: user.email, portalUserId: user.id },
    });
    revalidatePath("/access");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mapError(err) };
  }
}
