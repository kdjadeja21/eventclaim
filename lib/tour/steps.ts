export type TourRouteResolver = (ctx: FeatureTourContext) => string;

export type FeatureTourContext = {
  /** Preferred draft event for temp-user / attendees steps */
  draftEventSlug: string | null;
  /** Any event slug fallback */
  eventSlug: string | null;
};

export type FeatureTourStep = {
  id: string;
  /** Where this step should run. Relative admin path. */
  route: string | TourRouteResolver;
  /**
   * CSS selector for the spotlight target.
   * Omit for a centered intro/outro popover.
   */
  element?: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Optional hash to apply after navigation (e.g. #emailjs). */
  hash?: string;
};

function attendeesRoute(ctx: FeatureTourContext): string {
  const slug = ctx.draftEventSlug ?? ctx.eventSlug;
  return slug ? `/events/${slug}/attendees` : "/events";
}

function eventOverviewRoute(ctx: FeatureTourContext): string {
  const slug = ctx.draftEventSlug ?? ctx.eventSlug;
  return slug ? `/events/${slug}` : "/events";
}

function couponsRoute(ctx: FeatureTourContext): string {
  const slug = ctx.draftEventSlug ?? ctx.eventSlug;
  return slug ? `/events/${slug}/coupons` : "/events";
}

/**
 * End-to-end feature tour: connect tools → create event → practice send → go live.
 * Steps navigate across pages and highlight real feature UI (not just nav labels).
 */
export const FEATURE_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: "welcome",
    route: "/dashboard",
    title: "Let's send your first claim email",
    description:
      "We'll walk through the real workflow: connect email, create an event, practice with temp guests, then send a test claim email safely.",
  },
  {
    id: "open-guide",
    route: "/settings/guide",
    hash: "#emailjs",
    element: "[data-tour='setup-guide-page']",
    title: "Step 1 — Get your email keys",
    description:
      "Open the EmailJS tab and follow the steps. No coding — just copy values from EmailJS into this app. Email is required before you can send.",
    side: "bottom",
    align: "start",
  },
  {
    id: "guide-tabs",
    route: "/settings/guide",
    hash: "#emailjs",
    element: "[data-tour='guide-tabs']",
    title: "Luma can wait",
    description:
      "Use EmailJS first. Come back to the Luma tab later when you want to sync real guest lists from City Calendar events.",
    side: "bottom",
    align: "start",
  },
  {
    id: "paste-settings",
    route: "/settings",
    element: "[data-tour='settings-emailjs']",
    title: "Paste keys and Save",
    description:
      "Paste your EmailJS Service ID, Template ID, and keys here, then click Save Settings. They stay only in this browser.",
    side: "top",
    align: "start",
  },
  {
    id: "settings-save",
    route: "/settings",
    element: "[data-tour='settings-save']",
    title: "Save before continuing",
    description:
      "Click Save Settings so email sending works. You can fill Luma later — it is optional for the practice email.",
    side: "top",
    align: "end",
  },
  {
    id: "create-event-cta",
    route: "/events",
    element: "[data-tour='new-event'], [data-tour='new-event-empty']",
    title: "Step 2 — Create an event",
    description:
      "Each meetup gets its own event. A Cursor Credits offer is added automatically — you do not create that offer from scratch.",
    side: "bottom",
    align: "end",
  },
  {
    id: "new-event-form",
    route: "/events/new",
    element: "[data-tour='new-event-form']",
    title: "Name your meetup",
    description:
      "Enter the event name and date, then create it. After this, you will manage guests and emails inside that event.",
    side: "right",
    align: "start",
  },
  {
    id: "event-hub",
    route: eventOverviewRoute,
    element:
      "[data-tour='event-quick-links'], [data-tour='event-section-nav'], [data-tour='new-event']",
    title: "Step 3 — Your event workspace",
    description:
      "Inside an event you will see quick links and tabs: Partner Offers, Attendees, Import, and Preview & Send. Everything for one meetup lives here.",
    side: "bottom",
    align: "start",
  },
  {
    id: "partner-offers",
    route: couponsRoute,
    element:
      "[data-tour='partner-offers'], [data-tour='event-nav-coupons'], [data-tour='new-event']",
    title: "Cursor Credits is ready",
    description:
      "Your event already has a Cursor Credits offer. Before going live, add real credit links here. For practice emails, temp users get fake links automatically.",
    side: "bottom",
    align: "start",
  },
  {
    id: "temp-users",
    route: attendeesRoute,
    element:
      "[data-tour='create-temp-users'], [data-tour='event-nav-attendees'], [data-tour='new-event']",
    title: "Step 4 — Practice with temp users",
    description:
      "While the event is Draft, create two temp users. They are practice guests with fake Cursor Credits links so you can test safely. They are removed when you go Active.",
    side: "bottom",
    align: "start",
  },
  {
    id: "send-test-email",
    route: attendeesRoute,
    element:
      "[data-tour='send-test-email'], [data-tour='create-temp-users'], [data-tour='new-event']",
    title: "Step 5 — Send a test claim email",
    description:
      "After temp users exist, use Send on a row (or select rows and Send Email). Open the email, click the claim link, and confirm the surprise reveal works.",
    side: "bottom",
    align: "start",
  },
  {
    id: "go-live-hint",
    route: eventOverviewRoute,
    element:
      "[data-tour='event-status'], [data-tour='event-quick-links'], [data-tour='event-section-nav'], [data-tour='new-event']",
    title: "When you are ready to go live",
    description:
      "Add real credit links, import or sync real Luma guests, then set the event to Active. Leaving Draft removes temp test data — that is expected.",
    side: "bottom",
    align: "start",
  },
  {
    id: "checklist",
    route: "/dashboard",
    element: "[data-tour='getting-started']",
    title: "Your checklist stays with you",
    description:
      "Use Setup in the sidebar anytime to see what is left. Replay this tour from there if you get stuck. You are ready to continue on your own.",
    side: "right",
    align: "end",
  },
];

export function resolveTourRoute(
  step: FeatureTourStep,
  ctx: FeatureTourContext
): string {
  return typeof step.route === "function" ? step.route(ctx) : step.route;
}

export function buildTourPath(
  step: FeatureTourStep,
  ctx: FeatureTourContext
): string {
  const route = resolveTourRoute(step, ctx);
  return step.hash ? `${route}${step.hash}` : route;
}

export function pathMatchesTourRoute(
  pathname: string,
  step: FeatureTourStep,
  ctx: FeatureTourContext
): boolean {
  return pathname === resolveTourRoute(step, ctx);
}
