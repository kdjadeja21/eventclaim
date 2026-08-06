import type { DashboardData } from "@/app/api/dashboard/route";

export type ChecklistStepId =
  | "connect"
  | "createEvent"
  | "tempUsers"
  | "testEmail"
  | "goLive";

export type ChecklistStep = {
  id: ChecklistStepId;
  title: string;
  description: string;
  href: string;
  done: boolean;
  optional?: boolean;
  hint?: string;
};

export type TourProgressInput = {
  emailConfigured: boolean;
  lumaConfigured: boolean;
  dashboard: DashboardData | null;
};

export type TourProgress = {
  steps: ChecklistStep[];
  completedRequired: number;
  totalRequired: number;
  allRequiredDone: boolean;
  firstEventSlug: string | null;
  firstDraftEventSlug: string | null;
};

function pickEventSlugs(dashboard: DashboardData | null): {
  firstEventSlug: string | null;
  firstDraftEventSlug: string | null;
  hasActiveEvent: boolean;
} {
  const events = dashboard?.perEventStats.map((row) => row.event) ?? [];
  const firstEventSlug = events[0]?.slug ?? null;
  const firstDraftEventSlug =
    events.find((event) => event.status === "draft")?.slug ?? firstEventSlug;
  const hasActiveEvent = events.some((event) => event.status === "active");
  return { firstEventSlug, firstDraftEventSlug, hasActiveEvent };
}

export function deriveTourProgress(input: TourProgressInput): TourProgress {
  const { emailConfigured, lumaConfigured, dashboard } = input;
  const { firstEventSlug, firstDraftEventSlug, hasActiveEvent } =
    pickEventSlugs(dashboard);

  const hasEvent = (dashboard?.perEventStats.length ?? 0) > 0;
  const hasTestAttendees = Boolean(dashboard?.hasTestAttendees);
  const hasEmailsSent = (dashboard?.totalEmailsSent ?? 0) > 0;

  const attendeesHref = firstDraftEventSlug
    ? `/events/${firstDraftEventSlug}/attendees`
    : "/events";
  const goLiveHref = firstEventSlug
    ? `/events/${firstEventSlug}/coupons`
    : "/events";

  const steps: ChecklistStep[] = [
    {
      id: "connect",
      title: "Connect email (and Luma)",
      description:
        "Open the Setup guide, then paste keys in Settings and Save.",
      href: "/settings/guide",
      done: emailConfigured,
      hint: emailConfigured
        ? lumaConfigured
          ? undefined
          : "Email is ready. Add Luma when you sync real guests."
        : "EmailJS is required before you can send a test email.",
    },
    {
      id: "createEvent",
      title: "Create your first event",
      description: "A Cursor Credits offer is added for you automatically.",
      href: "/events/new",
      done: hasEvent,
    },
    {
      id: "tempUsers",
      title: "Create temp users",
      description:
        "Practice guests so you can try the email safely. They are removed when the event goes live.",
      href: attendeesHref,
      done: hasTestAttendees,
    },
    {
      id: "testEmail",
      title: "Send a test claim email",
      description: "Send from Attendees and open the claim link in your inbox.",
      href: attendeesHref,
      done: hasEmailsSent,
    },
    {
      id: "goLive",
      title: "Go live when ready",
      description:
        "Add real credit links, sync Luma guests, then set the event Active. Leaving draft removes temp test data.",
      href: goLiveHref,
      done: hasActiveEvent,
      optional: true,
    },
  ];

  const required = steps.filter((step) => !step.optional);
  const completedRequired = required.filter((step) => step.done).length;

  return {
    steps,
    completedRequired,
    totalRequired: required.length,
    allRequiredDone: completedRequired === required.length,
    firstEventSlug,
    firstDraftEventSlug,
  };
}
