export type TourRouteResolver = (ctx: FeatureTourContext) => string;

export type FeatureTourContext = {
  draftEventSlug: string | null;
  eventSlug: string | null;
};

export type TourId =
  | "global"
  | "dashboard"
  | "settings"
  | "settings-guide"
  | "events"
  | "events-new"
  | "event-overview"
  | "attendees"
  | "coupons"
  | "import"
  | "preview";

export type FeatureTourStep = {
  id: string;
  /**
   * Where this step should run. Omit for page tours that stay on the
   * current route. Global welcome tour sets this to navigate between pages.
   */
  route?: string | TourRouteResolver;
  element?: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  hash?: string;
};

function attendeesRoute(ctx: FeatureTourContext): string {
  const slug = ctx.draftEventSlug ?? ctx.eventSlug;
  return slug ? `/events/${slug}/attendees` : "/events";
}

/** Short first-run walkthrough — the big picture only. */
export const GLOBAL_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: "welcome",
    route: "/dashboard",
    title: "Welcome to EventClaim",
    description:
      "Send Cursor credits and partner offers to event guests by email. This short tour covers the three things you need: connect email, create an event, and send a practice claim email.",
  },
  {
    id: "connect-email",
    route: "/settings",
    element: "[data-tour='settings-emailjs']",
    title: "1 — Connect email",
    description:
      "Paste your EmailJS keys here and Save. Need help finding them? Open the Setup guide link on this page. Luma can wait until you sync real guests.",
    side: "top",
    align: "start",
  },
  {
    id: "create-event",
    route: "/events",
    element: "[data-tour='new-event'], [data-tour='new-event-empty']",
    title: "2 — Create an event",
    description:
      "Each meetup gets an event. A Cursor Credits offer is added automatically — you do not build that from scratch.",
    side: "bottom",
    align: "end",
  },
  {
    id: "practice-send",
    route: attendeesRoute,
    element:
      "[data-tour='create-temp-users'], [data-tour='send-test-email'], [data-tour='new-event']",
    title: "3 — Practice, then send",
    description:
      "In a Draft event, create temp users and click Send on a row to try a claim email safely. Use Tour this page on any screen for more detail.",
    side: "bottom",
    align: "start",
  },
  {
    id: "page-tours",
    route: "/dashboard",
    element: "[data-tour='getting-started']",
    title: "More help anytime",
    description:
      "Tap Tour this page on each screen for a short local tip. The Setup checklist in the sidebar tracks what is left.",
    side: "right",
    align: "end",
  },
];

