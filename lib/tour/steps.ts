export type TourStepDef = {
  element: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

/** Spotlight orientation steps — mostly sidebar anchors present on every admin page. */
export const ORIENTATION_TOUR_STEPS: TourStepDef[] = [
  {
    element: "[data-tour='brand']",
    title: "You're in the admin area",
    description:
      "This is where community admins set up events and send partner offers to guests.",
    side: "right",
    align: "start",
  },
  {
    element: "[data-tour='nav-dashboard']",
    title: "Dashboard",
    description:
      "Your home base — see guests, emails, and claims across events at a glance.",
    side: "right",
    align: "start",
  },
  {
    element: "[data-tour='nav-events']",
    title: "Events",
    description:
      "Each meetup or conference lives here. New events already include a Cursor Credits offer.",
    side: "right",
    align: "start",
  },
  {
    element: "[data-tour='nav-settings']",
    title: "Settings — start here",
    description:
      "Connect email sending first (EmailJS). Add Luma when you're ready for real guest lists.",
    side: "right",
    align: "start",
  },
  {
    element: "[data-tour='setup-guide']",
    title: "Setup guide",
    description:
      "Not sure where the keys come from? Follow this guide — no code needed. Then paste them in Settings and save.",
    side: "right",
    align: "start",
  },
  {
    element: "[data-tour='getting-started']",
    title: "Getting started checklist",
    description:
      "These steps take you from setup to a safe test email, then live. You can replay this tour anytime from Help.",
    side: "right",
    align: "end",
  },
];
