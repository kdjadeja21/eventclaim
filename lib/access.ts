/** Sole access-management admin (hard-gated in app code). */
export const ACCESS_ADMIN_EMAIL = "kdjadeja209@gmail.com";

export type PortalUserStatus = "pending" | "approved" | "denied" | "revoked";

export type AccessDecision =
  | { status: "approved" }
  | { status: "pending" }
  | { status: "denied" }
  | { status: "revoked" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAccessAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return normalizeEmail(email) === ACCESS_ADMIN_EMAIL;
}

export function isBlockedStatus(status: PortalUserStatus): boolean {
  return status === "denied" || status === "revoked";
}
