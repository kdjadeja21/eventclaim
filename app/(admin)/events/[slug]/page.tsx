import EventDetailClient from "./event-detail-client";

type Props = { params: Promise<{ slug: string }> };

// Event data is fetched client-side from /api/events/[slug] and cached in
// localStorage, so the page keeps working (from the last successful load) even
// when Firestore is unavailable or its quota is exhausted.
export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  return <EventDetailClient slug={slug} />;
}