/** Local tours — only highlight UI on the current page. */
export const PAGE_TOURS: Record<Exclude<TourId, "global">, FeatureTourStep[]> = {
  dashboard: [
    {
      id: "dash-overview",
      element: "[data-tour='dashboard-stats']",
      title: "Your home base",
      description:
        "See attendees, emails, and claim rates across every event at a glance.",
      side: "bottom",
      align: "start",
    },
    {
      id: "dash-events",
      element: "[data-tour='dashboard-events']",
      title: "Jump into an event",
      description:
        "Open an event card to manage offers, guests, and emails for that meetup.",
      side: "top",
      align: "start",
    },
  ],
  settings: [
    {
      id: "settings-email",
      element: "[data-tour='settings-emailjs']",
      title: "EmailJS — required to send",
      description:
        "Paste Service ID, Template ID, and keys, then Save. Without this, claim emails cannot send.",
      side: "top",
      align: "start",
    },
    {
      id: "settings-luma",
      element: "[data-tour='settings-luma']",
      title: "Luma — for real guest lists",
      description:
        "Optional for practice. Add your City Calendar API key when you are ready to sync real attendees.",
      side: "top",
      align: "start",
    },
    {
      id: "settings-save",
      element: "[data-tour='settings-save']",
      title: "Save your keys",
      description:
        "Click Save Settings. Values stay encrypted in this browser only.",
      side: "top",
      align: "end",
    },
  ],
  "settings-guide": [
    {
      id: "guide-intro",
      element: "[data-tour='setup-guide-page']",
      title: "How to get your keys",
      description:
        "Follow these steps to create EmailJS and Luma credentials — no coding required.",
      side: "bottom",
      align: "start",
    },
    {
      id: "guide-tabs",
      element: "[data-tour='guide-tabs']",
      title: "Two guides",
      description:
        "Start with EmailJS so you can send. Switch to Luma when you need guest sync.",
      side: "bottom",
      align: "start",
    },
    {
      id: "guide-to-settings",
      element: "[data-tour='setup-guide-to-settings']",
      title: "Then paste in Settings",
      description:
        "When you have the values, go to Settings, paste them, and Save.",
      side: "left",
      align: "start",
    },
  ],
  events: [
    {
      id: "events-new",
      element: "[data-tour='new-event'], [data-tour='new-event-empty']",
      title: "Create an event",
      description:
        "Start here for each meetup. Cursor Credits is added automatically when you create it.",
      side: "bottom",
      align: "end",
    },
    {
      id: "events-list",
      element: "[data-tour='events-list'], [data-tour='events-empty']",
      title: "Your events",
      description:
        "Open an event to manage partner offers, attendees, and claim emails.",
      side: "top",
      align: "start",
    },
  ],
  "events-new": [
    {
      id: "new-form",
      element: "[data-tour='new-event-form']",
      title: "Name your meetup",
      description:
        "Enter the event name and date, then create. A Cursor Credits offer is added for you.",
      side: "right",
      align: "start",
    },
  ],
  "event-overview": [
    {
      id: "overview-status",
      element: "[data-tour='event-status']",
      title: "Draft vs Active",
      description:
        "Keep the event in Draft while testing. Going Active removes temp test data — that is expected.",
      side: "bottom",
      align: "end",
    },
    {
      id: "overview-links",
      element: "[data-tour='event-quick-links']",
      title: "Everything for this meetup",
      description:
        "Use these shortcuts for Import, Attendees, Partner Offers, and Preview & Send.",
      side: "top",
      align: "start",
    },
  ],
  attendees: [
    {
      id: "attendees-nav",
      element: "[data-tour='event-section-nav']",
      title: "Event sections",
      description:
        "Switch between Import, Attendees, Partner Offers, and Preview without leaving this event.",
      side: "bottom",
      align: "start",
    },
    {
      id: "attendees-temp",
      element: "[data-tour='create-temp-users']",
      title: "Practice with temp users",
      description:
        "In Draft, create two temp users with fake Cursor Credits links to test emails safely.",
      side: "bottom",
      align: "start",
    },
    {
      id: "attendees-send",
      element: "[data-tour='send-test-email'], [data-tour='create-temp-users']",
      title: "Send a test claim email",
      description:
        "Click Send on a row (or select rows and Send Email). Open the message and try the claim link.",
      side: "bottom",
      align: "start",
    },
  ],
  coupons: [
    {
      id: "coupons-list",
      element: "[data-tour='partner-offers']",
      title: "Partner offers",
      description:
        "Cursor Credits is created with the event. Add real credit links here before you go live.",
      side: "top",
      align: "start",
    },
    {
      id: "coupons-new",
      element: "[data-tour='new-offer']",
      title: "Add more offers",
      description:
        "Create extra partner offers if your event includes other promos besides Cursor Credits.",
      side: "left",
      align: "start",
    },
  ],
  import: [
    {
      id: "import-upload",
      element: "[data-tour='import-panel']",
      title: "Import guests",
      description:
        "Upload a Luma CSV export to add checked-in attendees. You can also sync from Luma on the Attendees page.",
      side: "top",
      align: "start",
    },
  ],
  preview: [
    {
      id: "preview-stats",
      element: "[data-tour='preview-panel']",
      title: "Preview & send",
      description:
        "Check how many emails are pending, then send or resend in bulk when you are ready.",
      side: "top",
      align: "start",
    },
  ],
};

export const TOURS: Record<TourId, FeatureTourStep[]> = {
  global: GLOBAL_TOUR_STEPS,
  ...PAGE_TOURS,
};

export function getTourSteps(tourId: TourId): FeatureTourStep[] {
  return TOURS[tourId] ?? [];
}

/** Map a pathname to a local page tour id, if one exists. */
export function tourIdForPathname(pathname: string): Exclude<TourId, "global"> | null {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname === "/settings/guide") return "settings-guide";
  if (pathname === "/settings") return "settings";
  if (pathname === "/events/new") return "events-new";
  if (pathname === "/events") return "events";
  if (/^\/events\/[^/]+\/attendees\/?$/.test(pathname)) return "attendees";
  if (/^\/events\/[^/]+\/coupons(\/[^/]+)?\/?$/.test(pathname)) return "coupons";
  if (/^\/events\/[^/]+\/import\/?$/.test(pathname)) return "import";
  if (/^\/events\/[^/]+\/preview\/?$/.test(pathname)) return "preview";
  if (/^\/events\/[^/]+\/?$/.test(pathname)) return "event-overview";
  return null;
}

export function resolveTourRoute(
  step: FeatureTourStep,
  ctx: FeatureTourContext,
  fallbackPathname: string
): string {
  if (!step.route) return fallbackPathname;
  return typeof step.route === "function" ? step.route(ctx) : step.route;
}

export function buildTourPath(
  step: FeatureTourStep,
  ctx: FeatureTourContext,
  fallbackPathname: string
): string {
  const route = resolveTourRoute(step, ctx, fallbackPathname);
  return step.hash ? `${route}${step.hash}` : route;
}

export function pathMatchesTourRoute(
  pathname: string,
  step: FeatureTourStep,
  ctx: FeatureTourContext,
  fallbackPathname: string
): boolean {
  if (!step.route) return true;
  return pathname === resolveTourRoute(step, ctx, fallbackPathname);
}
