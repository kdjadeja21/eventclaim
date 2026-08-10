import { redirect } from "next/navigation";
import { requireAccessAdmin } from "@/lib/session";
import { listPortalUsers, type PortalUser } from "@/lib/db/repos/portal-users";
import { isAccessAdminEmail } from "@/lib/access";
import { AccessUsersManager } from "./access-users-manager";

export default async function AccessPage() {
  let admin;
  try {
    admin = await requireAccessAdmin();
  } catch {
    redirect("/dashboard");
  }

  const users = await listPortalUsers();
  const pending = users.filter((u) => u.status === "pending");
  const active = users.filter((u) => u.status === "approved");
  const blocked = users.filter(
    (u) => u.status === "denied" || u.status === "revoked"
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Access control</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review access requests and manage who can use the portal. Signed in as{" "}
          {admin.email}.
        </p>
      </div>

      <AccessUsersManager
        pending={toClientUsers(pending)}
        active={toClientUsers(active)}
        blocked={toClientUsers(blocked)}
        accessAdminEmail={admin.email}
      />
    </div>
  );
}

function toClientUsers(users: PortalUser[]) {
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    status: u.status,
    requestedAt: u.requestedAt,
    reviewedAt: u.reviewedAt,
    reviewedBy: u.reviewedBy,
    isAccessAdmin: isAccessAdminEmail(u.email),
  }));
}
