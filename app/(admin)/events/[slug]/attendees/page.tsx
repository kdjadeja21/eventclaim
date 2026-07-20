import AttendeesPageClient from "./attendees-page-client";

// Bulk email sends run as Server Actions invoked from this page. Raise the
// default execution limit so larger batches have room to finish on platforms
// that honor maxDuration (e.g. Vercel). Client-side chunking keeps each call
// well under this ceiling.
export const maxDuration = 300;

type Props = { params: Promise<{ slug: string }> };

// Attendees are fetched client-side from /api/events/[slug]/attendees and
// cached in localStorage, so the page keeps working (from the last successful
// load) even when Firestore is unavailable or its quota is exhausted.
export default async function AttendeesPage({ params }: Props) {
  const { slug } = await params;
  return <AttendeesPageClient slug={slug} />;
}
