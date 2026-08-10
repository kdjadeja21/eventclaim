"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, UserPlus, Ban, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import {
  addPortalUserAction,
  approvePortalUserAction,
  denyPortalUserAction,
  revokePortalUserAction,
} from "./actions";
import type { PortalUserStatus } from "@/lib/access";

export type AccessUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  status: PortalUserStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  isAccessAdmin: boolean;
};

export function AccessUsersManager({
  pending,
  active,
  blocked,
  accessAdminEmail,
}: {
  pending: AccessUserRow[];
  active: AccessUserRow[];
  blocked: AccessUserRow[];
  accessAdminEmail: string;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(
    id: string | "add",
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string
  ) {
    setPendingActionId(id);
    startTransition(async () => {
      const result = await action();
      setPendingActionId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      if (id === "add") {
        setEmail("");
        setDisplayName("");
      }
    });
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-4 w-4" />
            Add approved user
          </CardTitle>
          <CardDescription>
            Pre-approve a Google account by email. They can sign in immediately
            without raising a request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              runAction(
                "add",
                () =>
                  addPortalUserAction({
                    email,
                    displayName: displayName || undefined,
                  }),
                "User approved and added"
              );
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="access-email">Email</Label>
              <Input
                id="access-email"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid flex-1 gap-2">
              <Label htmlFor="access-name">Display name (optional)</Label>
              <Input
                id="access-name"
                type="text"
                placeholder="Optional"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isPending}
              />
            </div>
            <Button type="submit" disabled={isPending || !email.trim()}>
              {pendingActionId === "add" ? "Adding…" : "Add user"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <UserSection
        title="Pending requests"
        description="New Google sign-ins waiting for approval."
        empty="No pending requests."
        users={pending}
        pendingActionId={pendingActionId}
        isPending={isPending}
        renderActions={(user) => (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                runAction(
                  user.id,
                  () => approvePortalUserAction(user.id),
                  "Request approved"
                )
              }
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                runAction(
                  user.id,
                  () => denyPortalUserAction(user.id),
                  "Request denied"
                )
              }
            >
              <Ban className="h-3.5 w-3.5" />
              Deny
            </Button>
          </>
        )}
      />

      <UserSection
        title="Active users"
        description={`Approved accounts that can access the portal. Access admin (${accessAdminEmail}) cannot be revoked here.`}
        empty="No active users."
        users={active}
        pendingActionId={pendingActionId}
        isPending={isPending}
        renderActions={(user) =>
          user.isAccessAdmin ? (
            <Badge variant="info">Access admin</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                runAction(
                  user.id,
                  () => revokePortalUserAction(user.id),
                  "Access revoked"
                )
              }
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Revoke
            </Button>
          )
        }
      />

      <UserSection
        title="Denied / revoked"
        description="These accounts cannot sign in or raise a new access request. You can re-approve them if needed."
        empty="No denied or revoked users."
        users={blocked}
        pendingActionId={pendingActionId}
        isPending={isPending}
        renderActions={(user) => (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              runAction(
                user.id,
                () => approvePortalUserAction(user.id),
                "User re-approved"
              )
            }
          >
            <Check className="h-3.5 w-3.5" />
            Re-approve
          </Button>
        )}
      />
    </div>
  );
}

function UserSection({
  title,
  description,
  empty,
  users,
  pendingActionId,
  isPending,
  renderActions,
}: {
  title: string;
  description: string;
  empty: string;
  users: AccessUserRow[];
  pendingActionId: string | null;
  isPending: boolean;
  renderActions: (user: AccessUserRow) => ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {title}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({users.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {users.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Reviewed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  className={
                    pendingActionId === user.id && isPending
                      ? "opacity-60"
                      : undefined
                  }
                >
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.displayName || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(user.requestedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {user.reviewedAt ? formatDateTime(user.reviewedAt) : "—"}
                    {user.reviewedBy ? (
                      <div className="text-xs">{user.reviewedBy}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {renderActions(user)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PortalUserStatus }) {
  switch (status) {
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "approved":
      return <Badge variant="success">Approved</Badge>;
    case "denied":
      return <Badge variant="destructive">Denied</Badge>;
    case "revoked":
      return <Badge variant="secondary">Revoked</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
