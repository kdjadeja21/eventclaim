import Link from "next/link";
import {
  Users,
  PhoneCall,
  PhoneMissed,
  CheckCheck,
  UserCheck,
  UserX,
  ArrowRight,
  Clock,
} from "lucide-react";
import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import {
  getConfirmationGlobalStats,
  getConfirmationVolunteerStats,
} from "@/lib/confirmation/stats";
import {
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAuditLog,
  ConfirmationVolunteer,
} from "@/lib/confirmation/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils";
import { UploadForm } from "./upload-form";
import { AssignButton } from "./assign-button";
import { ConfirmationSectionNav } from "./confirmation-section-nav";

async function getDashboardData() {
  await requireSession();

  const globalStats = await getConfirmationGlobalStats();

  const volunteersSnap = await adminDb
    .collection("confirmationVolunteers")
    .orderBy("createdAt", "asc")
    .get();
  const volunteers = volunteersSnap.docs.map(
    (d) => d.data() as ConfirmationVolunteer
  );
  const volunteerStats = await getConfirmationVolunteerStats(volunteers);
  const activeVolunteerCount = volunteers.filter((v) => v.isActive).length;

  const logsSnap = await adminDb
    .collection("confirmationAuditLogs")
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();
  const recentActivity = logsSnap.docs.map((d) => d.data() as ConfirmationAuditLog);

  return { globalStats, volunteerStats, activeVolunteerCount, recentActivity };
}

const actionLabels: Record<string, string> = {
  attendees_imported: "Attendees imported",
  volunteer_created: "Volunteer created",
  volunteer_deactivated: "Volunteer status changed",
  volunteer_pin_reset: "Volunteer PIN reset",
  attendees_assigned: "Attendees assigned",
  attendee_status_updated: "Attendee status updated",
};

const statusIcons: Record<string, React.ElementType> = {
  need_confirmation: Users,
  call_pending: PhoneCall,
  call_done: PhoneMissed,
  confirm_coming: UserCheck,
  not_coming: UserX,
};

export default async function ConfirmationsPage() {
  const { globalStats, volunteerStats, activeVolunteerCount, recentActivity } =
    await getDashboardData();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight gradient-text">
            Confirmations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track attendee call confirmations and manage volunteer assignments
          </p>
        </div>
        <AssignButton volunteerCount={activeVolunteerCount} />
      </div>

      <ConfirmationSectionNav active="dashboard" />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Link href="/confirmations/attendees">
          <StatCard icon={CheckCheck} label="Total Attendees" value={globalStats.total} />
        </Link>
        {(Object.keys(CONFIRMATION_STATUS_LABELS) as Array<
          keyof typeof CONFIRMATION_STATUS_LABELS
        >).map((status) => (
          <Link key={status} href={`/confirmations/attendees?status=${status}`}>
            <StatCard
              icon={statusIcons[status] ?? Clock}
              label={CONFIRMATION_STATUS_LABELS[status]}
              value={globalStats.byStatus[status]}
            />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <UploadForm />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold gradient-text uppercase tracking-wider">
                Team Mapping
              </h2>
              <Link
                href="/confirmations/volunteers"
                className="text-xs text-primary flex items-center gap-0.5 hover:underline"
              >
                Manage volunteers
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <Card>
              <CardContent className="p-0">
                {volunteerStats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Users className="h-6 w-6" />
                    No volunteers yet.{" "}
                    <Link
                      href="/confirmations/volunteers"
                      className="text-primary underline"
                    >
                      Create one
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {volunteerStats.map(({ volunteer, total, byStatus }) => (
                      <div
                        key={volunteer.id}
                        className="flex items-center justify-between gap-4 p-4 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium flex items-center gap-2">
                            {volunteer.name}
                            <Badge
                              variant={volunteer.isActive ? "success" : "secondary"}
                              className="text-[10px]"
                            >
                              {volunteer.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            @{volunteer.username}
                          </p>
                        </div>
                        <div className="grid grid-cols-5 gap-3 text-center text-xs shrink-0">
                          <Metric label="Assigned" value={total} />
                          <Metric
                            label="Pending"
                            value={byStatus.call_pending + byStatus.need_confirmation}
                          />
                          <Metric label="Done" value={byStatus.call_done} />
                          <Metric label="Coming" value={byStatus.confirm_coming} />
                          <Metric label="Not Coming" value={byStatus.not_coming} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold gradient-text uppercase tracking-wider">
            Recent Activity
          </h2>
          <Card>
            <CardContent className="pt-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No activity yet.
                </p>
              ) : (
                <div className="space-y-0 divide-y">
                  {recentActivity.map((item) => (
                    <div key={item.id} className="py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1">
                          {actionLabels[item.action] ?? item.action}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                        {formatDateTime(item.timestamp)} · {item.actorType}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <Separator className="my-3" />
              <Link
                href="/confirmations/logs"
                className="text-xs text-primary flex items-center gap-0.5 hover:underline"
              >
                View all logs
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <Card className="hover:border-primary/40 hover:shadow-sm transition-colors cursor-pointer">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="flex h-7 w-7 items-center justify-center rounded-md gradient-brand shadow-sm">
            <Icon className="h-3.5 w-3.5 text-white" />
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-base font-semibold">{value}</p>
      <p className="text-muted-foreground whitespace-nowrap">{label}</p>
    </div>
  );
}
